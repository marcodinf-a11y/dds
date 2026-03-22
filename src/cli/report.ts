/**
 * Pipeline summary report generator.
 *
 * Generates a structured JSON report to pipeline/reports/ containing
 * run metadata, per-document results, and aggregate statistics per REQ-16.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/** Per-document result included in the report. */
export interface DocumentResult {
  id: string;
  level: 'spec' | 'impl' | 'task';
  status: 'passed' | 'failed' | 'skipped';
  ring0_passed: boolean;
  ring1_passed: boolean | null;
  ring2_passed: boolean | null;
  iteration_count: number;
}

/** Aggregate statistics for the pipeline run. */
export interface AggregateStatistics {
  documents_validated: {
    spec: number;
    impl: number;
    task: number;
  };
  cross_level_checks_passed: number;
  total_llm_calls: number;
  total_token_usage: number;
  refinement_iterations: {
    spec: number;
    impl: number;
    task: number;
  };
  escalation_count: number;
}

/** The full pipeline result passed to generateReport. */
export interface PipelineResult {
  rootSpecId: string;
  status: 'completed' | 'escalated' | 'aborted';
  startedAt: string;
  finishedAt: string;
  documentResults: DocumentResult[];
  crossLevelChecksPassed: number;
  totalLlmCalls: number;
  totalTokenUsage: number;
  escalationCount: number;
}

/** The report structure written to disk. */
export interface PipelineReport {
  runId: string;
  rootSpecId: string;
  startedAt: string;
  finishedAt: string;
  overallStatus: 'completed' | 'escalated' | 'aborted';
  documentResults: DocumentResult[];
  statistics: AggregateStatistics;
}

/** Default output directory for pipeline reports, relative to project root. */
const REPORTS_DIR = 'pipeline/reports';

/**
 * Generate a pipeline summary report and write it to disk as formatted JSON.
 *
 * @param result - The pipeline result data.
 * @returns The file path of the written report (relative to project root).
 */
export function generateReport(result: PipelineResult): string {
  const runId = crypto.randomUUID();

  const specResults = result.documentResults.filter((d) => d.level === 'spec');
  const implResults = result.documentResults.filter((d) => d.level === 'impl');
  const taskResults = result.documentResults.filter((d) => d.level === 'task');

  const statistics: AggregateStatistics = {
    documents_validated: {
      spec: specResults.length,
      impl: implResults.length,
      task: taskResults.length,
    },
    cross_level_checks_passed: result.crossLevelChecksPassed,
    total_llm_calls: result.totalLlmCalls,
    total_token_usage: result.totalTokenUsage,
    refinement_iterations: {
      spec: specResults.reduce((sum, d) => sum + d.iteration_count, 0),
      impl: implResults.reduce((sum, d) => sum + d.iteration_count, 0),
      task: taskResults.reduce((sum, d) => sum + d.iteration_count, 0),
    },
    escalation_count: result.escalationCount,
  };

  const report: PipelineReport = {
    runId,
    rootSpecId: result.rootSpecId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    overallStatus: result.status,
    documentResults: result.documentResults,
    statistics,
  };

  // Ensure the output directory exists.
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const filename = `${runId}.json`;
  const filePath = path.join(REPORTS_DIR, filename);

  // Write the report as formatted JSON.
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(filePath, json + '\n', 'utf-8');

  return filePath;
}
