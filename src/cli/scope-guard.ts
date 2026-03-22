/**
 * CLI entry point: scope guard for PreToolUse hooks.
 *
 * Usage: npx tsx src/cli/scope-guard.ts <file-path> <task-id>
 *
 * Reads the task definition JSON to get scope.files, checks if the given
 * file path matches any entry, exits 0 if allowed or 1 if blocked.
 * Prints a message to stderr when blocked.
 *
 * Works standalone — no dependency on pipeline state.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { TaskDefinition } from '../types/definitions.js';

function normalizeFilePath(filePath: string): string {
  // Normalize to forward slashes and remove leading ./
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isFileInScope(filePath: string, scopeFiles: string[]): boolean {
  const normalized = normalizeFilePath(filePath);

  for (const scopeFile of scopeFiles) {
    const normalizedScope = normalizeFilePath(scopeFile);
    if (normalized === normalizedScope) {
      return true;
    }
  }

  return false;
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  const taskId = process.argv[3];

  if (!filePath || !taskId) {
    process.stderr.write('Usage: scope-guard <file-path> <task-id>\n');
    process.exit(1);
  }

  const defPath = path.resolve('tasks', 'definitions', `${taskId}.json`);

  if (!fs.existsSync(defPath)) {
    process.stderr.write(`Task definition not found: ${defPath}\n`);
    process.exit(1);
  }

  const task: TaskDefinition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));

  if (isFileInScope(filePath, task.scope.files)) {
    process.exit(0);
  } else {
    process.stderr.write(`BLOCKED: ${filePath} is not in scope for task ${taskId}\n`);
    process.stderr.write(`Allowed files: ${task.scope.files.join(', ')}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
