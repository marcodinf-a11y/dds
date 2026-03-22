import type { ImplDefinition } from '../../types/definitions.js';

/**
 * Minimal task definition interface for cross-level validation.
 * Uses a local interface to avoid a hard dependency on the full
 * AtomicTaskDefinition type (which may not yet exist).
 */
export interface TaskDefinitionMinimal {
  id: string;
  parent: string;
  scope: {
    modules: string[];
  };
  context_refs: string[];
  blocked_by: string[];
  blocks: string[];
}

export interface ImplTaskCheckResult {
  rule: string;
  pass: boolean;
  message: string;
}

export interface ImplTaskCrossLevelResult {
  checks: ImplTaskCheckResult[];
  pass: boolean;
}

/**
 * CL-T01: Bidirectional parent-task consistency.
 *
 * Every task's `parent` must reference an impl doc that lists that task
 * in `atomic_tasks`, and every impl doc's `atomic_tasks` entry must
 * correspond to a task whose `parent` equals that impl doc's ID.
 */
function validateCLT01(
  implDocs: ImplDefinition[],
  tasks: TaskDefinitionMinimal[]
): ImplTaskCheckResult[] {
  const checks: ImplTaskCheckResult[] = [];

  const implById = new Map<string, ImplDefinition>();
  for (const impl of implDocs) {
    implById.set(impl.id, impl);
  }

  const taskById = new Map<string, TaskDefinitionMinimal>();
  for (const task of tasks) {
    taskById.set(task.id, task);
  }

  // Direction 1: For each task, verify its parent impl doc lists it
  for (const task of tasks) {
    const parentImpl = implById.get(task.parent);
    if (!parentImpl) {
      checks.push({
        rule: 'CL-T01',
        pass: false,
        message: `Task ${task.id} references parent ${task.parent} which does not exist`,
      });
      continue;
    }
    const listedTasks = parentImpl.atomic_tasks ?? [];
    if (!listedTasks.includes(task.id)) {
      checks.push({
        rule: 'CL-T01',
        pass: false,
        message: `Task ${task.id} has parent ${task.parent}, but that impl doc does not list ${task.id} in atomic_tasks`,
      });
    }
  }

  // Direction 2: For each impl doc, verify all listed tasks reference it as parent
  for (const impl of implDocs) {
    const listedTasks = impl.atomic_tasks ?? [];
    for (const taskId of listedTasks) {
      const task = taskById.get(taskId);
      if (!task) {
        checks.push({
          rule: 'CL-T01',
          pass: false,
          message: `Impl doc ${impl.id} lists task ${taskId} in atomic_tasks, but that task does not exist`,
        });
        continue;
      }
      if (task.parent !== impl.id) {
        checks.push({
          rule: 'CL-T01',
          pass: false,
          message: `Impl doc ${impl.id} lists task ${taskId} in atomic_tasks, but that task's parent is ${task.parent}`,
        });
      }
    }
  }

  if (checks.length === 0) {
    checks.push({
      rule: 'CL-T01',
      pass: true,
      message: 'All parent-task references are bidirectionally consistent',
    });
  }

  return checks;
}

/**
 * CL-T02: Decomposed status requires at least one task.
 *
 * Every impl doc with `status: decomposed` must have at least one
 * atomic task in its `atomic_tasks` array that actually exists as
 * a task definition.
 */
function validateCLT02(
  implDocs: ImplDefinition[],
  tasks: TaskDefinitionMinimal[]
): ImplTaskCheckResult[] {
  const checks: ImplTaskCheckResult[] = [];

  const taskIds = new Set(tasks.map((t) => t.id));

  for (const impl of implDocs) {
    if (impl.status !== 'decomposed') {
      continue;
    }
    const listedTasks = impl.atomic_tasks ?? [];
    const existingTasks = listedTasks.filter((id) => taskIds.has(id));
    if (existingTasks.length === 0) {
      checks.push({
        rule: 'CL-T02',
        pass: false,
        message: `Impl doc ${impl.id} has status 'decomposed' but has no existing atomic tasks`,
      });
    }
  }

  if (checks.length === 0) {
    checks.push({
      rule: 'CL-T02',
      pass: true,
      message: 'All decomposed impl docs have at least one existing atomic task',
    });
  }

  return checks;
}

/**
 * CL-T03: Module containment.
 *
 * For every impl doc:
 * - Full coverage: every module in the impl doc's `modules` appears in
 *   at least one child task's `scope.modules`.
 * - No boundary violations: every child task's `scope.modules` is a
 *   subset of the impl doc's `modules`.
 */
