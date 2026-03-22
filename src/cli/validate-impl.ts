/**
 * CLI entry point: validate a single implementation document (Ring 0).
 *
 * Usage: npx tsx src/cli/validate-impl.ts <impl-id>
 *
 * Loads the impl definition and markdown, delegates to the library Ring 0
 * validator, prints results, and exits 0 if valid or 1 if invalid.
 * Suitable for PostToolUse hooks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ImplDefinition, TaskDefinition } from '../types/definitions.js';
import { validateImplRing0 } from '../validators/impl/ring0.js';
import type { ImplValidationContext } from '../validators/impl/ring0.js';

function loadJsonFiles<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as T;
      } catch {
        return null;
      }
    })
    .filter((x): x is T => x !== null);
}

async function main(): Promise<void> {
  const implId = process.argv[2];

  if (!implId) {
    process.stderr.write('Usage: validate-impl <impl-id>\n');
    process.exit(1);
  }

  const defPath = path.resolve('implementations', 'definitions', `${implId}.json`);
  const mdPath = path.resolve('implementations', 'descriptions', `${implId}.md`);

  if (!fs.existsSync(defPath)) {
    process.stderr.write(`Impl definition not found: ${defPath}\n`);
    process.exit(1);
  }

  if (!fs.existsSync(mdPath)) {
    process.stderr.write(`Impl description not found: ${mdPath}\n`);
    process.exit(1);
  }

  const impl: ImplDefinition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  // Build validation context from filesystem
  const allImpls = loadJsonFiles<ImplDefinition>(path.resolve('implementations', 'definitions'));
  const allTasks = loadJsonFiles<TaskDefinition>(path.resolve('tasks', 'definitions'));

  const context: ImplValidationContext = {
    existingImplIds: allImpls.filter((i) => i.id !== impl.id).map((i) => i.id),
    existingTaskIds: allTasks.map((t) => t.id),
    taskDefinitions: allTasks.map((t) => ({
      id: t.id,
      parent: t.parent,
      scope: { modules: t.scope.modules },
    })),
    dependencyGraph: allImpls.flatMap((i) =>
      (i.dependencies ?? []).map((dep) => ({ from: i.id, to: dep })),
    ),
  };

  const result = validateImplRing0(impl, markdown, context);

  for (const r of result.results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`[${status}] ${r.rule}: ${r.message}\n`);
  }

  process.stdout.write(`\nOverall: ${result.valid ? 'VALID' : 'INVALID'}\n`);
  process.exit(result.valid ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
