/**
 * Refinement loop for the validation pipeline.
 *
 * Drives a single document through iterative validation (Ring 0 -> Ring 1 ->
 * Ring 2) and automated fixes until it either passes all three rings
 * (promotion) or reaches a convergence plateau or iteration limit (escalation).
 *
 * Implements the `refine()` pseudocode from docs/04-validation-pipeline.md.
 */

import * as fs from "node:fs";

import type { ResolvedConfig } from "../llm/claude-cli.js";
import { runRing1Check } from "../llm/ring1.js";
import { runRing2Check } from "../llm/ring2.js";
import { fixStructural, fixSemantic, fixQuality } from "../llm/fix.js";
import { checkConvergence, type IssuePair } from "./convergence.js";
import {
  generateEscalationReport,
  type IterationRecord,
  type EscalationReport,
} from "./escalation.js";

// Per-level Ring 0 validators
import { validateTaskRing0 } from "../validators/task/ring0.js";
import { validateSpecRing0 } from "../validators/spec/ring0.js";
import {
  validateImplRing0,
  type ImplValidationContext,
} from "../validators/impl/ring0.js";
import type { SpecDefinition, ImplDefinition } from "../types/definitions.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a refinement run: either promoted (all rings pass) or escalated. */
export type RefinementResult =
  | { promoted: true }
  | { escalated: true; report: string };

/** Document levels supported by the refinement loop. */
export type DocumentLevel = "spec" | "impl" | "task";

// ---------------------------------------------------------------------------
// Per-level Ring 1 / Ring 2 rule ID tables
// ---------------------------------------------------------------------------

/**
 * Rule IDs per level. The refinement loop iterates over all applicable rules
 * for the document's level, running each check in order.
 */
const RING1_RULES: Record<DocumentLevel, string[]> = {
  spec: ["R1-S01", "R1-S02", "R1-S03", "R1-S04"],
  impl: ["R1-I10", "R1-I11", "R1-I12", "R1-I13", "R1-I14", "R1-I15"],
  task: ["R1-T01", "R1-T02", "R1-T03", "R1-T04"],
};

const RING2_RULES: Record<DocumentLevel, string[]> = {
  spec: ["R2-S01", "R2-S02", "R2-S03"],
  impl: ["R2-I10", "R2-I11", "R2-I12", "R2-I13", "R2-I14", "R2-I15"],
  task: ["R2-T01", "R2-T02", "R2-T03", "R2-T04", "R2-T05"],
};

// ---------------------------------------------------------------------------
// Ring 0 dispatch
// ---------------------------------------------------------------------------

interface Ring0Failure {
  rule: string;
  passed: boolean;
  message?: string;
}

interface Ring0RunResult {
  passed: boolean;
  failures: Ring0Failure[];
}

/**
 * Run Ring 0 structural validation for the given document level.
 *
 * For task-level documents, calls the full `validateTaskRing0` validator.
 * For spec and impl levels, throws until those validators are implemented.
 *
 * Ring 0 validators are deterministic and do not call the LLM.
 */
function runRing0(
  documentContent: string,
  level: DocumentLevel,
  documentPath: string,
): Ring0RunResult {
  switch (level) {
    case "task": {
      // Task Ring 0 needs the JSON definition and the markdown content.
      // The refinement loop operates on the markdown description file.
      // We parse a minimal TaskDefinition stub from the filename for ID,
      // but the full validator needs richer context. For the refinement
      // loop, we treat the document content as markdown and run a
      // lightweight structural check.
      //
      // The full validateTaskRing0 requires (TaskDefinition, markdown,
      // TaskValidationContext). Since the refinement loop only has the
      // file path, we pass the content through and check markdown structure.
      // The JSON definition validation is handled separately by the
      // orchestrator before entering the refinement loop.

      // Import and run the task Ring 0 markdown structural checks.
      // We build a minimal TaskDefinition from the document path for the
      // ID-based checks.
      const taskId = extractTaskIdFromPath(documentPath);
      const minimalTask = {
        id: taskId,
        parent: "impl-00000000",
        description: `${taskId}.md`,
        blocked_by: [] as string[],
        blocks: [] as string[],
        scope: { files: [documentPath], modules: ["unknown"] },
        acceptance_criteria: [],
        context_refs: ["spec-00000000#placeholder"],
      };
      const minimalContext = {
        siblingTasks: [],
        existingTaskIds: new Set<string>(),
        parentImplId: "impl-00000000",
        descriptionFileExists: true,
      };

      const result = validateTaskRing0(
        minimalTask,
        documentContent,
        minimalContext,
      );

      const failures = result.results
        .filter((r) => !r.passed)
        .map((r) => ({
          rule: r.rule,
          passed: false,
          message: r.message,
        }));

      return { passed: result.valid, failures };
    }
    case "spec": {
      const jsonPath = documentPath.replace(/\.md$/, ".json");
      const spec: SpecDefinition = JSON.parse(
        fs.readFileSync(jsonPath, "utf-8"),
      );
      const result = validateSpecRing0(spec, documentContent);

      const failures = result.results
        .filter((r) => !r.passed)
        .map((r) => ({
          rule: r.rule,
          passed: false,
          message: r.message,
        }));

      return { passed: result.valid, failures };
    }
    case "impl": {
      const jsonPath = documentPath.replace(/\.md$/, ".json");
      const impl: ImplDefinition = JSON.parse(
        fs.readFileSync(jsonPath, "utf-8"),
      );
      const context: ImplValidationContext = {
        existingImplIds: [],
        existingTaskIds: [],
        taskDefinitions: [],
        dependencyGraph: [],
      };
      const result = validateImplRing0(impl, documentContent, context);

      const failures = result.results
        .filter((r) => !r.passed)
        .map((r) => ({
          rule: r.rule,
          passed: false,
          message: r.message,
        }));

      return { passed: result.valid, failures };
    }
    default: {
      const _exhaustive: never = level;
      throw new Error(`Unknown document level: ${_exhaustive}`);
    }
  }
}

