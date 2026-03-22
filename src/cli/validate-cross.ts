/**
 * CLI entry point: run all cross-level invariant validators.
 *
 * Usage: npx tsx src/cli/validate-cross.ts <spec-id>
 *
 * Parses a root spec ID, loads the full document tree (specs, impl docs, tasks),
 * runs all cross-level invariant validators (CL-S01..CL-S04, CL-T01..CL-T05,
 * CL-F01, CL-F02), prints per-invariant results, and exits 0 if all pass or
 * 1 if any fail.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SpecDefinition, ImplDefinition, TaskDefinition } from '../types/definitions.js';
import { validateSpecImplCrossLevel } from '../validators/cross-level/spec-impl.js';
import { validateImplTaskCrossLevel } from '../validators/cross-level/impl-task.js';
import {
  validateCLF01,
  validateCLF02,
} from '../validators/cross-level/full-stack.js';
import type { FullStackTraceabilityContext, CrossLevelResult } from '../validators/cross-level/full-stack.js';

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
  const specMarkdowns = loadMarkdownMap(path.resolve('specs', 'descriptions'));
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

  let allPassed = true;

  // --- CL-S01..CL-S04: Spec-Impl cross-level checks ---
  const rootSpec = relevantSpecs[0];
  if (rootSpec) {
    const specMarkdown = specMarkdowns.get(specId) ?? '';
    const specImplResult = validateSpecImplCrossLevel(rootSpec, relevantImpls, specMarkdown);

    for (const r of specImplResult.results) {
      const status = r.passed ? 'PASS' : 'FAIL';
      process.stdout.write(`[${status}] ${r.rule}`);
      if (r.message) {
        process.stdout.write(`: ${r.message}`);
      }
      process.stdout.write('\n');
      if (!r.passed) {
        allPassed = false;
      }
    }
  }

  // --- CL-T01..CL-T05: Impl-Task cross-level checks ---
  const implTaskResult = validateImplTaskCrossLevel(relevantImpls, relevantTasks);

  for (const r of implTaskResult.checks) {
    const status = r.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`[${status}] ${r.rule}: ${r.message}\n`);
    if (!r.pass) {
      allPassed = false;
    }
  }

  // --- CL-F01, CL-F02: Full-stack traceability checks ---
  const fullStackContext: FullStackTraceabilityContext = {
    specs: relevantSpecs,
    implDocs: relevantImpls,
    tasks: relevantTasks,
    implMarkdowns,
  };

  const fullStackResults: CrossLevelResult[] = [
    validateCLF01(fullStackContext),
    validateCLF02(fullStackContext),
  ];

  for (const result of fullStackResults) {
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
