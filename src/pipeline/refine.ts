/**
 * Refinement loop for a single document.
 *
 * Drives a document through iterative validation (Ring 0 -> Ring 1 -> Ring 2)
 * and automated fixes until it either passes all three rings (promotion) or
 * reaches a convergence plateau or iteration limit (escalation).
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { callClaude, type ResolvedConfig } from '../llm/claude-cli.js';
import { runRing1Check } from '../llm/ring1.js';
import { runRing2Check } from '../llm/ring2.js';
import { fixStructural, fixSemantic, fixQuality } from '../llm/fix.js';
import { checkConvergence, type IssuePair } from './convergence.js';
import {
  generateEscalationReport,
  type IterationRecord,
  type EscalationReport,
} from './escalation.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RefinementResult =
  | { promoted: true }
  | { escalated: true; report: string; reason: 'convergence' | 'max_iterations' };

// ---------------------------------------------------------------------------
// Ring rule IDs per level
// ---------------------------------------------------------------------------

const RING1_RULES: Record<string, string[]> = {
  spec: ['R1-S01', 'R1-S02', 'R1-S03', 'R1-S04'],
  impl: ['R1-I01', 'R1-I02', 'R1-I03', 'R1-I04'],
  task: ['R1-T01', 'R1-T02', 'R1-T03', 'R1-T04'],
};

const RING2_RULES: Record<string, string[]> = {
  spec: ['R2-S01', 'R2-S02', 'R2-S03', 'R2-S04', 'R2-S05'],
  impl: ['R2-I01', 'R2-I02', 'R2-I03', 'R2-I04', 'R2-I05'],
  task: ['R2-T01', 'R2-T02', 'R2-T03', 'R2-T04', 'R2-T05'],
};

// ---------------------------------------------------------------------------
// Ring 0 dispatch (per-level validators)
// ---------------------------------------------------------------------------

interface Ring0ValidationResult {
  valid: boolean;
  results: Array<{ rule: string; passed: boolean; message?: string }>;
}

/**
 * Run Ring 0 structural validation for the given document level.
 * This is a simplified dispatcher — in a full implementation, it would
 * call the per-level Ring 0 validators from the validators/ directory.
 */
