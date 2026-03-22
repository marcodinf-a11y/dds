import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import AjvModule from 'ajv';
const Ajv = AjvModule.default ?? AjvModule;

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  _description?: string;
  refinement?: {
    max_iterations?: number;
    convergence_threshold?: number;
  };
  timeouts?: {
    ring1_check_seconds?: number;
    ring2_check_seconds?: number;
    fix_call_seconds?: number;
  };
  claude_cli?: {
    max_retries_on_short_429?: number;
    backoff_multiplier?: number;
    delay_between_calls_ms?: number;
  };
}

export interface ResolvedConfig {
  refinement: {
    max_iterations: number;
    convergence_threshold: number;
  };
  timeouts: {
    ring1_check_seconds: number;
    ring2_check_seconds: number;
    fix_call_seconds: number;
  };
  claude_cli: {
    max_retries_on_short_429: number;
    backoff_multiplier: number;
    delay_between_calls_ms: number;
  };
}

const DEFAULTS: ResolvedConfig = {
  refinement: {
    max_iterations: 5,
    convergence_threshold: 0.7,
  },
  timeouts: {
    ring1_check_seconds: 60,
    ring2_check_seconds: 90,
    fix_call_seconds: 120,
  },
  claude_cli: {
    max_retries_on_short_429: 3,
    backoff_multiplier: 2,
    delay_between_calls_ms: 2000,
  },
};

const CONFIG_PATH = resolve('pipeline/config.json');
const SCHEMA_PATH = resolve('src/schemas/pipeline-config.schema.json');

/**
 * Load pipeline configuration from pipeline/config.json (if it exists),
 * validate it against the JSON Schema, and merge with compiled-in defaults.
 */
export function loadConfig(): ResolvedConfig {
  if (!existsSync(CONFIG_PATH)) {
    return structuredClone(DEFAULTS);
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed: PipelineConfig = JSON.parse(raw);

  const schemaRaw = readFileSync(SCHEMA_PATH, 'utf-8');
  const schema = JSON.parse(schemaRaw);

  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  if (!validate(parsed)) {
    const msg = validate.errors
      ?.map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`)
      .join('; ');
    throw new Error(`pipeline/config.json validation failed: ${msg}`);
}

  return {
    refinement: {
      max_iterations:
        parsed.refinement?.max_iterations ?? DEFAULTS.refinement.max_iterations,
      convergence_threshold:
        parsed.refinement?.convergence_threshold ??
        DEFAULTS.refinement.convergence_threshold,
    },
    timeouts: {
      ring1_check_seconds:
        parsed.timeouts?.ring1_check_seconds ??
        DEFAULTS.timeouts.ring1_check_seconds,
      ring2_check_seconds:
        parsed.timeouts?.ring2_check_seconds ??
        DEFAULTS.timeouts.ring2_check_seconds,
      fix_call_seconds:
        parsed.timeouts?.fix_call_seconds ??
        DEFAULTS.timeouts.fix_call_seconds,
    },
    claude_cli: {
      max_retries_on_short_429:
        parsed.claude_cli?.max_retries_on_short_429 ??
        DEFAULTS.claude_cli.max_retries_on_short_429,
      backoff_multiplier:
        parsed.claude_cli?.backoff_multiplier ??
        DEFAULTS.claude_cli.backoff_multiplier,
      delay_between_calls_ms:
        parsed.claude_cli?.delay_between_calls_ms ??
        DEFAULTS.claude_cli.delay_between_calls_ms,
    },
  };
}

// ---------------------------------------------------------------------------
// Claude CLI Invocation
// ---------------------------------------------------------------------------

export class LongRateLimitError extends Error {
  constructor(retryAfterSeconds: number) {
    super(
      `Rate limited with retry-after ${retryAfterSeconds}s (> 60s). Aborting.`,
    );
    this.name = 'LongRateLimitError';
  }
}

/** Module-level timestamp of the last call, used to enforce inter-call delay. */
let lastCallTimestamp = 0;

/**
 * Invoke the `claude` CLI with a prompt, validate the JSON response against
 * the provided schema, and return the parsed result.
 *
 * Handles:
 * - Inter-call delay (delay_between_calls_ms)
 * - Short 429 (retry-after <= 60s): retries with exponential backoff
 * - Long 429 (retry-after > 60s): throws LongRateLimitError immediately
 */
export function callClaude<T = unknown>(
  prompt: string,
  jsonSchema: object,
  config: ResolvedConfig,
  timeoutSeconds: number,
): T {
  const {
    max_retries_on_short_429: maxRetries,
    backoff_multiplier: multiplier,
    delay_between_calls_ms: delayMs,
  } = config.claude_cli;

  // Enforce inter-call delay
  const elapsed = Date.now() - lastCallTimestamp;
  if (lastCallTimestamp > 0 && elapsed < delayMs) {
    sleepMs(delayMs - elapsed);
  }

  const schemaArg = JSON.stringify(jsonSchema);
  const timeoutMs = timeoutSeconds * 1000;

  let attempt = 0;
  let backoffMs = 1000;

  while (true) {
    try {
      lastCallTimestamp = Date.now();

      const stdout = execSync(
        `claude -p ${shellQuote(prompt)} --output-format json --json-schema ${shellQuote(schemaArg)} --max-turns 1`,
        { timeout: timeoutMs, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );

      const wrapper = JSON.parse(stdout);

      // Claude CLI with --output-format json returns a wrapper object.
      // The actual LLM response is in the `result` field as a string.
      const rawResult = typeof wrapper === 'object' && wrapper !== null && 'result' in wrapper
        ? wrapper.result
        : wrapper;

      // The result may be a string (possibly with markdown code fences) or already parsed JSON
      let parsed: unknown;
      if (typeof rawResult === 'string') {
        // Strip markdown code fences if present
        const cleaned = rawResult.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
        parsed = JSON.parse(cleaned);
      } else {
        parsed = rawResult;
      }

      // Double-validate with ajv
      const ajv = new Ajv();
      const validate = ajv.compile(jsonSchema);
      if (!validate(parsed)) {
        const msg = validate.errors
          ?.map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`)
          .join('; ');
        throw new Error(`Response schema validation failed: ${msg}`);
      }

      return parsed as T;
    } catch (err: unknown) {
      const retryAfter = parseRetryAfter(err);

      if (retryAfter !== null) {
        // Long 429: abort immediately
        if (retryAfter > 60) {
          throw new LongRateLimitError(retryAfter);
        }

        // Short 429: retry with exponential backoff
        if (attempt < maxRetries) {
          attempt++;
          const waitMs = Math.max(retryAfter * 1000, backoffMs);
          sleepMs(waitMs);
          backoffMs *= multiplier;
          continue;
        }
      }

      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Attempt to extract a retry-after value (in seconds) from an error thrown
 * by execSync. Looks for patterns like "retry-after: 30" or "retry after 30s"
 * or "429" with a seconds indicator in stderr/stdout.
 */
function parseRetryAfter(err: unknown): number | null {
  if (!(err instanceof Error)) return null;

  const text =
    (err as NodeJS.ErrnoException & { stderr?: string | Buffer }).stderr?.toString() ??
    err.message;

  if (!text.includes('429') && !text.toLowerCase().includes('rate limit')) {
    return null;
  }

  // Match "retry-after: <N>" or "retry after <N>" (case-insensitive)
  const match = text.match(/retry[- ]after[:\s]*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  // 429 detected but no retry-after value: use a sensible default
  return 5;
}
