import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ResolvedConfig } from '../../src/llm/claude-cli.js';
import type { Ring1CheckResult, Ring2CheckResult } from '../../src/types/results.js';

// ---------------------------------------------------------------------------
// Mock claude-cli.ts at the module boundary — this is the key boundary
// that prevents real CLI invocations.
// ---------------------------------------------------------------------------

vi.mock('../../src/llm/claude-cli.ts', () => ({
  callClaude: vi.fn(),
  loadConfig: vi.fn((): ResolvedConfig => ({
    refinement: { max_iterations: 5, convergence_threshold: 0.7 },
    timeouts: { ring1_check_seconds: 60, ring2_check_seconds: 90, fix_call_seconds: 120 },
    claude_cli: { max_retries_on_short_429: 3, backoff_multiplier: 2, delay_between_calls_ms: 0 },
  })),
  LongRateLimitError: class extends Error {
    constructor(retryAfter: number) {
      super(`Rate limited: ${retryAfter}s`);
      this.name = 'LongRateLimitError';
    }
  },
}));

// Mock ring1 runner
vi.mock('../../src/llm/ring1.ts', () => ({
  runRing1Check: vi.fn(),
  RING1_SYSTEM_PROMPT: 'mock-system-prompt',
}));

// Mock ring2 runner
vi.mock('../../src/llm/ring2.ts', () => ({
  runRing2Check: vi.fn(),
  RING2_SYSTEM_PROMPT: 'mock-system-prompt',
}));

// Mock fix functions — return slightly different content by default
vi.mock('../../src/llm/fix.ts', () => ({
  fixStructural: vi.fn((_content: string) => 'fixed-structural-content'),
  fixSemantic: vi.fn((_content: string) => 'fixed-semantic-content'),
  fixQuality: vi.fn((_content: string) => 'fixed-quality-content'),
}));

// Mock escalation report generation
vi.mock('../../src/pipeline/escalation.ts', () => ({
  generateEscalationReport: vi.fn(() => '/mock/escalation-report.json'),
}));

// Mock refine for orchestration tests — orchestrate.ts imports refine
vi.mock('../../src/pipeline/refine.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/pipeline/refine.js')>();
  return {
    ...original,
    refine: vi.fn(original.refine),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks are declared
// ---------------------------------------------------------------------------

import { callClaude } from '../../src/llm/claude-cli.js';
import { runRing1Check } from '../../src/llm/ring1.js';
import { runRing2Check } from '../../src/llm/ring2.js';
import { fixStructural, fixSemantic, fixQuality } from '../../src/llm/fix.js';
import { generateEscalationReport } from '../../src/pipeline/escalation.js';
import { refine } from '../../src/pipeline/refine.js';
import { runPipeline } from '../../src/pipeline/orchestrate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
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
      delay_between_calls_ms: 0,
    },
    ...overrides,
  };
}

function makeRing1Pass(check: string): Ring1CheckResult {
  return { check, verdict: 'pass', issues: [] };
}

function makeRing1Fail(check: string, issueTexts: string[]): Ring1CheckResult {
  return { check, verdict: 'fail', issues: issueTexts };
}

function makeRing2Pass(check: string): Ring2CheckResult {
  return { check, dimension: check, verdict: 'pass', evidence: '', summary: 'All good' };
}

function makeRing2Fail(check: string, summary: string): Ring2CheckResult {
  return { check, dimension: check, verdict: 'fail', evidence: 'evidence', summary };
}

// Cast mocked functions
const mockedRunRing1Check = vi.mocked(runRing1Check);
const mockedRunRing2Check = vi.mocked(runRing2Check);
const mockedFixStructural = vi.mocked(fixStructural);
const mockedFixSemantic = vi.mocked(fixSemantic);
const mockedFixQuality = vi.mocked(fixQuality);
const mockedGenerateEscalationReport = vi.mocked(generateEscalationReport);
const mockedRefine = vi.mocked(refine);
const mockedCallClaude = vi.mocked(callClaude);

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'dds-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ============================================================
// Refinement Loop Tests
// ============================================================

