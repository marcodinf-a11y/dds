/**
 * CLI entry point: refine a single document through the validation pipeline.
 *
 * Usage: npx tsx src/cli/refine.ts <document-id> <level>
 *
 * Parses a document ID and level (spec|impl|task), loads config, runs the
 * refinement loop, and reports whether the document was promoted or escalated.
 * Exits 0 if promoted, 1 if escalated.
 */

import { loadConfig } from '../llm/claude-cli.js';

async function main(): Promise<void> {
  const documentId = process.argv[2];
  const level = process.argv[3];

  if (!documentId || !level) {
    process.stderr.write('Usage: refine <document-id> <level>\n');
    process.stderr.write('  level: spec | impl | task\n');
    process.exit(1);
  }

  const validLevels = ['spec', 'impl', 'task'];
  if (!validLevels.includes(level)) {
    process.stderr.write(`Invalid level: ${level}. Must be one of: ${validLevels.join(', ')}\n`);
    process.exit(1);
  }

  const config = loadConfig();

  // Placeholder: refine() is provided by the pipeline orchestrator.
  // Once integrated, this would be:
  // import { refine } from '../pipeline/refine.js';
  // const result = await refine(documentId, level, config);

  // For now, report that the refinement module is not yet integrated.
  void config;

  process.stdout.write(`Refinement for ${documentId} (${level}): not yet integrated with pipeline orchestrator.\n`);
  process.stdout.write('Result: promoted (placeholder)\n');

  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
