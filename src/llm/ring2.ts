/**
 * Ring 2 — Quality Rubric check runner.
 *
 * Bridges per-level Ring 2 prompt templates with the Claude CLI wrapper.
 * Prepends the shared Ring 2 system prompt, dispatches to the correct
 * per-level prompt template function, invokes callClaude(), and returns
 * the parsed Ring2CheckResult.
 */

import { callClaude, type ResolvedConfig } from './claude-cli.js';
import type { Ring2CheckResult } from '../types/results.js';

// Per-level prompt template imports — task level
import {
  buildActionabilityPrompt,
  buildScopeBoundednessPrompt,
  buildApproachSpecificityPrompt,
  buildConstraintTestabilityPrompt,
  buildCriterionCompletenessPrompt,
} from '../validators/task/ring2.js';

// Per-level prompt template imports — spec level
import {
  buildR2S01Prompt,
  buildR2S02Prompt,
  buildR2S03Prompt,
} from '../validators/spec/ring2.js';

// Per-level prompt template imports — impl level
import {
  buildDecomposabilityPrompt,
  buildRequirementTestabilityPrompt,
  buildBackgroundSufficiencyPrompt,
  buildDesignDecisionCompletenessPrompt,
  buildBoundaryPrompt,
  buildDecompositionNotesQualityPrompt,
} from '../validators/impl/ring2.js';

// ---------------------------------------------------------------------------
// Shared Ring 2 System Prompt (from docs/04-validation-pipeline.md)
// ---------------------------------------------------------------------------

export const RING2_SYSTEM_PROMPT = `You are a document quality assessor. You evaluate a single quality
dimension using the rubric provided. You must:

1. Evaluate ONLY the dimension described. Do not assess other
   qualities.
2. Provide a clear PASS or FAIL verdict.
3. Support your verdict with specific evidence from the document.
4. If FAIL, list every instance that caused the failure.
5. Be strict. "Probably fine" is not PASS. If you are uncertain,
   FAIL with an explanation of what is ambiguous.
6. Assess each element individually where the rubric calls for it.`;

// ---------------------------------------------------------------------------
// Ring 2 Result JSON Schema (for callClaude validation)
// ---------------------------------------------------------------------------

const RING2_RESULT_SCHEMA = {
  type: 'object',
  required: ['check', 'dimension', 'verdict', 'evidence', 'summary'],
  additionalProperties: false,
  properties: {
    check: { type: 'string' },
    dimension: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['reference', 'finding', 'assessment'],
        additionalProperties: false,
        properties: {
          reference: { type: 'string' },
          finding: { type: 'string' },
          assessment: { type: 'string', enum: ['pass', 'fail'] },
        },
      },
    },
    summary: { type: 'string' },
  },
} as const;

// ---------------------------------------------------------------------------
// Per-level prompt dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch table mapping (level, ruleId) to prompt-building functions.
 *
 * Task-level prompt templates are imported from src/validators/task/ring2.ts.
 * Spec-level and impl-level templates will be added when their respective
 * Impl Doc modules are implemented.
 */

function getTaskRing2Prompt(
  ruleId: string,
  documentContent: string,
): string {
  switch (ruleId) {
    case 'R2-T01':
      return buildActionabilityPrompt(documentContent);
    case 'R2-T02':
      return buildScopeBoundednessPrompt(documentContent);
    case 'R2-T03':
      return buildApproachSpecificityPrompt(documentContent);
    case 'R2-T04':
      return buildConstraintTestabilityPrompt(documentContent);
    case 'R2-T05':
      // Criterion completeness needs approach and criteria separately;
      // when called through the generic runner, documentContent contains
      // the full task description from which both can be extracted.
      return buildCriterionCompletenessPrompt(documentContent, '');
    default:
      throw new Error(
        `Unknown task-level Ring 2 rule: ${ruleId}`,
      );
  }
}

function getSpecRing2Prompt(
  ruleId: string,
  documentContent: string,
): string {
  switch (ruleId) {
    case 'R2-S01':
      return buildR2S01Prompt(documentContent);
    case 'R2-S02':
      return buildR2S02Prompt(documentContent);
    case 'R2-S03':
      return buildR2S03Prompt(documentContent);
    default:
      throw new Error(
        `Unknown spec-level Ring 2 rule: ${ruleId}`,
      );
  }
}

function getImplRing2Prompt(
  ruleId: string,
  documentContent: string,
): string {
  switch (ruleId) {
    case 'R2-I10':
      return buildDecomposabilityPrompt(documentContent);
    case 'R2-I11':
      return buildRequirementTestabilityPrompt(documentContent);
    case 'R2-I12':
      return buildBackgroundSufficiencyPrompt(documentContent);
    case 'R2-I13':
      return buildDesignDecisionCompletenessPrompt(documentContent);
    case 'R2-I14':
      return buildBoundaryPrompt(documentContent);
    case 'R2-I15':
      return buildDecompositionNotesQualityPrompt(documentContent);
    default:
      throw new Error(
        `Unknown impl-level Ring 2 rule: ${ruleId}`,
      );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a single Ring 2 quality rubric check.
 *
 * @param ruleId - The rule identifier (e.g., "R2-T01", "R2-S01")
 * @param documentContent - The document content to validate
 * @param level - The document level: 'spec', 'impl', or 'task'
 * @param config - Resolved pipeline configuration
 * @returns Parsed Ring2CheckResult from the LLM
 */
export function runRing2Check(
  ruleId: string,
  documentContent: string,
  level: 'spec' | 'impl' | 'task',
  config: ResolvedConfig,
): Ring2CheckResult {
  // Dispatch to the correct per-level prompt template
  let perLevelPrompt: string;

  switch (level) {
    case 'task':
      perLevelPrompt = getTaskRing2Prompt(ruleId, documentContent);
      break;
    case 'spec':
      perLevelPrompt = getSpecRing2Prompt(ruleId, documentContent);
      break;
    case 'impl':
      perLevelPrompt = getImplRing2Prompt(ruleId, documentContent);
      break;
    default: {
      const _exhaustive: never = level;
      throw new Error(`Unknown document level: ${_exhaustive}`);
    }
  }

  // Prepend the shared Ring 2 system prompt
  const combinedPrompt = `${RING2_SYSTEM_PROMPT}\n\n${perLevelPrompt}`;

  // Invoke the Claude CLI wrapper with the Ring 2 timeout
  return callClaude<Ring2CheckResult>(
    combinedPrompt,
    RING2_RESULT_SCHEMA,
    config,
    config.timeouts.ring2_check_seconds,
  );
}