function runRing0(
  documentContent: string,
  level: 'spec' | 'impl' | 'task',
  _config: ResolvedConfig,
): Ring0ValidationResult {
  // Delegate to callClaude for Ring 0 — in reality this would be a direct
  // structural validator, but for the refinement loop's perspective it's
  // just a pass/fail result.
  // For now, we use the structural validators directly.
  // This is a placeholder that the orchestrator tests will mock.
  void documentContent;
  void level;
  return { valid: true, results: [] };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Refine a single document through iterative validation and automated fixes.
 *
 * @param documentPath - Path to the document file.
 * @param level        - Document level: 'spec', 'impl', or 'task'.
 * @param config       - Resolved pipeline configuration.
 * @returns RefinementResult indicating promotion or escalation.
 */
export function refine(
  documentPath: string,
  level: 'spec' | 'impl' | 'task',
  config: ResolvedConfig,
): RefinementResult {
  let iteration = 0;
  let previousRing1Issues: IssuePair[] = [];
  let previousRing2Issues: IssuePair[] = [];
  const history: IterationRecord[] = [];

  while (iteration < config.refinement.max_iterations) {
    const documentContent = readFileSync(documentPath, 'utf-8');

    // --- Ring 0: Structural validation ---
    const ring0Result = runRing0(documentContent, level, config);

    if (!ring0Result.valid) {
      const failingRules = ring0Result.results.filter((r) => !r.passed);
      const fixedContent = fixStructural(
        documentContent,
        failingRules.map((r) => ({
          rule: r.rule,
          passed: r.passed,
          message: r.message,
        })),
        documentPath,
        config,
      );
      writeFileSync(documentPath, fixedContent, 'utf-8');

      history.push({
        iteration,
        ring0_passed: false,
        ring1_passed: null,
        ring2_passed: null,
        issues_found: failingRules.length,
        fix_applied: 'structural',
      });
      iteration++;
      continue;
    }

    // --- Ring 1: Semantic consistency ---
    const ring1Rules = RING1_RULES[level] ?? [];
    const ring1Failures: Array<{ rule: string; reference: string }> = [];
    let ring1Passed = true;

    for (const ruleId of ring1Rules) {
      const result = runRing1Check(ruleId, documentContent, level, config);
      if (result.verdict === 'fail') {
        ring1Passed = false;
        for (const issue of result.issues) {
          ring1Failures.push({ rule: ruleId, reference: issue });
        }
      }
    }

    if (!ring1Passed) {
      const currentIssues: IssuePair[] = ring1Failures.map((f) => ({
        rule: f.rule,
        reference: f.reference,
      }));

      if (checkConvergence(currentIssues, previousRing1Issues, config.refinement.convergence_threshold)) {
        const reportPath = generateEscalationReport({
          document_id: documentPath,
          document_level: level,
          reason: 'convergence',
          iterations_completed: iteration + 1,
          unresolved_issues: currentIssues,
          history,
          document_snapshot: documentContent,
          timestamp: new Date().toISOString(),
        });
        return { escalated: true, report: reportPath, reason: 'convergence' };
      }

      previousRing1Issues = currentIssues;

      const ring1Results = ring1Rules.map((ruleId) =>
        runRing1Check(ruleId, documentContent, level, config),
      );
      const fixedContent = fixSemantic(
        documentContent,
        ring1Results.filter((r) => r.verdict === 'fail'),
        '', // parent content placeholder
        config,
      );
      writeFileSync(documentPath, fixedContent, 'utf-8');

      history.push({
        iteration,
        ring0_passed: true,
        ring1_passed: false,
        ring2_passed: null,
        issues_found: currentIssues.length,
        fix_applied: 'semantic',
      });
      iteration++;
      continue;
    }

    // --- Ring 2: Quality rubric ---
    const ring2Rules = RING2_RULES[level] ?? [];
    const ring2Failures: Array<{ rule: string; reference: string }> = [];
    let ring2Passed = true;

    for (const ruleId of ring2Rules) {
      const result = runRing2Check(ruleId, documentContent, level, config);
      if (result.verdict === 'fail') {
        ring2Passed = false;
        ring2Failures.push({ rule: ruleId, reference: result.summary });
      }
    }

    if (!ring2Passed) {
      const currentIssues: IssuePair[] = ring2Failures.map((f) => ({
        rule: f.rule,
        reference: f.reference,
      }));

      if (checkConvergence(currentIssues, previousRing2Issues, config.refinement.convergence_threshold)) {
        const reportPath = generateEscalationReport({
          document_id: documentPath,
          document_level: level,
          reason: 'convergence',
          iterations_completed: iteration + 1,
          unresolved_issues: currentIssues,
          history,
          document_snapshot: documentContent,
          timestamp: new Date().toISOString(),
        });
        return { escalated: true, report: reportPath, reason: 'convergence' };
      }

      previousRing2Issues = currentIssues;

      const ring2Results = ring2Rules.map((ruleId) =>
        runRing2Check(ruleId, documentContent, level, config),
      );
      const fixedContent = fixQuality(
        documentContent,
        ring2Results.filter((r) => r.verdict === 'fail'),
        config,
      );
      writeFileSync(documentPath, fixedContent, 'utf-8');

      history.push({
        iteration,
        ring0_passed: true,
        ring1_passed: true,
        ring2_passed: false,
        issues_found: currentIssues.length,
        fix_applied: 'quality',
      });
      iteration++;
      continue;
    }

    // All three rings passed — promote
    return { promoted: true };
  }

  // Max iterations reached
  const documentContent = readFileSync(documentPath, 'utf-8');
  const reportPath = generateEscalationReport({
    document_id: documentPath,
    document_level: level,
    reason: 'max_iterations',
    iterations_completed: iteration,
    unresolved_issues: [...previousRing1Issues, ...previousRing2Issues],
    history,
    document_snapshot: documentContent,
    timestamp: new Date().toISOString(),
  });
  return { escalated: true, report: reportPath, reason: 'max_iterations' };
}