describe('refine() — refinement loop', () => {
  /**
   * For refinement tests, we restore the real refine implementation
   * (which reads files and calls the mocked ring1/ring2 runners).
   */
  beforeEach(() => {
    mockedRefine.mockRestore();
  });

  it('promotes when all rings pass on the first iteration', () => {
    const docPath = join(tempDir, 'doc.md');
    writeFileSync(docPath, '# Test Document\n\nContent here.', 'utf-8');

    // All Ring 1 and Ring 2 checks pass
    mockedRunRing1Check.mockReturnValue(makeRing1Pass('R1-T01'));
    mockedRunRing2Check.mockReturnValue(makeRing2Pass('R2-T01'));

    const result = refine(docPath, 'task', makeConfig());

    expect(result).toEqual({ promoted: true });
    expect(mockedFixStructural).not.toHaveBeenCalled();
    expect(mockedFixSemantic).not.toHaveBeenCalled();
    expect(mockedFixQuality).not.toHaveBeenCalled();
  });

  it('escalates with reason "convergence" when Ring 1 issues repeat across iterations', () => {
    const docPath = join(tempDir, 'doc.md');
    writeFileSync(docPath, '# Test Document\n\nContent here.', 'utf-8');

    // Ring 1 always fails with the same issues
    mockedRunRing1Check.mockReturnValue(makeRing1Fail('R1-T01', ['issue-ref-a']));
    mockedRunRing2Check.mockReturnValue(makeRing2Pass('R2-T01'));
    mockedFixSemantic.mockReturnValue('fixed content');

    const config = makeConfig({
      refinement: { max_iterations: 10, convergence_threshold: 0.7 },
    });
    const result = refine(docPath, 'task', config);

    expect('escalated' in result && result.escalated).toBe(true);
    if ('escalated' in result) {
      expect(result.reason).toBe('convergence');
    }
    expect(mockedGenerateEscalationReport).toHaveBeenCalled();
  });

  it('escalates with reason "max_iterations" when issues keep changing (no convergence)', () => {
    const docPath = join(tempDir, 'doc.md');
    writeFileSync(docPath, '# Broken Document', 'utf-8');

    // Ring 1 fails with different issues each time => no convergence
    let callCount = 0;
    mockedRunRing1Check.mockImplementation(() => {
      callCount++;
      return makeRing1Fail('R1-T01', [`unique-issue-${callCount}`]);
    });
    mockedRunRing2Check.mockReturnValue(makeRing2Pass('R2-T01'));
    mockedFixSemantic.mockReturnValue('attempted fix');

    const config = makeConfig({
      refinement: { max_iterations: 3, convergence_threshold: 0.7 },
    });
    const result = refine(docPath, 'task', config);

    expect('escalated' in result && result.escalated).toBe(true);
    if ('escalated' in result) {
      expect(result.reason).toBe('max_iterations');
    }
    expect(mockedGenerateEscalationReport).toHaveBeenCalled();
  });

  it('restarts from Ring 0 after a fix — Ring 1 is re-invoked on next iteration', () => {
    const docPath = join(tempDir, 'doc.md');
    writeFileSync(docPath, '# Test Document\n\nContent.', 'utf-8');

    // Track call sequence to verify Ring 1 is re-invoked after fix
    let ring1Invocations = 0;
    mockedRunRing1Check.mockImplementation(() => {
      ring1Invocations++;
      // First 4 calls (4 Ring 1 rules on first iteration) fail
      if (ring1Invocations <= 4) {
        return makeRing1Fail('R1-T01', [`issue-${ring1Invocations}`]);
      }
      // After fix + restart from Ring 0, subsequent Ring 1 calls pass
      return makeRing1Pass('R1-T01');
    });
    mockedRunRing2Check.mockReturnValue(makeRing2Pass('R2-T01'));
    mockedFixSemantic.mockReturnValue('fixed content');

    const result = refine(docPath, 'task', makeConfig());

    expect(result).toEqual({ promoted: true });
    // Ring 1 must have been called more than the first iteration's 4 calls,
    // proving that Ring 0 -> Ring 1 restarted after the fix.
    expect(ring1Invocations).toBeGreaterThan(4);
  });

  it('escalates with "convergence" when Ring 2 issues repeat', () => {
    const docPath = join(tempDir, 'doc.md');
    writeFileSync(docPath, '# Test Document\n\nContent.', 'utf-8');

    // Ring 1 always passes
    mockedRunRing1Check.mockReturnValue(makeRing1Pass('R1-T01'));
    // Ring 2 always fails with same issues
    mockedRunRing2Check.mockReturnValue(makeRing2Fail('R2-T01', 'same-summary'));
    mockedFixQuality.mockReturnValue('quality fixed content');

    const config = makeConfig({
      refinement: { max_iterations: 10, convergence_threshold: 0.7 },
    });
    const result = refine(docPath, 'task', config);

    expect('escalated' in result && result.escalated).toBe(true);
    if ('escalated' in result) {
      expect(result.reason).toBe('convergence');
    }
  });
});

