/**
 * Pipeline orchestrator for the Document Decomposition System.
 *
 * Coordinates a full four-phase pipeline run from a root specification
 * through validation, decomposition, cross-level checking, and reporting.
 *
 * Two entry points:
 * - runPipeline() — full pipeline run from spec to validated atomic tasks.
 * - onSpecChange() — incremental re-validation when a spec is modified.
 *
 * Phases execute sequentially; the pipeline halts at any phase where
 * escalation occurs (REQ-13).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { callClaude, loadConfig, type ResolvedConfig, type PipelineConfig } from "../llm/claude-cli.js";
import type {
  SpecDefinition,
  ImplDefinition,
  TaskDefinition,
  ExecutionRecord,
} from "../types/definitions.js";

// Generation prompt builders (exist in Impl Doc modules)
import {
  IMPL_GENERATION_SYSTEM_PROMPT,
  buildImplGenerationPrompt,
  type ImplGenerationParams,
} from "../validators/impl/generation.js";
import {
  buildTaskGenerationSystemPrompt,
  buildTaskGenerationUserPrompt,
  type TaskGenerationParams,
} from "../validators/task/generation.js";

// Full-stack traceability validators (CL-F01, CL-F02)
import {
  validateCLF01,
  validateCLF02,
  type CrossLevelResult,
  type FullStackTraceabilityContext,
} from "../validators/cross-level/full-stack.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result for a single document validated through the pipeline. */
export interface DocumentResult {
  id: string;
  level: string;
  status: string;
  ring0Passed: boolean;
  ring1Passed: boolean | null;
  ring2Passed: boolean | null;
  iterations: number;
}

/** Aggregate statistics for a pipeline run. */
export interface PipelineStats {
  documentsValidated: { spec: number; impl: number; task: number };
  crossLevelChecksPassed: number;
  totalLlmCalls: number;
  totalTokenUsage: number;
  refinementIterations: { spec: number; impl: number; task: number };
  escalationCount: number;
}

/** Overall result of a pipeline run. */
export interface PipelineResult {
  runId: string;
  rootSpecId: string;
  status: "completed" | "escalated" | "aborted";
  phase: number;
  perDocumentResults: DocumentResult[];
  crossLevelResults: CrossLevelResult[];
  stats: PipelineStats;
}

// ---------------------------------------------------------------------------
// Refinement result type (matches the contract from refine.ts)
//
// refine.ts is produced by task at-353cb055 and may not exist on the
// current branch. We define a local compatible type here and use a
// dynamic import so that compilation succeeds regardless.
// ---------------------------------------------------------------------------

type RefinementResult =
  | { promoted: true }
  | { escalated: true; report: string };

/**
 * Dynamically import and call the refine() function.
 * The refine module is produced by task at-353cb055 and may not exist
 * on the current branch. We use a computed import specifier to prevent
 * TypeScript from statically resolving the module.
 */
async function callRefine(
  documentPath: string,
  level: "spec" | "impl" | "task",
  config: ResolvedConfig,
): Promise<RefinementResult> {
  const specifier = [".", "refine.js"].join("/");
  const mod = await import(/* webpackIgnore: true */ specifier) as {
    refine: (p: string, l: string, c: ResolvedConfig) => RefinementResult;
  };
  return mod.refine(documentPath, level, config);
}

// ---------------------------------------------------------------------------
// Cross-level validator stubs for spec-impl (CL-S01..CL-S04) and
// impl-task (CL-T01..CL-T05).
//
// These modules are produced by sibling tasks and may not yet exist.
// We use dynamic imports to avoid compile-time failures.
// ---------------------------------------------------------------------------

interface SpecImplCrossLevelResult {
  valid: boolean;
  results: Array<{ rule: string; passed: boolean; message?: string }>;
}

interface ImplTaskCrossLevelResult {
  passed: boolean;
  checks: Array<{ rule: string; passed: boolean; message: string }>;
}

