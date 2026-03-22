import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateTaskRing0,
  validateExecutionRecord,
  type TaskValidationContext,
  type ExecutionRecordContext,
} from '../../../src/validators/task/ring0.js';
import {
  validateCLF01,
  validateCLF02,
  type FullStackTraceabilityContext,
} from '../../../src/validators/cross-level/full-stack.js';
import type {
  TaskDefinition,
  ExecutionRecord,
  SpecDefinition,
  ImplDefinition,
} from '../../../src/types/definitions.js';

// --- Fixture helpers ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures/tasks');

function loadJson<T>(relativePath: string): T {
  const fullPath = resolve(fixturesDir, relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf-8')) as T;
}

function loadMarkdown(relativePath: string): string {
  const fullPath = resolve(fixturesDir, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

// --- Shared valid fixtures ---

const validTask = loadJson<TaskDefinition>('valid-task.json');
const validMarkdown = loadMarkdown('valid-task.md');
const validExecutionRecord = loadJson<ExecutionRecord>('valid-execution-record.json');

// Sibling tasks that complete the dependency graph for the valid task
const siblingBlocker: TaskDefinition = {
  id: 'at-11111111',
  parent: 'impl-9f4b1c7d',
  description: 'at-11111111.md',
  blocked_by: [],
  blocks: ['at-a1b2c3d4'],
  scope: { files: ['src/dep.ts'], modules: ['task-validation'] },
  acceptance_criteria: [
    { id: 'ac-11100001', type: 'build', description: 'Build', verify: 'npx tsc --noEmit' },
  ],
  context_refs: ['spec-fa3a90b8#atomic-tasks'],
};

const siblingBlocked: TaskDefinition = {
  id: 'at-22222222',
  parent: 'impl-9f4b1c7d',
  description: 'at-22222222.md',
  blocked_by: ['at-a1b2c3d4'],
  blocks: [],
  scope: { files: ['src/next.ts'], modules: ['task-validation'] },
  acceptance_criteria: [
    { id: 'ac-22200001', type: 'build', description: 'Build', verify: 'npx tsc --noEmit' },
  ],
  context_refs: ['spec-fa3a90b8#atomic-tasks'],
};

function makeValidContext(overrides?: Partial<TaskValidationContext>): TaskValidationContext {
  return {
    siblingTasks: [siblingBlocker, validTask, siblingBlocked],
    existingTaskIds: new Set<string>(),
    parentImplId: 'impl-9f4b1c7d',
    descriptionFileExists: true,
    ...overrides,
  };
}

function findRule(results: { rule: string; pass: boolean; message: string }[], rule: string) {
  return results.find((r) => r.rule === rule);
}

// ============================================================
// R0-T01 through R0-T14: Task Definition Structural Checks
// ============================================================

describe('R0-T01 through R0-T14: Task Definition Structural Checks', () => {
  it('passes for a valid task definition', () => {
    const result = validateTaskRing0(validTask, validMarkdown, makeValidContext());
    expect(result.valid).toBe(true);
    expect(result.results.every((r) => r.pass)).toBe(true);
  });

  it('R0-T01: fails for schema violation (missing scope)', () => {
    const badTask = loadJson<TaskDefinition>('invalid/schema-violation.json');
    const ctx = makeValidContext({ siblingTasks: [badTask] });
    const result = validateTaskRing0(badTask, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T01');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Schema validation failed');
  });

  it('R0-T01: fails for bad ID format', () => {
    const badTask = loadJson<TaskDefinition>('invalid/bad-id-format.json');
    const ctx = makeValidContext({ siblingTasks: [badTask] });
    const result = validateTaskRing0(badTask, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T01');
    expect(rule?.pass).toBe(false);
  });

  it('R0-T02: fails for duplicate task ID', () => {
    const ctx = makeValidContext({ existingTaskIds: new Set([validTask.id]) });
    const result = validateTaskRing0(validTask, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T02');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('already exists');
  });

  it('R0-T03: fails for wrong parent impl ID', () => {
    const ctx = makeValidContext({ parentImplId: 'impl-00000000' });
    const result = validateTaskRing0(validTask, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T03');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('does not match');
  });

  it('R0-T04: fails when description file does not exist', () => {
    const ctx = makeValidContext({ descriptionFileExists: false });
    const result = validateTaskRing0(validTask, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T04');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('not found');
  });

  it('R0-T05: fails for unknown blocked_by reference', () => {
    const task: TaskDefinition = {
      ...validTask,
      blocked_by: ['at-99999999'],
      blocks: [],
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T05');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('at-99999999');
  });

  it('R0-T06: fails for unknown blocks reference', () => {
    const task: TaskDefinition = {
      ...validTask,
      blocked_by: [],
      blocks: ['at-99999999'],
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T06');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('at-99999999');
  });

  it('R0-T07: fails for asymmetric blocks (A.blocks has B but B.blocked_by missing A)', () => {
    const taskA = loadJson<TaskDefinition>('invalid/asymmetric-blocks.json');
    const taskB = loadJson<TaskDefinition>('invalid/asymmetric-blocks-sibling.json');
    const ctx = makeValidContext({ siblingTasks: [taskA, taskB] });
    const result = validateTaskRing0(taskA, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T07');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('blocked_by missing');
  });

  it('R0-T07: fails for asymmetric blocked_by (A.blocked_by has C but C.blocks missing A)', () => {
    const taskA: TaskDefinition = {
      ...validTask,
      id: 'at-aaaa0003',
      blocked_by: ['at-aaaa0004'],
      blocks: [],
    };
    const taskC: TaskDefinition = {
      ...validTask,
      id: 'at-aaaa0004',
      blocked_by: [],
      blocks: [],  // Missing at-aaaa0003
    };
    const ctx = makeValidContext({ siblingTasks: [taskA, taskC] });
    const result = validateTaskRing0(taskA, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T07');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('blocks missing');
  });

  it('R0-T07: passes for valid symmetric dependencies with multiple deps', () => {
    const taskA: TaskDefinition = {
      ...validTask,
      id: 'at-aaaa0005',
      blocked_by: [],
      blocks: ['at-aaaa0006', 'at-aaaa0007'],
    };
    const taskB: TaskDefinition = {
      ...validTask,
      id: 'at-aaaa0006',
      blocked_by: ['at-aaaa0005'],
      blocks: [],
    };
    const taskC: TaskDefinition = {
      ...validTask,
      id: 'at-aaaa0007',
      blocked_by: ['at-aaaa0005'],
      blocks: [],
    };
    const ctx = makeValidContext({ siblingTasks: [taskA, taskB, taskC] });
    const result = validateTaskRing0(taskA, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T07');
    expect(rule?.pass).toBe(true);
  });

  it('R0-T08: fails for cyclic dependencies (A->B->C->A)', () => {
    const taskA = loadJson<TaskDefinition>('invalid/cyclic-deps-a.json');
    const taskB = loadJson<TaskDefinition>('invalid/cyclic-deps-b.json');
    const taskC = loadJson<TaskDefinition>('invalid/cyclic-deps-c.json');
    const ctx = makeValidContext({ siblingTasks: [taskA, taskB, taskC] });
    const result = validateTaskRing0(taskA, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T08');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Cycle detected');
  });

  it('R0-T08: fails for direct cycle (A->B->A)', () => {
    const taskA: TaskDefinition = {
      ...validTask,
      id: 'at-dddd0010',
      blocked_by: ['at-dddd0011'],
      blocks: ['at-dddd0011'],
    };
    const taskB: TaskDefinition = {
      ...validTask,
      id: 'at-dddd0011',
      blocked_by: ['at-dddd0010'],
      blocks: ['at-dddd0010'],
    };
    const ctx = makeValidContext({ siblingTasks: [taskA, taskB] });
    const result = validateTaskRing0(taskA, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T08');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Cycle detected');
  });

  it('R0-T08: passes for valid DAG (linear chain)', () => {
    const taskA: TaskDefinition = {
      ...validTask,
      id: 'at-dddd0020',
      blocked_by: [],
      blocks: ['at-dddd0021'],
    };
    const taskB: TaskDefinition = {
      ...validTask,
      id: 'at-dddd0021',
      blocked_by: ['at-dddd0020'],
      blocks: ['at-dddd0022'],
    };
    const taskC: TaskDefinition = {
      ...validTask,
      id: 'at-dddd0022',
      blocked_by: ['at-dddd0021'],
      blocks: [],
    };
    const ctx = makeValidContext({ siblingTasks: [taskA, taskB, taskC] });
    const result = validateTaskRing0(taskA, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T08');
    expect(rule?.pass).toBe(true);
  });

  it('R0-T09: fails for duplicate criterion IDs', () => {
    const task = loadJson<TaskDefinition>('invalid/duplicate-criterion-ids.json');
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T09');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Duplicate');
  });

  it('R0-T10: fails when test criterion missing verify', () => {
    // The JSON schema will catch this at R0-T01, but R0-T10 also checks it independently.
    // We construct the task in-memory to bypass schema validation for isolated R0-T10 check.
    const task: TaskDefinition = {
      ...validTask,
      acceptance_criteria: [
        {
          id: 'ac-eee00001',
          type: 'test',
          description: 'Tests pass',
        } as any,
      ],
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T10');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Missing verify');
  });

  it('R0-T10: passes when build criterion has verify', () => {
    const task: TaskDefinition = {
      ...validTask,
      acceptance_criteria: [
        { id: 'ac-eee00002', type: 'build', description: 'Build', verify: 'npx tsc --noEmit' },
      ],
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T10');
    expect(rule?.pass).toBe(true);
  });

  it('R0-T10: passes when lint criterion has verify', () => {
    const task: TaskDefinition = {
      ...validTask,
      acceptance_criteria: [
        { id: 'ac-eee00003', type: 'lint', description: 'Lint', verify: 'npx eslint .' },
      ],
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T10');
    expect(rule?.pass).toBe(true);
  });

  it('R0-T11: fails when review criterion missing rubric', () => {
    const task: TaskDefinition = {
      ...validTask,
      acceptance_criteria: [
        {
          id: 'ac-fff00001',
          type: 'review',
          description: 'Code review',
        } as any,
      ],
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T11');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Missing rubric');
  });

  it('R0-T12: fails when scope.files is empty', () => {
    const task: TaskDefinition = {
      ...validTask,
      scope: { files: [], modules: ['task-validation'] },
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T12');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('empty');
  });

  it('R0-T13: fails when context_refs is empty', () => {
    const task: TaskDefinition = {
      ...validTask,
      context_refs: [],
    };
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T13');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('empty');
  });

  it('R0-T14: fails for self-reference in blocked_by', () => {
    const task = loadJson<TaskDefinition>('invalid/self-reference.json');
    const ctx = makeValidContext({ siblingTasks: [task] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T14');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Self-reference');
  });

  it('R0-T14: fails for self-reference in blocks', () => {
    const task: TaskDefinition = {
      ...validTask,
      blocks: [validTask.id],
    };
    const ctx = makeValidContext({ siblingTasks: [task, siblingBlocker] });
    const result = validateTaskRing0(task, validMarkdown, ctx);
    const rule = findRule(result.results, 'R0-T14');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Self-reference');
  });
});

// ============================================================
// R0-T20 through R0-T24: Task Description Markdown Checks
// ============================================================

describe('R0-T20 through R0-T24: Task Description Markdown Checks', () => {
  it('passes for valid markdown', () => {
    const result = validateTaskRing0(validTask, validMarkdown, makeValidContext());
    for (const ruleId of ['R0-T20', 'R0-T21', 'R0-T22', 'R0-T23', 'R0-T24']) {
      const rule = findRule(result.results, ruleId);
      expect(rule?.pass).toBe(true);
    }
  });

  it('R0-T20: fails when H1 does not match pattern', () => {
    const badMd = '# This is a bad title without ID\n\n## Objective\n\nSome text.\n\n## Context\n\nSome text.\n\n## Approach\n\nSome text.\n\n## Constraints\n\nSome text.\n\n## References\n\nSome text.';
    const result = validateTaskRing0(validTask, badMd, makeValidContext());
    const rule = findRule(result.results, 'R0-T20');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('does not match pattern');
  });

  it('R0-T21: fails with wrong number of H2 sections', () => {
    const badMd = loadMarkdown('invalid/bad-markdown.md');
    const result = validateTaskRing0(validTask, badMd, makeValidContext());
    const rule = findRule(result.results, 'R0-T21');
    expect(rule?.pass).toBe(false);
  });

  it('R0-T22: fails when H2 sections are in wrong order', () => {
    const badMd = `# at-a1b2c3d4: Task Title

## Context

Some context.

## Objective

Some objective.

## Approach

Some approach.

## Constraints

Some constraints.

## References

Some references.`;
    const result = validateTaskRing0(validTask, badMd, makeValidContext());
    const rule = findRule(result.results, 'R0-T22');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('order mismatch');
  });

  it('R0-T23: fails when H2 section is empty', () => {
    const badMd = `# at-a1b2c3d4: Task Title

## Objective

Some objective.

## Context

Some context.

## Approach

## Constraints

Some constraints.

## References

Some references.`;
    const result = validateTaskRing0(validTask, badMd, makeValidContext());
    const rule = findRule(result.results, 'R0-T23');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Empty H2');
  });

  it('R0-T24: fails when H1 id does not match JSON id', () => {
    const mismatchMd = `# at-99999999: Wrong Task ID

## Objective

Some objective.

## Context

Some context.

## Approach

Some approach.

## Constraints

Some constraints.

## References

Some references.`;
    const result = validateTaskRing0(validTask, mismatchMd, makeValidContext());
    const rule = findRule(result.results, 'R0-T24');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('does not match definition ID');
  });
});

// ============================================================
// R0-T30 through R0-T34: Execution Record Checks
// ============================================================

describe('R0-T30 through R0-T34: Execution Record Checks', () => {
  function makeExecContext(overrides?: Partial<ExecutionRecordContext>): ExecutionRecordContext {
    return {
      taskDefinition: validTask,
      existingRecords: [],
      ...overrides,
    };
  }

  it('passes for a valid execution record', () => {
    const result = validateExecutionRecord(validExecutionRecord, makeExecContext());
    expect(result.valid).toBe(true);
    expect(result.results.every((r) => r.pass)).toBe(true);
  });

  it('R0-T30: fails for schema violation in execution record', () => {
    // Provide structurally complete record with an extra field to trigger additionalProperties failure
    const badRecord: ExecutionRecord = {
      ...validExecutionRecord,
      extra_field: 'invalid',
    } as ExecutionRecord & { extra_field: string };
    const result = validateExecutionRecord(badRecord, makeExecContext());
    const rule = findRule(result.results, 'R0-T30');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Schema validation failed');
  });

  it('R0-T31: fails when task_id references non-existent task', () => {
    const record: ExecutionRecord = {
      ...validExecutionRecord,
      task_id: 'at-00000000',
    };
    const result = validateExecutionRecord(record, makeExecContext());
    const rule = findRule(result.results, 'R0-T31');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('does not match task definition');
  });

  it('R0-T32: passes for first run (run=1, no prior records)', () => {
    const result = validateExecutionRecord(validExecutionRecord, makeExecContext());
    const rule = findRule(result.results, 'R0-T32');
    expect(rule?.pass).toBe(true);
  });

  it('R0-T32: passes for sequential run (run=2 with existing run=1)', () => {
    const record: ExecutionRecord = {
      ...validExecutionRecord,
      run: 2,
    };
    const ctx = makeExecContext({ existingRecords: [validExecutionRecord] });
    const result = validateExecutionRecord(record, ctx);
    const rule = findRule(result.results, 'R0-T32');
    expect(rule?.pass).toBe(true);
  });

  it('R0-T32: fails for non-sequential run number (gap in runs)', () => {
    const badRecord = loadJson<ExecutionRecord>('invalid/bad-execution-record.json');
    // run=3 but only run=1 exists
    const ctx = makeExecContext({ existingRecords: [validExecutionRecord] });
    const result = validateExecutionRecord(badRecord, ctx);
    const rule = findRule(result.results, 'R0-T32');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('not sequential');
  });

  it('R0-T33: fails for invalid criterion_id in results', () => {
    const orphanRecord = loadJson<ExecutionRecord>('invalid/orphan-criterion-record.json');
    const result = validateExecutionRecord(orphanRecord, makeExecContext());
    const rule = findRule(result.results, 'R0-T33');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('ac-99999999');
  });

  it('R0-T34: fails for duplicate criterion_id in criteria_results', () => {
    const record: ExecutionRecord = {
      ...validExecutionRecord,
      criteria_results: [
        { criterion_id: 'ac-aaa11111', verdict: 'pass', output: 'Passed' },
        { criterion_id: 'ac-aaa11111', verdict: 'fail', output: 'Failed' },
      ],
    };
    const result = validateExecutionRecord(record, makeExecContext());
    const rule = findRule(result.results, 'R0-T34');
    expect(rule?.pass).toBe(false);
    expect(rule?.message).toContain('Duplicate');
  });
});

// ============================================================
// CL-F01 and CL-F02: Full-Stack Traceability
// ============================================================

describe('CL-F01 and CL-F02: Full-Stack Traceability', () => {
  const specDef: SpecDefinition = {
    id: 'spec-fa3a90b8',
    title: 'Test Spec',
    description: 'spec-fa3a90b8.md',
    status: 'decomposed',
    version: 1,
    implementation_docs: ['impl-9f4b1c7d'],
  };

  const implDef: ImplDefinition = {
    id: 'impl-9f4b1c7d',
    spec_sections: ['spec-fa3a90b8#atomic-tasks', 'spec-fa3a90b8#acceptance-criteria-and-execution'],
    description: 'impl-9f4b1c7d.md',
    modules: ['task-validation'],
    status: 'decomposed',
    atomic_tasks: ['at-a1b2c3d4'],
  };

  const implMarkdown = `# impl-9f4b1c7d

## REQ-14 Task Validation (from spec-fa3a90b8#atomic-tasks)

Task validation details.

## REQ-18 Execution Records (from spec-fa3a90b8#acceptance-criteria-and-execution)

Execution record details.
`;

  function makeTraceabilityContext(overrides?: Partial<FullStackTraceabilityContext>): FullStackTraceabilityContext {
    return {
      specs: [specDef],
      implDocs: [implDef],
      tasks: [validTask],
      implMarkdowns: new Map([['impl-9f4b1c7d', implMarkdown]]),
      ...overrides,
    };
  }

  it('CL-F01: passes when all spec requirements have full chain', () => {
    // Create a task that covers both spec sections from the impl doc
    const fullCoverageTask: TaskDefinition = {
      ...validTask,
      context_refs: [
        'spec-fa3a90b8#atomic-tasks',
        'spec-fa3a90b8#acceptance-criteria-and-execution',
      ],
    };
    const ctx = makeTraceabilityContext({ tasks: [fullCoverageTask] });
    const result = validateCLF01(ctx);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('CL-F01: fails when spec requirement has no task coverage', () => {
    // Add a spec section to impl that no task covers
    const implWithExtra: ImplDefinition = {
      ...implDef,
      spec_sections: [
        'spec-fa3a90b8#atomic-tasks',
        'spec-fa3a90b8#acceptance-criteria-and-execution',
        'spec-fa3a90b8#uncovered-section',
      ],
    };
    const ctx = makeTraceabilityContext({ implDocs: [implWithExtra] });
    const result = validateCLF01(ctx);
    expect(result.passed).toBe(false);
    const uncoveredIssue = result.issues.find((i) =>
      i.description.includes('uncovered-section'),
    );
    expect(uncoveredIssue).toBeDefined();
  });

  it('CL-F02: passes when all criteria trace back to spec', () => {
    const ctx = makeTraceabilityContext();
    const result = validateCLF02(ctx);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('CL-F02: fails for orphan acceptance criterion (no spec trace)', () => {
    // Task with a context_ref that is not in the parent impl's spec_sections
    const orphanTask: TaskDefinition = {
      ...validTask,
      id: 'at-bbbb0001',
      context_refs: ['spec-fa3a90b8#nonexistent-section'],
    };
    const ctx = makeTraceabilityContext({ tasks: [orphanTask] });
    const result = validateCLF02(ctx);
    expect(result.passed).toBe(false);
    const orphanIssue = result.issues.find((i) => i.rule === 'CL-F02');
    expect(orphanIssue).toBeDefined();
    expect(orphanIssue?.description).toContain('no backward chain');
  });
});