// ============================================================
// Orchestration Tests
// ============================================================

describe('runPipeline() — orchestration', () => {
  it('completes all four phases when everything passes (happy path)', () => {
    // Mock refine to always promote
    mockedRefine.mockReturnValue({ promoted: true });

    const config = makeConfig();
    // Pass empty impl docs array so Phase 2 has nothing to process
    const result = runPipeline('spec-happy', config, []);

    expect(result.status).toBe('completed');
    expect(result.phase).toBe(4);
    expect(result.rootSpecId).toBe('spec-happy');
    // refine should have been called at least once (for the spec)
    expect(mockedRefine).toHaveBeenCalled();
  });

  it('halts at Phase 1 when spec validation escalates', () => {
    // Mock refine to escalate on first call (spec)
    mockedRefine.mockReturnValue({
      escalated: true,
      report: '/mock/escalation-report.json',
      reason: 'convergence' as const,
    });

    const config = makeConfig();
    const result = runPipeline('spec-bad', config);

    expect(result.status).toBe('escalated');
    expect(result.phase).toBe(1);
    expect(result.stats.escalationCount).toBe(1);
  });

  it('halts at Phase 2 when an impl doc validation escalates', () => {
    // First call (spec) promotes, second call (impl) escalates
    mockedRefine
      .mockReturnValueOnce({ promoted: true })
      .mockReturnValueOnce({
        escalated: true,
        report: '/mock/escalation-report.json',
        reason: 'convergence' as const,
      });

    const config = makeConfig();
    const result = runPipeline('spec-p2halt', config, ['impl-test001']);

    expect(result.status).toBe('escalated');
    expect(result.phase).toBe(2);
  });

  it('does not reach Phase 3 or 4 when Phase 2 escalates', () => {
    mockedRefine
      .mockReturnValueOnce({ promoted: true }) // Phase 1
      .mockReturnValueOnce({
        escalated: true,
        report: '/mock/escalation-report.json',
        reason: 'max_iterations' as const,
      }); // Phase 2

    const config = makeConfig();
    const result = runPipeline('spec-stop', config, ['impl-a']);

    expect(result.phase).toBeLessThanOrEqual(2);
    expect(result.status).toBe('escalated');
    // refine was called exactly twice: once for spec, once for impl
    expect(mockedRefine).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// Verification: No real Claude CLI calls
// ============================================================

describe('mock verification', () => {
  it('callClaude is mocked and never invokes the real CLI', () => {
    // callClaude is mocked at the module boundary via vi.mock
    expect(vi.isMockFunction(mockedCallClaude)).toBe(true);
    // It should not have been called with real arguments that would spawn a process
    // (all tests use the mocked ring1/ring2 runners which are also mocked)
  });

  it('runRing1Check is mocked at the module boundary', () => {
    expect(vi.isMockFunction(mockedRunRing1Check)).toBe(true);
  });

  it('runRing2Check is mocked at the module boundary', () => {
    expect(vi.isMockFunction(mockedRunRing2Check)).toBe(true);
  });
});
