/**
 * CLI entry point: run the full validation pipeline.
 *
 * Usage: npx tsx src/cli/run-pipeline.ts <spec-id>
 *
 * Parses a spec ID argument, loads config, delegates to runPipeline(),
 * writes a summary report, and exits with appropriate code.
 */

import { runPipeline } from '../pipeline/orchestrate.js';
import { generateReport } from './report.js';
import type { PipelineResult as ReportPipelineResult } from './report.js';

async function main(): Promise<void> {
  const specId = process.argv[2];

  if (!specId) {
    process.stderr.write('Usage: run-pipeline <spec-id>\n');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const result = await runPipeline(specId);
  const finishedAt = new Date().toISOString();

  // Adapt the orchestrator's PipelineResult to the report's PipelineResult shape.
  const reportResult: ReportPipelineResult = {
    rootSpecId: result.rootSpecId,
    status: result.status,
    startedAt,
    finishedAt,
    documentResults: result.perDocumentResults.map((d) => ({
      id: d.id,
      level: d.level as 'spec' | 'impl' | 'task',
      status: (d.status === 'validated' ? 'passed' : 'failed') as 'passed' | 'failed' | 'skipped',
      ring0_passed: d.ring0Passed,
      ring1_passed: d.ring1Passed,
      ring2_passed: d.ring2Passed,
      iteration_count: d.iterations,
    })),
    crossLevelChecksPassed: result.stats.crossLevelChecksPassed,
    totalLlmCalls: result.stats.totalLlmCalls,
    totalTokenUsage: result.stats.totalTokenUsage,
    escalationCount: result.stats.escalationCount,
  };

  const reportPath = generateReport(reportResult);
  process.stdout.write(`Pipeline completed. Report: ${reportPath}\n`);
  process.stdout.write(`Status: ${result.status}\n`);

  process.exit(result.status === 'completed' ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
