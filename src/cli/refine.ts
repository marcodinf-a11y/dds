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
import { refine, type DocumentLevel } from '../pipeline/refine.js';

async function main(): Promise<void> {
  const documentPath = process.argv[2];
  const level = process.argv[3];

  if (!documentPath || !level) {
    process.stderr.write('Usage: refine <document-path> <level>\n');
    process.stderr.write('  level: spec | impl | task\n');
    process.exit(1);
  }

  const validLevels = ['spec', 'impl', 'task'];
  if (!validLevels.includes(level)) {
    process.stderr.write(`Invalid level: ${level}. Must be one of: ${validLevels.join(', ')}\n`);
    process.exit(1);
  }

  const config = loadConfig();

  const result = refine(documentPath, level as DocumentLevel, config);

  if ('promoted' in result) {
    process.stdout.write(`Refinement for ${documentPath} (${level}): promoted\n`);
    process.exit(0);
  } else {
    process.stdout.write(`Refinement for ${documentPath} (${level}): escalated\n`);
    process.stderr.write(`Escalation report: ${result.report}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
