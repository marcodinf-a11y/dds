/**
 * CLI entry point: run all cross-level invariant validators.
 *
 * Usage: npx tsx src/cli/validate-cross.ts <spec-id>
 *
 * Parses a root spec ID, loads the full document tree (specs, impl docs, tasks),
 * runs all cross-level invariant validators (CL-F01, CL-F02), prints per-invariant
 * results, and exits 0 if all pass or 1 if any fail.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SpecDefinition, ImplDefinition, TaskDefinition } from '../types/definitions.js';
import {
  validateCLF01,
  validateCLF02,
} from '../validators/cross-level/full-stack.js';
import type { FullStackTraceabilityContext, CrossLevelResult } from '../validators/cross-level/full-stack.js';

function loadJsonFiles<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const results: T[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      results.push(JSON.parse(content) as T);
    } catch {
      // Skip malformed files
    }
  }

  return results;
}

function loadMarkdownMap(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(dir)) return map;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const id = file.replace(/\.md$/, '');
    try {
      map.set(id, fs.readFileSync(path.join(dir, file), 'utf-8'));
    } catch {
      // Skip unreadable files
    }
  }

  return map;
}

async function main(): Promise<void> {
  const specId = process.argv[2];

  if (!specId) {
    process.stderr.write('Usage: validate-cross <spec-id>\n');
    process.exit(1);
  }

  // Load all document artifacts
  const specs = loadJsonFiles<SpecDefinition>(path.resolve('specs', 'definitions'));
  const implDocs = loadJsonFiles<ImplDefinition>(path.resolve('implementations', 'definitions'));
  const tasks = loadJsonFiles<TaskDefinition>(path.resolve('tasks', 'definitions'));
  const implMarkdowns = loadMarkdownMap(path.resolve('implementations', 'descriptions'));

  // Filter to documents related to the given spec
  const relevantSpecs = specs.filter((s) => s.id === specId);
  const relevantImplIds = new Set(
    implDocs
      .filter((impl) => impl.spec_sections.some((s) => s.startsWith(`${specId}#`)))
      .map((impl) => impl.id),
  );
  const relevantImpls = implDocs.filter((impl) => relevantImplIds.has(impl.id));
  const relevantTasks = tasks.filter((t) => relevantImplIds.has(t.parent));

  const context: FullStackTraceabilityContext = {
    specs: relevantSpecs,
    implDocs: relevantImpls,
    tasks: relevantTasks,
    implMarkdowns,
  };

  // Run all cross-level validators
  const results: CrossLevelResult[] = [
    validateCLF01(context),
    validateCLF02(context),
  ];

  let allPassed = true;

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    process.stdout.write(`[${status}] ${result.rule}\n`);

    if (!result.passed) {
      allPassed = false;
      for (const issue of result.issues) {
        process.stdout.write(`  - ${issue.reference}: ${issue.description}\n`);
      }
    }
  }

  process.stdout.write(`\nOverall: ${allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'}\n`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