/**
 * Extract a task ID from a file path.
 * Expects paths like `.../at-XXXXXXXX.md` or `.../at-XXXXXXXX.json`.
 */
function extractTaskIdFromPath(filePath: string): string {
  const match = filePath.match(/(at-[0-9a-f]{8})/);
  return match ? match[1] : "at-00000000";
}

// ---------------------------------------------------------------------------
// Issue extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract (rule, reference) pairs from Ring 1 check results for convergence
 * tracking. Each issue object from a Ring1CheckResult becomes a pair with
 * the check's rule ID and the issue's reference field.
 */
function extractRing1Issues(
  results: Array<{ check: string; verdict: string; issues: Array<{ reference: string; description: string }> }>,
): IssuePair[] {
  const pairs: IssuePair[] = [];
  for (const result of results) {
    if (result.verdict === "fail") {
      for (const issue of result.issues) {
        pairs.push({ rule: result.check, reference: issue.reference });
      }
    }
  }
  return pairs;
}

/**
 * Extract (rule, reference) pairs from Ring 2 check results for convergence
 * tracking. Each evidence object from a Ring2CheckResult becomes a pair with
 * the check's rule ID and the evidence's reference field.
 */
function extractRing2Issues(
  results: Array<{
    check: string;
    verdict: string;
    summary: string;
    evidence: Array<{ reference: string; finding: string; assessment: string }>;
  }>,
): IssuePair[] {
  const pairs: IssuePair[] = [];
  for (const result of results) {
    if (result.verdict === "fail") {
      for (const ev of result.evidence) {
        pairs.push({ rule: result.check, reference: ev.reference });
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Refine a single document through iterative validation and automated fixes.
 *
 * Implements the refinement loop from docs/04-validation-pipeline.md:
 * 1. Run Ring 0 (structural). On failure: fix and restart from Ring 0.
 * 2. Run Ring 1 (semantic). On failure: check convergence, fix and restart.
 * 3. Run Ring 2 (quality). On failure: check convergence, fix and restart.
 *    If all three pass: promote.
 * 4. On convergence or max iterations: escalate.
 *
 * @param documentPath - Path to the document file on disk.
 * @param level - Document level: 'spec', 'impl', or 'task'.
 * @param config - Resolved pipeline configuration.
 * @returns RefinementResult indicating promotion or escalation.
 */
export function refine(
  documentPath: string,
  level: DocumentLevel,
  config: ResolvedConfig,
): RefinementResult {
  const maxIterations = config.refinement.max_iterations;
  const convergenceThreshold = config.refinement.convergence_threshold;

  let iteration = 0;
  let previousRing1Issues: IssuePair[] = [];
  let previousRing2Issues: IssuePair[] = [];
  const history: IterationRecord[] = [];

  while (iteration < maxIterations) {
    iteration++;

    // Read the current document content from disk.
    const documentContent = fs.readFileSync(documentPath, "utf-8");

    // --- Ring 0: Structural validation ---
    const ring0Result = runRing0(documentContent, level, documentPath);

    if (!ring0Result.passed) {
      // Fix structural issues and write back to disk.
      const fixed = fixStructural(
        documentContent,
        ring0Result.failures,
        documentPath,
        config,
      );
      fs.writeFileSync(documentPath, fixed, "utf-8");

      history.push({
        iteration,
        ring0_passed: false,
        ring1_passed: null,
        ring2_passed: null,
        issues_found: ring0Result.failures.length,
        fix_applied: "structural",
      });

      // Restart from Ring 0.
      continue;
    }

    // --- Ring 1: Semantic consistency ---
    const ring1Rules = RING1_RULES[level];
    const ring1Results = ring1Rules.map((ruleId) =>
      runRing1Check(ruleId, documentContent, level, config),
    );

    const ring1Failures = ring1Results.filter((r) => r.verdict === "fail");

    if (ring1Failures.length > 0) {
      const currentRing1Issues = extractRing1Issues(ring1Results);

      // Check convergence against previous Ring 1 issues.
      if (
        checkConvergence(
          currentRing1Issues,
          previousRing1Issues,
          convergenceThreshold,
        )
      ) {
        // Convergence detected — escalate.
        const report = generateEscalationReport({
          document_id: extractDocumentId(documentPath),
          document_level: level,
          reason: "convergence",
          iterations_completed: iteration,
          unresolved_issues: currentRing1Issues,
          history,
          document_snapshot: documentPath,
          timestamp: new Date().toISOString(),
        });

        return { escalated: true, report };
      }

      // Update previous issues for next iteration's convergence check.
      previousRing1Issues = currentRing1Issues;

      // Fix semantic issues and write back to disk.
      // fixSemantic needs parent content; pass empty string as placeholder
      // since parent resolution is handled by the orchestrator.
      const fixed = fixSemantic(documentContent, ring1Results, "", config);
      fs.writeFileSync(documentPath, fixed, "utf-8");

      history.push({
        iteration,
        ring0_passed: true,
        ring1_passed: false,
        ring2_passed: null,
        issues_found: ring1Failures.length,
        fix_applied: "semantic",
      });

      // Restart from Ring 0.
      continue;
    }

    // --- Ring 2: Quality rubric ---
    const ring2Rules = RING2_RULES[level];
    const ring2Results = ring2Rules.map((ruleId) =>
      runRing2Check(ruleId, documentContent, level, config),
    );

    const ring2Failures = ring2Results.filter((r) => r.verdict === "fail");

    if (ring2Failures.length === 0) {
      // All three rings pass — promote.
      return { promoted: true };
    }

    // Ring 2 has failures.
    const currentRing2Issues = extractRing2Issues(ring2Results);

    // Check convergence against previous Ring 2 issues.
    if (
      checkConvergence(
        currentRing2Issues,
        previousRing2Issues,
        convergenceThreshold,
      )
    ) {
      // Convergence detected — escalate.
      const report = generateEscalationReport({
        document_id: extractDocumentId(documentPath),
        document_level: level,
        reason: "convergence",
        iterations_completed: iteration,
        unresolved_issues: currentRing2Issues,
        history,
        document_snapshot: documentPath,
        timestamp: new Date().toISOString(),
      });

      return { escalated: true, report };
    }

    // Update previous issues for next iteration's convergence check.
    previousRing2Issues = currentRing2Issues;

    // Fix quality issues and write back to disk.
    const fixed = fixQuality(documentContent, ring2Results, config);
    fs.writeFileSync(documentPath, fixed, "utf-8");

    history.push({
      iteration,
      ring0_passed: true,
      ring1_passed: true,
      ring2_passed: false,
      issues_found: ring2Failures.length,
      fix_applied: "quality",
    });

    // Restart from Ring 0.
    continue;
  }

  // Max iterations reached — escalate.
  const lastDocumentContent = fs.readFileSync(documentPath, "utf-8");
  // Collect all unresolved issues from the last available data.
  const unresolvedIssues: IssuePair[] = [
    ...previousRing1Issues,
    ...previousRing2Issues,
  ];

  const report = generateEscalationReport({
    document_id: extractDocumentId(documentPath),
    document_level: level,
    reason: "max_iterations",
    iterations_completed: iteration,
    unresolved_issues:
      unresolvedIssues.length > 0
        ? unresolvedIssues
        : [{ rule: "unknown", reference: "Max iterations exhausted" }],
    history,
    document_snapshot: documentPath,
    timestamp: new Date().toISOString(),
  });

  return { escalated: true, report };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a document ID from a file path.
 * Matches patterns like spec-XXXXXXXX, impl-XXXXXXXX, at-XXXXXXXX.
 */
function extractDocumentId(filePath: string): string {
  const match = filePath.match(/((?:spec|impl|at)-[0-9a-f]{8})/);
  return match ? match[1] : "unknown";
}
