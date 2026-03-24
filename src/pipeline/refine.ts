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
import * as path from "node:path";

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
import type { SpecDefinition, ImplDefinition, TaskDefinition } from "../types/definitions.js";

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
      // Read the real task JSON definition from disk if available,
      // otherwise fall back to a minimal stub (e.g., during tests)
      const taskJsonPath = documentPath.replace("/descriptions/", "/definitions/").replace(/\.md$/, ".json");
      let taskDef: TaskDefinition;
      try {
        taskDef = JSON.parse(fs.readFileSync(taskJsonPath, "utf-8"));
      } catch {
        const taskId = extractTaskIdFromPath(documentPath);
        taskDef = {
          id: taskId,
          parent: "impl-00000000",
          description: `${taskId}.md`,
          blocked_by: [],
          blocks: [],
          scope: { files: [documentPath], modules: ["unknown"] },
          acceptance_criteria: [],
          context_refs: ["spec-00000000#placeholder"],
        } as TaskDefinition;
      }

      // Build context by scanning existing task definitions on disk
      const taskDefsDir = path.dirname(taskJsonPath);
      const allTaskFiles = fs.existsSync(taskDefsDir)
        ? fs.readdirSync(taskDefsDir).filter((f) => f.endsWith(".json"))
        : [];
      const siblingTasks = allTaskFiles
        .filter((f) => f !== `${taskDef.id}.json`)
        .map((f) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(taskDefsDir, f), "utf-8"));
          } catch {
            return null;
          }
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);

      const existingTaskIds = new Set(allTaskFiles.map((f) => f.replace(".json", "")));
      // Remove self so R0-T02 uniqueness check works correctly
      existingTaskIds.delete(taskDef.id);

      const descriptionFileExists = fs.existsSync(documentPath);

      const taskContext = {
        siblingTasks,
        existingTaskIds,
        parentImplId: taskDef.parent,
        descriptionFileExists,
      };

      const result = validateTaskRing0(
        taskDef,
        documentContent,
        taskContext,
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
      const jsonPath = documentPath.replace("/descriptions/", "/definitions/").replace(/\.md$/, ".json");
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
      const jsonPath = documentPath.replace("/descriptions/", "/definitions/").replace(/\.md$/, ".json");
      const impl: ImplDefinition = JSON.parse(
        fs.readFileSync(jsonPath, "utf-8"),
      );

      // Build context by scanning existing artifacts on disk.
      // Exclude the current document's own ID — R0-I41 checks uniqueness
      // against *other* impl docs, not against itself.
      const implDefsDir = path.dirname(jsonPath);
      const existingImplIds = fs.existsSync(implDefsDir)
        ? fs.readdirSync(implDefsDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.replace(".json", ""))
            .filter((id) => id !== impl.id)
        : [];

      const tasksDefsDir = path.resolve("tasks", "definitions");
      const existingTaskIds = fs.existsSync(tasksDefsDir)
        ? fs.readdirSync(tasksDefsDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.replace(".json", ""))
        : [];

      const taskDefinitions = existingTaskIds.map((tid) => {
        try {
          const t = JSON.parse(fs.readFileSync(path.join(tasksDefsDir, `${tid}.json`), "utf-8"));
          return { id: t.id, parent: t.parent, scope: { modules: t.scope?.modules ?? [] } };
        } catch {
          return { id: tid, parent: "", scope: { modules: [] as string[] } };
        }
      });

      const dependencyGraph = existingImplIds.flatMap((iid) => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(implDefsDir, `${iid}.json`), "utf-8"));
          return (d.dependencies ?? []).map((dep: string) => ({ from: iid, to: dep }));
        } catch {
          return [];
        }
      });

      const context: ImplValidationContext = {
        existingImplIds,
        existingTaskIds,
        taskDefinitions,
        dependencyGraph,
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

  const docId = extractDocumentId(documentPath);
  const log = (msg: string) => process.stderr.write(`  [refine] ${msg}\n`);

  while (iteration < maxIterations) {
    iteration++;
    log(`--- Iteration ${iteration}/${maxIterations} for ${docId} (${level}) ---`);

    // Read the current document content from disk.
    const documentContent = fs.readFileSync(documentPath, "utf-8");

    // --- Ring 0: Structural validation ---
    log(`Ring 0: validating...`);
    const ring0Result = runRing0(documentContent, level, documentPath);

    if (!ring0Result.passed) {
      log(`Ring 0: FAIL (${ring0Result.failures.length} issues: ${ring0Result.failures.map(f => f.rule).join(', ')})`);
      log(`Ring 0: applying structural fix...`);
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

    log(`Ring 0: PASS`);

    // --- Ring 1: Semantic consistency ---
    const ring1Rules = RING1_RULES[level];
    log(`Ring 1: running ${ring1Rules.length} checks (${ring1Rules.join(', ')})...`);
    const ring1Results = ring1Rules.map((ruleId) => {
      log(`  Ring 1: ${ruleId}...`);
      const r = runRing1Check(ruleId, documentContent, level, config);
      log(`  Ring 1: ${ruleId} → ${r.verdict}${r.verdict === 'fail' ? ` (${r.issues.length} issues)` : ''}`);
      return r;
    });

    const ring1Failures = ring1Results.filter((r) => r.verdict === "fail");

    if (ring1Failures.length > 0) {
      log(`Ring 1: FAIL (${ring1Failures.length}/${ring1Rules.length} checks failed)`);
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

        log(`Ring 1: convergence detected — escalating`);
        return { escalated: true, report };
      }

      // Update previous issues for next iteration's convergence check.
      previousRing1Issues = currentRing1Issues;

      // Fix semantic issues and write back to disk.
      log(`Ring 1: applying semantic fix...`);
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

    log(`Ring 1: PASS`);

    // --- Ring 2: Quality rubric ---
    const ring2Rules = RING2_RULES[level];
    log(`Ring 2: running ${ring2Rules.length} checks (${ring2Rules.join(', ')})...`);
    const ring2Results = ring2Rules.map((ruleId) => {
      log(`  Ring 2: ${ruleId}...`);
      const r = runRing2Check(ruleId, documentContent, level, config);
      log(`  Ring 2: ${ruleId} → ${r.verdict}`);
      return r;
    });

    const ring2Failures = ring2Results.filter((r) => r.verdict === "fail");

    if (ring2Failures.length === 0) {
      log(`Ring 2: PASS — all rings passed, promoting document`);
      return { promoted: true };
    }

    // Ring 2 has failures.
    log(`Ring 2: FAIL (${ring2Failures.length}/${ring2Rules.length} checks failed)`);
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

      log(`Ring 2: convergence detected — escalating`);
      return { escalated: true, report };
    }

    // Update previous issues for next iteration's convergence check.
    previousRing2Issues = currentRing2Issues;

    // Fix quality issues and write back to disk.
    log(`Ring 2: applying quality fix...`);
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
  log(`Max iterations (${maxIterations}) reached — escalating`);
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
