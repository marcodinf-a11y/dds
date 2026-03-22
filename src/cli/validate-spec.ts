/**
 * CLI entry point: validate a single specification document (Ring 0).
 *
 * Usage: npx tsx src/cli/validate-spec.ts <spec-id>
 *
 * Loads the spec definition and markdown, delegates to the library Ring 0
 * validator, prints results, and exits 0 if valid or 1 if invalid.
 * Suitable for PostToolUse hooks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SpecDefinition } from '../types/definitions.js';
import { validateSpecRing0 } from '../validators/spec/ring0.js';

async function main(): Promise<void> {
  const specId = process.argv[2];

  if (!specId) {
    process.stderr.write('Usage: validate-spec <spec-id>\n');
    process.exit(1);
  }

  const defPath = path.resolve('specs', 'definitions', `${specId}.json`);
  const mdPath = path.resolve('specs', 'descriptions', `${specId}.md`);

  if (!fs.existsSync(defPath)) {
    process.stderr.write(`Spec definition not found: ${defPath}\n`);
    process.exit(1);
  }

  if (!fs.existsSync(mdPath)) {
    process.stderr.write(`Spec description not found: ${mdPath}\n`);
    process.exit(1);
  }

  const spec: SpecDefinition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  const result = validateSpecRing0(spec, markdown);

  for (const r of result.results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    process.stdout.write(`[${status}] ${r.rule}: ${r.message ?? ''}\n`);
  }

  process.stdout.write(`\nOverall: ${result.valid ? 'VALID' : 'INVALID'}\n`);
  process.exit(result.valid ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