function validateCLT03(
  implDocs: ImplDefinition[],
  tasks: TaskDefinitionMinimal[]
): ImplTaskCheckResult[] {
  const checks: ImplTaskCheckResult[] = [];

  // Index tasks by parent
  const tasksByParent = new Map<string, TaskDefinitionMinimal[]>();
  for (const task of tasks) {
    if (!tasksByParent.has(task.parent)) {
      tasksByParent.set(task.parent, []);
    }
    tasksByParent.get(task.parent)!.push(task);
  }

  for (const impl of implDocs) {
    const childTasks = tasksByParent.get(impl.id) ?? [];
    if (childTasks.length === 0) {
      continue;
    }

    const implModules = new Set(impl.modules);

    // Compute set of modules covered by child tasks
    const coveredModules = new Set<string>();
    for (const task of childTasks) {
      for (const mod of task.scope.modules) {
        coveredModules.add(mod);
      }
    }

    // Full coverage check: every impl module must appear in at least one child
    for (const mod of implModules) {
      if (!coveredModules.has(mod)) {
        checks.push({
          rule: 'CL-T03',
          pass: false,
          message: `Impl doc ${impl.id} module '${mod}' is not covered by any child task`,
        });
      }
    }

    // Subset check: every child task module must be in the impl's modules
    for (const task of childTasks) {
      for (const mod of task.scope.modules) {
        if (!implModules.has(mod)) {
          checks.push({
            rule: 'CL-T03',
            pass: false,
            message: `Task ${task.id} has module '${mod}' not in parent impl doc ${impl.id} modules`,
          });
        }
      }
    }
  }

  if (checks.length === 0) {
    checks.push({
      rule: 'CL-T03',
      pass: true,
      message: 'All module containment checks pass (full coverage and no boundary violations)',
    });
  }

  return checks;
}

/**
 * CL-T04: Traceability coverage.
 *
 * The union of all `context_refs` across an impl doc's atomic tasks
 * must cover all entries in the impl doc's `spec_sections`.
 */
function validateCLT04(
  implDocs: ImplDefinition[],
  tasks: TaskDefinitionMinimal[]
): ImplTaskCheckResult[] {
  const checks: ImplTaskCheckResult[] = [];

  // Index tasks by parent
  const tasksByParent = new Map<string, TaskDefinitionMinimal[]>();
  for (const task of tasks) {
    if (!tasksByParent.has(task.parent)) {
      tasksByParent.set(task.parent, []);
    }
    tasksByParent.get(task.parent)!.push(task);
  }

  for (const impl of implDocs) {
    const childTasks = tasksByParent.get(impl.id) ?? [];
    if (childTasks.length === 0) {
      continue;
    }

    // Compute union of context_refs across child tasks
    const coveredRefs = new Set<string>();
    for (const task of childTasks) {
      for (const ref of task.context_refs) {
        coveredRefs.add(ref);
      }
    }

    // Verify every spec_section is covered
    for (const section of impl.spec_sections) {
      if (!coveredRefs.has(section)) {
        checks.push({
          rule: 'CL-T04',
          pass: false,
          message: `Impl doc ${impl.id} spec_section '${section}' is not covered by any child task's context_refs`,
        });
      }
    }
  }

  if (checks.length === 0) {
    checks.push({
      rule: 'CL-T04',
      pass: true,
      message: 'All impl doc spec_sections are covered by child task context_refs',
    });
  }

  return checks;
}

/**
 * CL-T05: Dependency ordering consistency.
 *
 * If impl doc A depends on impl doc B (via `dependencies`), then no task
 * from B may be `blocked_by` a task from A. This would mean B's work
 * depends on A's work, contradicting A's declaration that it depends on B.
 */
function validateCLT05(
  implDocs: ImplDefinition[],
  tasks: TaskDefinitionMinimal[]
): ImplTaskCheckResult[] {
  const checks: ImplTaskCheckResult[] = [];

  // Index tasks by parent
  const tasksByParent = new Map<string, TaskDefinitionMinimal[]>();
  for (const task of tasks) {
    if (!tasksByParent.has(task.parent)) {
      tasksByParent.set(task.parent, []);
    }
    tasksByParent.get(task.parent)!.push(task);
  }

  // Build set of task IDs per impl doc for quick lookup
  const taskIdsByParent = new Map<string, Set<string>>();
  for (const [parentId, parentTasks] of tasksByParent) {
    taskIdsByParent.set(parentId, new Set(parentTasks.map((t) => t.id)));
  }

  // For each impl doc A that depends on impl doc B:
  // Check that no task from B is blocked_by any task from A
  for (const implA of implDocs) {
    const depsOfA = implA.dependencies ?? [];
    const tasksOfA = taskIdsByParent.get(implA.id) ?? new Set<string>();

    for (const implBId of depsOfA) {
      const tasksOfB = tasksByParent.get(implBId) ?? [];

      for (const taskB of tasksOfB) {
        for (const blockedById of taskB.blocked_by) {
          if (tasksOfA.has(blockedById)) {
            checks.push({
              rule: 'CL-T05',
              pass: false,
              message: `Impl doc ${implA.id} depends on ${implBId}, but task ${taskB.id} (from ${implBId}) is blocked_by task ${blockedById} (from ${implA.id}), contradicting impl-level ordering`,
            });
          }
        }
      }
    }
  }

  if (checks.length === 0) {
    checks.push({
      rule: 'CL-T05',
      pass: true,
      message: 'Task dependency ordering is consistent with impl doc dependency ordering',
    });
  }

  return checks;
}

/**
 * Validate all cross-level invariants between impl docs and their atomic tasks.
 *
 * Runs CL-T01 through CL-T05 and returns a combined result.
 * All checks are deterministic pure functions with no I/O.
 */
export function validateImplTaskCrossLevel(
  implDocs: ImplDefinition[],
  tasks: TaskDefinitionMinimal[]
): ImplTaskCrossLevelResult {
  const checks: ImplTaskCheckResult[] = [
    ...validateCLT01(implDocs, tasks),
    ...validateCLT02(implDocs, tasks),
    ...validateCLT03(implDocs, tasks),
    ...validateCLT04(implDocs, tasks),
    ...validateCLT05(implDocs, tasks),
  ];

  return {
    checks,
    pass: checks.every((c) => c.pass),
  };
}