async function runSpecImplCrossLevel(
  spec: SpecDefinition,
  implDocs: Array<{ id: string; spec_sections: string[]; status: string }>,
  specMarkdown: string,
): Promise<CrossLevelResult[]> {
  try {
    const specifier = ["..", "validators", "cross-level", "spec-impl.js"].join("/");
    const mod = await import(/* webpackIgnore: true */ specifier) as {
      validateSpecImplCrossLevel: (s: SpecDefinition, i: typeof implDocs, m: string) => SpecImplCrossLevelResult;
    };
    const result: SpecImplCrossLevelResult = mod.validateSpecImplCrossLevel(
      spec,
      implDocs,
      specMarkdown,
    );
    return result.results.map((r) => ({
      rule: r.rule,
      passed: r.passed,
      issues: r.passed
        ? []
        : [{ rule: r.rule, reference: r.rule, description: r.message ?? "Failed" }],
    }));
  } catch {
    return [{
      rule: "CL-S01..CL-S04",
      passed: false,
      issues: [{ rule: "CL-S01", reference: "spec-impl", description: "spec-impl cross-level validator not available" }],
    }];
  }
}

async function runImplTaskCrossLevel(
  implDocs: ImplDefinition[],
  tasks: Array<{
    id: string;
    parent: string;
    scope: { modules: string[] };
    context_refs: string[];
    blocked_by: string[];
    blocks: string[];
  }>,
): Promise<CrossLevelResult[]> {
  try {
    const specifier = ["..", "validators", "cross-level", "impl-task.js"].join("/");
    const mod = await import(/* webpackIgnore: true */ specifier) as {
      validateImplTaskCrossLevel: (i: ImplDefinition[], t: typeof tasks) => ImplTaskCrossLevelResult;
    };
    const result: ImplTaskCrossLevelResult = mod.validateImplTaskCrossLevel(
      implDocs,
      tasks,
    );
    return result.checks.map((c) => ({
      rule: c.rule,
      passed: c.passed,
      issues: c.passed
        ? []
        : [{ rule: c.rule, reference: c.rule, description: c.message }],
    }));
  } catch {
    return [{
      rule: "CL-T01..CL-T05",
      passed: false,
      issues: [{ rule: "CL-T01", reference: "impl-task", description: "impl-task cross-level validator not available" }],
    }];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRunId(): string {
  return `run-${crypto.randomBytes(4).toString("hex")}`;
}

function createInitialStats(): PipelineStats {
  return {
    documentsValidated: { spec: 0, impl: 0, task: 0 },
    crossLevelChecksPassed: 0,
    totalLlmCalls: 0,
    totalTokenUsage: 0,
    refinementIterations: { spec: 0, impl: 0, task: 0 },
    escalationCount: 0,
  };
}

function resolveConfig(config?: PipelineConfig): ResolvedConfig {
  if (config === undefined) {
    return loadConfig();
  }
  // Merge partial config with defaults by loading defaults first then overlaying.
  const defaults = loadConfig();
  return {
    refinement: {
      max_iterations:
        config.refinement?.max_iterations ?? defaults.refinement.max_iterations,
      convergence_threshold:
        config.refinement?.convergence_threshold ??
        defaults.refinement.convergence_threshold,
    },
    timeouts: {
      ring1_check_seconds:
        config.timeouts?.ring1_check_seconds ??
        defaults.timeouts.ring1_check_seconds,
      ring2_check_seconds:
        config.timeouts?.ring2_check_seconds ??
        defaults.timeouts.ring2_check_seconds,
      fix_call_seconds:
        config.timeouts?.fix_call_seconds ?? defaults.timeouts.fix_call_seconds,
    },
    claude_cli: {
      max_retries_on_short_429:
        config.claude_cli?.max_retries_on_short_429 ??
        defaults.claude_cli.max_retries_on_short_429,
      backoff_multiplier:
        config.claude_cli?.backoff_multiplier ??
        defaults.claude_cli.backoff_multiplier,
      delay_between_calls_ms:
        config.claude_cli?.delay_between_calls_ms ??
        defaults.claude_cli.delay_between_calls_ms,
    },
  };
}

/** Read and parse a JSON file. */
function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/** Write a JSON object to a file, preserving formatting. */
function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Read a text file. */
function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Parse the LLM response for decomposition, which contains paired
 * JSON definitions and Markdown descriptions separated by horizontal rules.
 * Returns arrays of parsed JSON objects and markdown strings.
 */
function parseDecompositionResponse(
  response: string,
): { jsons: Record<string, unknown>[]; markdowns: string[] } {
  const jsons: Record<string, unknown>[] = [];
  const markdowns: string[] = [];

  // Split by horizontal rules
  const sections = response.split(/\n---\n/).map((s) => s.trim());

  for (const section of sections) {
    if (!section) continue;

    // Extract JSON from ```json ... ``` blocks
    const jsonMatch = section.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        jsons.push(JSON.parse(jsonMatch[1].trim()));
      } catch {
        // Skip malformed JSON
      }
    }

    // Extract Markdown: everything after the JSON block (starting with #)
    const mdMatch = section.match(/```[\s\S]*?```\s*(#[\s\S]*)/);
    if (mdMatch) {
      markdowns.push(mdMatch[1].trim());
    } else if (section.startsWith("#")) {
      // Section is pure markdown (no JSON block)
      markdowns.push(section);
    }
  }

  return { jsons, markdowns };
}

/**
 * Create a DocumentResult from a refinement result.
 */
function toDocumentResult(
  id: string,
  level: string,
  refinementResult: RefinementResult,
): DocumentResult {
  if ("promoted" in refinementResult) {
    return {
      id,
      level,
      status: "validated",
      ring0Passed: true,
      ring1Passed: true,
      ring2Passed: true,
      iterations: 0,
    };
  }
  return {
    id,
    level,
    status: "escalated",
    ring0Passed: false,
    ring1Passed: null,
    ring2Passed: null,
    iterations: 0,
  };
}

// ---------------------------------------------------------------------------
// Schema for decomposition response (used by callClaude)
// ---------------------------------------------------------------------------

const DECOMPOSITION_RESPONSE_SCHEMA = {
  type: "object" as const,
  required: ["output"],
  additionalProperties: false,
  properties: {
    output: {
      type: "string" as const,
      description:
        "The complete decomposition output containing JSON definitions and Markdown descriptions separated by horizontal rules.",
    },
  },
};

interface DecompositionResponse {
  output: string;
}

// ---------------------------------------------------------------------------
// runPipeline
// ---------------------------------------------------------------------------

/**
 * Execute a full four-phase pipeline run from a root specification.
 *
 * Phase 1: Validate the root spec through the refinement loop.
 * Phase 2: Decompose the spec into impl docs, validate each through refinement.
 * Phase 3: Decompose each impl doc into tasks, validate each through refinement.
 * Phase 4: Run all cross-level invariants across the full document tree.
 *
 * The pipeline halts at any phase where escalation occurs (REQ-13).
 *
 * @param specId - ID of the root specification to process.
 * @param config - Optional pipeline configuration overrides.
 * @param existingImplDocs - Optional existing impl doc IDs for incremental adjustment.
 * @returns PipelineResult with status, per-document results, and statistics.
 */
export async function runPipeline(
  specId: string,
  config?: PipelineConfig,
  existingImplDocs?: string[],
): Promise<PipelineResult> {
  const resolved = resolveConfig(config);
  const runId = generateRunId();
  const stats = createInitialStats();
  const perDocumentResults: DocumentResult[] = [];
  const crossLevelResults: CrossLevelResult[] = [];

  // ---------------------------------------------------------------------------
  // Phase 1: Validate the root spec
  // ---------------------------------------------------------------------------

  const specJsonPath = path.resolve("specs", `${specId}.json`);
  const specMdPath = path.resolve("specs", `${specId}.md`);

  const specRefineResult = await callRefine(specMdPath, "spec", resolved);
  stats.documentsValidated.spec++;

  perDocumentResults.push(toDocumentResult(specId, "spec", specRefineResult));

  if ("escalated" in specRefineResult) {
    stats.escalationCount++;
    return {
      runId,
      rootSpecId: specId,
      status: "escalated",
      phase: 1,
      perDocumentResults,
      crossLevelResults,
      stats,
    };
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Decompose spec into impl docs, validate each
  // ---------------------------------------------------------------------------

  const specJson = readJson<SpecDefinition>(specJsonPath);
  const specMarkdown = readText(specMdPath);

  // Call the spec-to-impl generation prompt via Claude CLI.
  const implGenParams: ImplGenerationParams = {
    spec_json: JSON.stringify(specJson, null, 2),
    spec_markdown: specMarkdown,
    codebase_context: existingImplDocs
      ? `Existing impl docs for incremental adjustment: ${existingImplDocs.join(", ")}`
      : "",
    build_command: "npx tsc --noEmit",
    test_command: "npx vitest run",
    lint_command: "npx eslint src/",
  };

  const implPrompt = `${IMPL_GENERATION_SYSTEM_PROMPT}\n\n${buildImplGenerationPrompt(implGenParams)}`;
  const implResponse = callClaude<DecompositionResponse>(
    implPrompt,
    DECOMPOSITION_RESPONSE_SCHEMA,
    resolved,
    resolved.timeouts.fix_call_seconds,
  );
  stats.totalLlmCalls++;

  const parsedImplDocs = parseDecompositionResponse(implResponse.output);
  const generatedImplDocs: ImplDefinition[] = [];

  // Write paired artifacts and validate each impl doc
  for (let i = 0; i < parsedImplDocs.jsons.length; i++) {
    const implDef = parsedImplDocs.jsons[i] as unknown as ImplDefinition;
    const implMd = parsedImplDocs.markdowns[i] ?? "";

    // Write JSON and Markdown artifacts to implementation/ directory
    const implDir = path.resolve("implementation");
    fs.mkdirSync(implDir, { recursive: true });

    const implJsonPath = path.join(implDir, `${implDef.id}.json`);
    const implMdPath = path.join(implDir, `${implDef.id}.md`);

    writeJson(implJsonPath, implDef);
    fs.writeFileSync(implMdPath, implMd, "utf-8");

    // Validate through refinement loop
    const implRefineResult = await callRefine(implMdPath, "impl", resolved);
    stats.documentsValidated.impl++;

    perDocumentResults.push(
      toDocumentResult(implDef.id, "impl", implRefineResult),
    );

    if ("escalated" in implRefineResult) {
      stats.escalationCount++;
      return {
        runId,
        rootSpecId: specId,
        status: "escalated",
        phase: 2,
        perDocumentResults,
        crossLevelResults,
        stats,
      };
    }

    generatedImplDocs.push(implDef);
  }

  // Update spec JSON with child references and status (REQ-19)
  specJson.implementation_docs = generatedImplDocs.map((d) => d.id);
  specJson.status = "decomposed";
  writeJson(specJsonPath, specJson);

  // ---------------------------------------------------------------------------
  // Phase 3: Decompose each impl doc into atomic tasks, validate each
  // ---------------------------------------------------------------------------

  const allTasks: TaskDefinition[] = [];

  for (const implDef of generatedImplDocs) {
    const implJsonPath = path.resolve("implementation", `${implDef.id}.json`);
    const implMdPath = path.resolve("implementation", `${implDef.id}.md`);

    const implMarkdown = readText(implMdPath);

    // Call impl-to-task generation prompt via Claude CLI
    const taskGenParams: TaskGenerationParams = {
      implJson: JSON.stringify(implDef, null, 2),
      implMarkdown: implMarkdown,
      specSectionsContent: specMarkdown,
      codebaseContext: "",
      buildCommand: "npx tsc --noEmit",
      testCommand: "npx vitest run",
      lintCommand: "npx eslint src/",
    };

    const taskPrompt = `${buildTaskGenerationSystemPrompt()}\n\n${buildTaskGenerationUserPrompt(taskGenParams)}`;
    const taskResponse = callClaude<DecompositionResponse>(
      taskPrompt,
      DECOMPOSITION_RESPONSE_SCHEMA,
      resolved,
      resolved.timeouts.fix_call_seconds,
    );
    stats.totalLlmCalls++;

    const parsedTasks = parseDecompositionResponse(taskResponse.output);
    const implTasks: TaskDefinition[] = [];

    // Write paired artifacts and validate each task
    for (let i = 0; i < parsedTasks.jsons.length; i++) {
      const taskDef = parsedTasks.jsons[i] as unknown as TaskDefinition;
      const taskMd = parsedTasks.markdowns[i] ?? "";

      const tasksDir = path.resolve("tasks");
      const taskDefsDir = path.join(tasksDir, "definitions");
      const taskDescsDir = path.join(tasksDir, "descriptions");
      fs.mkdirSync(taskDefsDir, { recursive: true });
      fs.mkdirSync(taskDescsDir, { recursive: true });

      const taskJsonPath = path.join(taskDefsDir, `${taskDef.id}.json`);
      const taskMdPath = path.join(taskDescsDir, `${taskDef.id}.md`);

      writeJson(taskJsonPath, taskDef);
      fs.writeFileSync(taskMdPath, taskMd, "utf-8");

      // Validate through refinement loop
      const taskRefineResult = await callRefine(taskMdPath, "task", resolved);
      stats.documentsValidated.task++;

      perDocumentResults.push(
        toDocumentResult(taskDef.id, "task", taskRefineResult),
      );

      if ("escalated" in taskRefineResult) {
        stats.escalationCount++;
        return {
          runId,
          rootSpecId: specId,
          status: "escalated",
          phase: 3,
          perDocumentResults,
          crossLevelResults,
          stats,
        };
      }

      implTasks.push(taskDef);
      allTasks.push(taskDef);
    }

    // Run cross-task invariants (CL-T01 through CL-T05) for this impl doc's tasks
    const implTaskResults = await runImplTaskCrossLevel(
      [implDef],
      implTasks.map((t) => ({
        id: t.id,
        parent: t.parent,
        scope: { modules: t.scope.modules },
        context_refs: t.context_refs,
        blocked_by: t.blocked_by,
        blocks: t.blocks,
      })),
    );

    const implTaskFailures = implTaskResults.filter((r) => !r.passed);
    if (implTaskFailures.length > 0) {
      crossLevelResults.push(...implTaskResults);
      stats.escalationCount++;
      return {
        runId,
        rootSpecId: specId,
        status: "escalated",
        phase: 3,
        perDocumentResults,
        crossLevelResults,
        stats,
      };
    }

    // Update impl doc JSON with child task references and status (REQ-19)
    const currentImplJson = readJson<ImplDefinition>(implJsonPath);
    currentImplJson.atomic_tasks = implTasks.map((t) => t.id);
    currentImplJson.status = "decomposed";
    writeJson(implJsonPath, currentImplJson);
  }

  // ---------------------------------------------------------------------------
  // Phase 4: Run all cross-level invariants
  // ---------------------------------------------------------------------------

  // CL-S01 through CL-S04: spec-to-impl cross-level checks
  const specImplResults = await runSpecImplCrossLevel(
    specJson,
    generatedImplDocs.map((d) => ({
      id: d.id,
      spec_sections: d.spec_sections,
      status: d.status,
    })),
    specMarkdown,
  );
  crossLevelResults.push(...specImplResults);

  // CL-T01 through CL-T05: impl-to-task cross-level checks (all tasks combined)
  const allImplTaskResults = await runImplTaskCrossLevel(
    generatedImplDocs,
    allTasks.map((t) => ({
      id: t.id,
      parent: t.parent,
      scope: { modules: t.scope.modules },
      context_refs: t.context_refs,
      blocked_by: t.blocked_by,
      blocks: t.blocks,
    })),
  );
  crossLevelResults.push(...allImplTaskResults);

  // CL-F01, CL-F02: Full-stack traceability
  const implMarkdowns = new Map<string, string>();
  for (const implDef of generatedImplDocs) {
    const implMdPath = path.resolve("implementation", `${implDef.id}.md`);
    try {
      implMarkdowns.set(implDef.id, readText(implMdPath));
    } catch {
      // Skip if markdown not readable
    }
  }

  const fullStackContext: FullStackTraceabilityContext = {
    specs: [specJson],
    implDocs: generatedImplDocs,
    tasks: allTasks,
    implMarkdowns,
  };

  const clf01Result = validateCLF01(fullStackContext);
  const clf02Result = validateCLF02(fullStackContext);
  crossLevelResults.push(clf01Result, clf02Result);

  // Count passing cross-level checks
  stats.crossLevelChecksPassed = crossLevelResults.filter(
    (r) => r.passed,
  ).length;

  // Determine overall status based on cross-level results
  const allCrossLevelPassed = crossLevelResults.every((r) => r.passed);
  const finalStatus = allCrossLevelPassed ? "completed" : "escalated";

  if (!allCrossLevelPassed) {
    stats.escalationCount++;
  }

  return {
    runId,
    rootSpecId: specId,
    status: finalStatus,
    phase: 4,
    perDocumentResults,
    crossLevelResults,
    stats,
  };
}

// ---------------------------------------------------------------------------
// onSpecChange
// ---------------------------------------------------------------------------

/**
 * Handle a specification change by incrementing the version, reverting
 * downstream documents to draft, abandoning in-progress executions, and
 * re-running the pipeline with incremental adjustment (REQ-14).
 *
 * @param specId - ID of the modified specification.
 * @param config - Optional pipeline configuration overrides.
 * @returns PipelineResult from the re-run pipeline.
 */
export async function onSpecChange(
  specId: string,
  config?: PipelineConfig,
): Promise<PipelineResult> {
  const specJsonPath = path.resolve("specs", `${specId}.json`);

  // 1. Read spec JSON and increment version
  const specJson = readJson<SpecDefinition>(specJsonPath);
  specJson.version++;
  writeJson(specJsonPath, specJson);

  // 2. Collect existing impl doc IDs for incremental re-decomposition
  const existingImplDocIds: string[] = specJson.implementation_docs ?? [];

  // 3. Revert downstream impl docs to 'draft'
  for (const implId of existingImplDocIds) {
    const implJsonPath = path.resolve("implementation", `${implId}.json`);
    try {
      const implJson = readJson<ImplDefinition>(implJsonPath);
      implJson.status = "draft";
      writeJson(implJsonPath, implJson);
    } catch {
      // Impl doc may not exist on disk; skip.
    }
  }

  // 4. Set any pending or running execution records to 'abandoned'
  const executionsDir = path.resolve("tasks", "executions");
  if (fs.existsSync(executionsDir)) {
    const executionFiles = fs.readdirSync(executionsDir).filter((f) =>
      f.endsWith(".json"),
    );
    for (const file of executionFiles) {
      const execPath = path.join(executionsDir, file);
      try {
        const execRecord = readJson<ExecutionRecord>(execPath);
        if (
          execRecord.status === "pending" ||
          execRecord.status === "running"
        ) {
          execRecord.status = "abandoned";
          writeJson(execPath, execRecord);
        }
      } catch {
        // Skip malformed execution records.
      }
    }
  }

  // 5. Re-run pipeline with existing impl docs for incremental adjustment
  return runPipeline(specId, config, existingImplDocIds);
}
