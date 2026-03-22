/**
 * Ring 1 — Semantic Consistency check runner.
 *
 * Bridges per-level Ring 1 prompt templates with the Claude CLI wrapper.
 * Prepends the shared Ring 1 system prompt, dispatches to the correct
 * per-level prompt template function, invokes callClaude(), and returns
 * the parsed Ring1CheckResult.
 */

import { callClaude, type ResolvedConfig } from './claude-cli.js';
import type { Ring1CheckResult } from '../types/results.js';

// Per-level prompt template imports — task level
import {
  buildCoverageCompletenessPrompt,
  buildContradictionDetectionPrompt,
  buildScopeCoherencePrompt,
  buildDependencyCorrectnessPrompt,
} from '../validators/task/ring1.js';

// ---------------------------------------------------------------------------
// Shared Ring 1 System Prompt (from docs/04-validation-pipeline.md)
// ---------------------------------------------------------------------------

export const RING1_SYSTEM_PROMPT = `You are a document validation engine. Your job is to check a specific
property of the provided documents. You must:

1. Answer ONLY the question asked. Do not provide general feedback,
   suggestions, or commentary.
2. Output valid JSON matching the specified schema.
3. If no issues are found, return an empty issues array with verdict
   "pass".
4. For each issue found, provide a specific reference (section,
   requirement ID, or line) and a concrete description of the problem.
5. Do not suggest improvements. Only report violations of the specific
   property being checked.
6. Be thorough. Check every item, not just the first few.`;

// ---------------------------------------------------------------------------
// Ring 1 Result JSON Schema (for callClaude validation)
// ---------------------------------------------------------------------------

const RING1_RESULT_SCHEMA = {
  type: 'object',
  required: ['check', 'verdict', 'issues'],
  additionalProperties: false,
  properties: {
    check: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['reference', 'description'],
        additionalProperties: false,
        properties: {
          reference: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Per-level prompt dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch table mapping (level, ruleId) to prompt-building functions.
 *
 * Task-level prompt templates are imported from src/validators/task/ring1.ts.
 * Spec-level and impl-level templates will be added when their respective
 * Impl Doc modules are implemented.
 */

interface Ring1PromptBuilder {
  (documentContent: string, ...extra: string[]): string;
}

function getTaskRing1Prompt(
  ruleId: string,
  documentContent: string,
): string {
  switch (ruleId) {
    case 'R1-T01':
      // Coverage completeness: documentContent should contain impl content
      // followed by a separator and task descriptions.
      // The runner passes the combined document content; the prompt builder
      // expects (implContent, taskDescriptions[]).
      return buildCoverageCompletenessPrompt(documentContent, []);
    case 'R1-T02':
      return buildContradictionDetectionPrompt([documentContent]);
    case 'R1-T03':
      // Scope coherence: needs scopeFiles and approach text
      return buildScopeCoherencePrompt([], documentContent);
    case 'R1-T04':
      return buildDependencyCorrectnessPrompt(documentContent, []);
    default:
      throw new Error(
        `Unknown task-level Ring 1 rule: ${ruleId}`,
      );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a single Ring 1 semantic consistency check.
 *
 * @param ruleId - The rule identifier (e.g., "R1-T01", "R1-S01")
 * @param documentContent - The document content to validate
 * @param level - The document level: 'spec', 'impl', or 'task'
 * @param config - Resolved pipeline configuration
 * @returns Parsed Ring1CheckResult from the LLM
 */
export function runRing1Check(
  ruleId: string,
  documentContent: string,
  level: 'spec' | 'impl' | 'task',
  config: ResolvedConfig,
): Ring1CheckResult {
  // Dispatch to the correct per-level prompt template
  let perLevelPrompt: string;

  switch (level) {
    case 'task':
      perLevelPrompt = getTaskRing1Prompt(ruleId, documentContent);
      break;
    case 'spec':
      throw new Error(
        'Spec-level Ring 1 prompt templates are not yet implemented.',
      );
    case 'impl':
      throw new Error(
        'Impl-level Ring 1 prompt templates are not yet implemented.',
      );
    default: {
      const _exhaustive: never = level;
      throw new Error(`Unknown document level: ${_exhaustive}`);
    }
  }

  // Prepend the shared Ring 1 system prompt
  const combinedPrompt = `${RING1_SYSTEM_PROMPT}\n\n${perLevelPrompt}`;

  // Invoke the Claude CLI wrapper with the Ring 1 timeout
  return callClaude<Ring1CheckResult>(
    combinedPrompt,
    RING1_RESULT_SCHEMA,
    config,
    config.timeouts.ring1_check_seconds,
  );
}
