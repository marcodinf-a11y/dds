/**
 * Pipeline orchestrator — coordinates four-phase pipeline execution.
 *
 * Phase 1: Validate root spec via refinement.
 * Phase 2: Decompose spec into impl docs, validate each.
 * Phase 3: Decompose impl docs into tasks, validate each.
 * Phase 4: Run cross-level invariants.
 */

import { callClaude, type ResolvedConfig, loadConfig } from '../llm/claude-cli.js';
import { refine, type RefinementResult } from './refine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentResult {
  id: string;
  level: string;
  status: string;
  ring0Passed: boolean;
  ring1Passed: boolean | null;
  ring2Passed: boolean | null;
  iterations: number;
}

export interface CrossLevelResult {
  rule: string;
  passed: boolean;
  message: string;
}

export interface PipelineStats {
  documentsValidated: { spec: number; impl: number; task: number };
  crossLevelChecksPassed: number;
  totalLlmCalls: number;
  totalTokenUsage: number;
  refinementIterations: { spec: number; impl: number; task: number };
  escalationCount: number;
}

export interface PipelineResult {
  runId: string;
  rootSpecId: string;
  status: 'completed' | 'escalated' | 'aborted';
  phase: number;
  perDocumentResults: DocumentResult[];
  crossLevelResults: CrossLevelResult[];
  stats: PipelineStats;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full four-phase pipeline from a root specification.
 *
 * @param specId          - Root specification ID.
 * @param config          - Pipeline configuration (defaults loaded if omitted).
 * @param existingImplDocs - Existing impl doc IDs for incremental adjustment.
 * @returns PipelineResult with phase reached and status.
 */
export function runPipeline(
  specId: string,
  config?: ResolvedConfig,
  existingImplDocs?: string[],
): PipelineResult {
  const resolvedConfig = config ?? loadConfig();
  const runId = `run-${Date.now()}`;

  const perDocumentResults: DocumentResult[] = [];
  const crossLevelResults: CrossLevelResult[] = [];
  const stats: PipelineStats = {
    documentsValidated: { spec: 0, impl: 0, task: 0 },
    crossLevelChecksPassed: 0,
    totalLlmCalls: 0,
    totalTokenUsage: 0,
    refinementIterations: { spec: 0, impl: 0, task: 0 },
    escalationCount: 0,
  };

  // --- Phase 1: Validate spec ---
  const specPath = `specifications/${specId}.md`;
  const specResult = refine(specPath, 'spec', resolvedConfig);

  stats.documentsValidated.spec++;

  if ('escalated' in specResult && specResult.escalated) {
    stats.escalationCount++;
    perDocumentResults.push({
      id: specId,
      level: 'spec',
      status: 'escalated',
      ring0Passed: false,
      ring1Passed: null,
      ring2Passed: null,
      iterations: 0,
    });
    return {
      runId,
      rootSpecId: specId,
      status: 'escalated',
      phase: 1,
      perDocumentResults,
      crossLevelResults,
      stats,
    };
  }

  perDocumentResults.push({
    id: specId,
    level: 'spec',
    status: 'promoted',
    ring0Passed: true,
    ring1Passed: true,
    ring2Passed: true,
    iterations: 0,
  });

  // --- Phase 2: Decompose spec into impl docs, validate each ---
  const implDocIds = existingImplDocs ?? generateImplDocs(specId, resolvedConfig);

  for (const implId of implDocIds) {
    const implPath = `implementation/${implId}.md`;
    const implResult = refine(implPath, 'impl', resolvedConfig);
    stats.documentsValidated.impl++;

    if ('escalated' in implResult && implResult.escalated) {
      stats.escalationCount++;
      perDocumentResults.push({
        id: implId,
        level: 'impl',
        status: 'escalated',
        ring0Passed: false,
        ring1Passed: null,
        ring2Passed: null,
        iterations: 0,
      });
      return {
        runId,
        rootSpecId: specId,
        status: 'escalated',
        phase: 2,
        perDocumentResults,
        crossLevelResults,
        stats,
      };
    }

    perDocumentResults.push({
      id: implId,
      level: 'impl',
      status: 'promoted',
      ring0Passed: true,
      ring1Passed: true,
      ring2Passed: true,
      iterations: 0,
    });
  }

  // --- Phase 3: Decompose impl docs into tasks, validate each ---
  for (const implId of implDocIds) {
    const taskIds = generateTasks(implId, resolvedConfig);

    for (const taskId of taskIds) {
      const taskPath = `tasks/${taskId}.md`;
      const taskResult = refine(taskPath, 'task', resolvedConfig);
      stats.documentsValidated.task++;

      if ('escalated' in taskResult && taskResult.escalated) {
        stats.escalationCount++;
        perDocumentResults.push({
          id: taskId,
          level: 'task',
          status: 'escalated',
          ring0Passed: false,
          ring1Passed: null,
          ring2Passed: null,
          iterations: 0,
        });
        return {
          runId,
          rootSpecId: specId,
          status: 'escalated',
          phase: 3,
          perDocumentResults,
          crossLevelResults,
          stats,
        };
      }

      perDocumentResults.push({
        id: taskId,
        level: 'task',
        status: 'promoted',
        ring0Passed: true,
        ring1Passed: true,
        ring2Passed: true,
        iterations: 0,
      });
    }
  }

  // --- Phase 4: Cross-level invariants ---
  const clResults = runCrossLevelChecks(specId, resolvedConfig);
  crossLevelResults.push(...clResults);
  stats.crossLevelChecksPassed = clResults.filter((r) => r.passed).length;

  return {
    runId,
    rootSpecId: specId,
    status: 'completed',
    phase: 4,
    perDocumentResults,
    crossLevelResults,
    stats,
  };
}

/**
 * Handle a spec change: increment version, revert downstream, re-run pipeline.
 */
export function onSpecChange(
  specId: string,
  config?: ResolvedConfig,
): PipelineResult {
  const resolvedConfig = config ?? loadConfig();
  // In a full implementation, this would:
  // 1. Read spec JSON, increment version
  // 2. Revert downstream impl docs to 'draft'
  // 3. Abandon pending/running execution records
  // 4. Collect existing impl doc IDs
  // 5. Call runPipeline with existingImplDocs
  return runPipeline(specId, resolvedConfig);
}

// ---------------------------------------------------------------------------
// Internal helpers (delegating to callClaude for generation)
// ---------------------------------------------------------------------------

function generateImplDocs(
  _specId: string,
  _config: ResolvedConfig,
): string[] {
  // In a full implementation, this calls callClaude with the spec-to-impl
  // generation prompt and returns the generated impl doc IDs.
  return [];
}

function generateTasks(
  _implId: string,
  _config: ResolvedConfig,
): string[] {
  // In a full implementation, this calls callClaude with the impl-to-task
  // generation prompt and returns the generated task IDs.
  return [];
}

function runCrossLevelChecks(
  _specId: string,
  _config: ResolvedConfig,
): CrossLevelResult[] {
  // In a full implementation, this runs CL-S01..CL-S04, CL-T01..CL-T05,
  // CL-F01, CL-F02 and collects results.
  return [];
}
