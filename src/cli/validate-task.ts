/**
 * CLI entry point: validate a single atomic task (Ring 0).
 *
 * Usage: npx tsx src/cli/validate-task.ts <task-id>
 *
 * Loads the task definition and markdown, runs Ring 0 structural validation,
 * prints results, and exits 0 if valid or 1 if invalid.
 * Suitable for PostToolUse hooks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TaskDefinition } from '../types/definitions.js';
import { validateTaskRing0 } from '../validators/task/ring0.js';
import type { TaskValidationContext } from '../validators/task/ring0.js';

function loadSiblingTasks(taskId: string, parentImplId: string): TaskDefinition[] {
  const defsDir = path.resolve('tasks', 'definitions');
  if (!fs.existsSync(defsDir)) return [];

  const files = fs.readdirSync(defsDir).filter((f) => f.endsWith('.json'));
  const siblings: TaskDefinition[] = [];

  for (const file of files) {
    const filePath = path.join(defsDir, file);
    try {
      const def: TaskDefinition = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (def.parent === parentImplId) {
        siblings.push(def);
      }
    } catch {
      // Skip malformed files
    }
  }

  return siblings;
}

async function main(): Promise<void> {
  const taskId = process.argv[2];

  if (!taskId) {
    process.stderr.write('Usage: validate-task <task-id>\n');
    process.exit(1);
  }

  const defPath = path.resolve('tasks', 'definitions', `${taskId}.json`);
  const mdPath = path.resolve('tasks', 'descriptions', `${taskId}.md`);

  if (!fs.existsSync(defPath)) {
    process.stderr.write(`Task definition not found: ${defPath}\n`);
    process.exit(1);
  }

  const task: TaskDefinition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));

  const descriptionFileExists = fs.existsSync(mdPath);
  const markdown = descriptionFileExists ? fs.readFileSync(mdPath, 'utf-8') : '';

  const siblingTasks = loadSiblingTasks(taskId, task.parent);
  const existingTaskIds = new Set(siblingTasks.map((t) => t.id));
  // Remove the task being validated so uniqueness check works correctly
  existingTaskIds.delete(task.id);

  const context: TaskValidationContext = {
    siblingTasks,
    existingTaskIds,
    parentImplId: task.parent,
    descriptionFileExists,
  };

  const result = validateTaskRing0(task, markdown, context);

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
