import { createRequire } from 'node:module';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = addFormatsModule as any;
import type { TaskDefinition, ExecutionRecord } from '../../types/definitions.js';
import { extractHeadings } from '../../parsers/markdown.js';
import { detectCycle } from '../../parsers/graph.js';
import type { Ring0RuleResult, Ring0Result } from '../../types/results.js';

const Ajv = AjvModule.default ?? AjvModule;
const require = createRequire(import.meta.url);
const taskSchema = require('../../schemas/task.schema.json') as Record<string, unknown>;
const executionRecordSchema = require('../../schemas/execution-record.schema.json') as Record<string, unknown>;

// --- Context interfaces ---

export interface TaskValidationContext {
  siblingTasks: TaskDefinition[];
  existingTaskIds: Set<string>;
  parentImplId: string;
  descriptionFileExists: boolean;
}

export interface ExecutionRecordContext {
  taskDefinition: TaskDefinition;
  existingRecords: ExecutionRecord[];
}

// --- Shared ajv instance ---

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateTaskSchema = ajv.compile(taskSchema);
const validateExecSchema = ajv.compile(executionRecordSchema);

// --- Required H2 sections in order ---

const REQUIRED_H2_SECTIONS = [
  'Objective',
  'Context',
  'Approach',
  'Constraints',
  'References',
] as const;

// --- Task Ring 0 Validator ---

export function validateTaskRing0(
  task: TaskDefinition,
  markdown: string,
  context: TaskValidationContext,
): Ring0Result {
  const results: Ring0RuleResult[] = [];

  // R0-T01: JSON validates against AtomicTaskDefinition schema
  const schemaValid = validateTaskSchema(task);
  results.push({
    rule: 'R0-T01',
    passed: !!schemaValid,
    message: schemaValid
      ? 'Task JSON validates against schema'
      : `Schema validation failed: ${ajv.errorsText(validateTaskSchema.errors)}`,
  });

  // R0-T02: ID is unique across all task definitions
  const idUnique = !context.existingTaskIds.has(task.id);
  results.push({
    rule: 'R0-T02',
    passed: idUnique,
    message: idUnique
      ? `Task ID ${task.id} is unique`
      : `Task ID ${task.id} already exists`,
  });

  // R0-T03: Parent references an existing implementation document
  const parentValid = task.parent === context.parentImplId;
  results.push({
    rule: 'R0-T03',
    passed: parentValid,
    message: parentValid
      ? `Parent ${task.parent} is valid`
      : `Parent ${task.parent} does not match expected ${context.parentImplId}`,
  });

  // R0-T04: Description file exists
  results.push({
    rule: 'R0-T04',
    passed: context.descriptionFileExists,
    message: context.descriptionFileExists
      ? `Description file ${task.description} exists`
      : `Description file ${task.description} not found`,
  });

  // Build set of sibling task IDs for dependency checks
  const siblingIds = new Set(context.siblingTasks.map((t) => t.id));
  const siblingMap = new Map(context.siblingTasks.map((t) => [t.id, t]));

  // R0-T05: All IDs in blocked_by reference existing task definitions
  const invalidBlockedBy = task.blocked_by.filter((id) => !siblingIds.has(id));
  results.push({
    rule: 'R0-T05',
    passed: invalidBlockedBy.length === 0,
    message:
      invalidBlockedBy.length === 0
        ? 'All blocked_by references are valid'
        : `Invalid blocked_by references: ${invalidBlockedBy.join(', ')}`,
  });

  // R0-T06: All IDs in blocks reference existing task definitions
  const invalidBlocks = task.blocks.filter((id) => !siblingIds.has(id));
  results.push({
    rule: 'R0-T06',
    passed: invalidBlocks.length === 0,
    message:
      invalidBlocks.length === 0
        ? 'All blocks references are valid'
        : `Invalid blocks references: ${invalidBlocks.join(', ')}`,
  });

  // R0-T07: Dependency symmetry invariant
  const symmetryErrors: string[] = [];
  for (const blockedId of task.blocks) {
    const blockedTask = siblingMap.get(blockedId);
    if (blockedTask && !blockedTask.blocked_by.includes(task.id)) {
      symmetryErrors.push(
        `${blockedId}.blocked_by missing ${task.id}`,
      );
    }
  }
  for (const blockerId of task.blocked_by) {
    const blockerTask = siblingMap.get(blockerId);
    if (blockerTask && !blockerTask.blocks.includes(task.id)) {
      symmetryErrors.push(
        `${blockerId}.blocks missing ${task.id}`,
      );
    }
  }
  results.push({
    rule: 'R0-T07',
    passed: symmetryErrors.length === 0,
    message:
      symmetryErrors.length === 0
        ? 'Dependency symmetry invariant holds'
        : `Symmetry violations: ${symmetryErrors.join('; ')}`,
  });

  // R0-T08: Dependency graph is acyclic
  const adjacencyList = new Map<string, string[]>();
  for (const sibling of context.siblingTasks) {
    adjacencyList.set(sibling.id, [...sibling.blocks]);
  }
  if (!adjacencyList.has(task.id)) {
    adjacencyList.set(task.id, [...task.blocks]);
  }
  const cycle = detectCycle(adjacencyList);
  results.push({
    rule: 'R0-T08',
    passed: cycle === null,
    message:
      cycle === null
        ? 'Dependency graph is acyclic'
        : `Cycle detected: ${cycle.join(' -> ')}`,
  });

  // R0-T09: All acceptance_criteria IDs are unique within the task
  const criteriaIds = task.acceptance_criteria.map((c) => c.id);
  const uniqueCriteriaIds = new Set(criteriaIds);
  const criteriaUnique = criteriaIds.length === uniqueCriteriaIds.size;
  results.push({
    rule: 'R0-T09',
    passed: criteriaUnique,
    message: criteriaUnique
      ? 'All acceptance criteria IDs are unique'
      : 'Duplicate acceptance criteria IDs found',
  });

  // R0-T10: Criteria of type test/build/lint have a verify field
  const verifyTypes = ['test', 'build', 'lint'] as const;
  const missingVerify = task.acceptance_criteria.filter(
    (c) =>
      verifyTypes.includes(c.type as (typeof verifyTypes)[number]) &&
      !('verify' in c && typeof (c as { verify?: unknown }).verify === 'string'),
  );
  results.push({
    rule: 'R0-T10',
    passed: missingVerify.length === 0,
    message:
      missingVerify.length === 0
        ? 'All test/build/lint criteria have verify field'
        : `Missing verify field on: ${missingVerify.map((c) => c.id).join(', ')}`,
  });

  // R0-T11: Criteria of type review have a rubric field
  const missingRubric = task.acceptance_criteria.filter(
    (c) =>
      c.type === 'review' &&
      !('rubric' in c && typeof (c as { rubric?: unknown }).rubric === 'string'),
  );
  results.push({
    rule: 'R0-T11',
    passed: missingRubric.length === 0,
    message:
      missingRubric.length === 0
        ? 'All review criteria have rubric field'
        : `Missing rubric field on: ${missingRubric.map((c) => c.id).join(', ')}`,
  });

  // R0-T12: scope.files contains at least one entry
  const hasFiles = task.scope.files.length >= 1;
  results.push({
    rule: 'R0-T12',
    passed: hasFiles,
    message: hasFiles
      ? 'scope.files is non-empty'
      : 'scope.files is empty',
  });

  // R0-T13: context_refs is non-empty
  const hasRefs = task.context_refs.length >= 1;
  results.push({
    rule: 'R0-T13',
    passed: hasRefs,
    message: hasRefs
      ? 'context_refs is non-empty'
      : 'context_refs is empty',
  });

  // R0-T14: No self-references in blocked_by or blocks
  const selfRef =
    task.blocked_by.includes(task.id) || task.blocks.includes(task.id);
  results.push({
    rule: 'R0-T14',
    passed: !selfRef,
    message: selfRef
      ? `Self-reference found in dependencies for ${task.id}`
      : 'No self-references in dependencies',
  });

  // --- Markdown checks ---
  const headings = extractHeadings(markdown);
  const h1s = headings.filter((h) => h.level === 1);
  const h2s = headings.filter((h) => h.level === 2);

  // R0-T20: H1 matches pattern # {at-id}: {title}
  const h1 = h1s[0];
  const h1Pattern = /^at-[0-9a-f]{8}:\s+.+$/;
  const h1Valid = h1 !== undefined && h1Pattern.test(h1.text);
  results.push({
    rule: 'R0-T20',
    passed: h1Valid,
    message: h1Valid
      ? 'H1 matches required pattern'
      : `H1 does not match pattern "# at-XXXXXXXX: Title". Got: "${h1?.text ?? '(none)'}"`,
  });

  // R0-T21: Exactly five H2 sections
  const hasExactlyFiveH2 = h2s.length === 5;
  results.push({
    rule: 'R0-T21',
    passed: hasExactlyFiveH2,
    message: hasExactlyFiveH2
      ? 'Exactly 5 H2 sections found'
      : `Expected 5 H2 sections, found ${h2s.length}`,
  });

  // R0-T22: H2 sections appear in the required order
  const h2Texts = h2s.map((h) => h.text);
  const h2OrderCorrect =
    h2Texts.length === REQUIRED_H2_SECTIONS.length &&
    h2Texts.every((text, i) => text === REQUIRED_H2_SECTIONS[i]);
  results.push({
    rule: 'R0-T22',
    passed: h2OrderCorrect,
    message: h2OrderCorrect
      ? 'H2 sections are in correct order'
      : `H2 order mismatch. Expected: ${REQUIRED_H2_SECTIONS.join(', ')}. Got: ${h2Texts.join(', ')}`,
  });

  // R0-T23: No H2 section is empty
  const emptyH2s = h2s.filter((h) => h.content.length === 0);
  results.push({
    rule: 'R0-T23',
    passed: emptyH2s.length === 0,
    message:
      emptyH2s.length === 0
        ? 'All H2 sections have content'
        : `Empty H2 sections: ${emptyH2s.map((h) => h.text).join(', ')}`,
  });

  // R0-T24: H1 task-id matches the JSON definition's id
  const h1Id = h1?.text.match(/^(at-[0-9a-f]{8}):/)?.[1];
  const h1IdMatch = h1Id === task.id;
  results.push({
    rule: 'R0-T24',
    passed: h1IdMatch,
    message: h1IdMatch
      ? 'H1 task ID matches definition ID'
      : `H1 task ID "${h1Id ?? '(none)'}" does not match definition ID "${task.id}"`,
  });

  return {
    valid: results.every((r) => r.passed),
    results,
  };
}

// --- Execution Record Ring 0 Validator ---

export function validateExecutionRecord(
  record: ExecutionRecord,
  context: ExecutionRecordContext,
): Ring0Result {
  const results: Ring0RuleResult[] = [];

  // R0-T30: JSON validates against ExecutionRecord schema
  const schemaValid = validateExecSchema(record);
  results.push({
    rule: 'R0-T30',
    passed: !!schemaValid,
    message: schemaValid
      ? 'Execution record validates against schema'
      : `Schema validation failed: ${ajv.errorsText(validateExecSchema.errors)}`,
  });

  // R0-T31: task_id references an existing task definition
  const taskIdValid = record.task_id === context.taskDefinition.id;
  results.push({
    rule: 'R0-T31',
    passed: taskIdValid,
    message: taskIdValid
      ? `task_id ${record.task_id} references valid task`
      : `task_id ${record.task_id} does not match task definition ${context.taskDefinition.id}`,
  });

  // R0-T32: Run number is sequential (no gaps)
  const existingRuns = context.existingRecords
    .filter((r) => r.task_id === record.task_id)
    .map((r) => r.run);
  const maxRun = existingRuns.length > 0 ? Math.max(...existingRuns) : 0;
  const runSequential = record.run === maxRun + 1;
  results.push({
    rule: 'R0-T32',
    passed: runSequential,
    message: runSequential
      ? `Run ${record.run} is sequential (previous max: ${maxRun})`
      : `Run ${record.run} is not sequential. Expected ${maxRun + 1}`,
  });

  // R0-T33: All criterion_ids reference criteria in the task definition
  const validCriteriaIds = new Set(
    context.taskDefinition.acceptance_criteria.map((c) => c.id),
  );
  const invalidCriteria = record.criteria_results.filter(
    (cr) => !validCriteriaIds.has(cr.criterion_id),
  );
  results.push({
    rule: 'R0-T33',
    passed: invalidCriteria.length === 0,
    message:
      invalidCriteria.length === 0
        ? 'All criterion_ids reference valid criteria'
        : `Invalid criterion_ids: ${invalidCriteria.map((c) => c.criterion_id).join(', ')}`,
  });

  // R0-T34: No duplicate criterion_ids within criteria_results
  const criterionIds = record.criteria_results.map((cr) => cr.criterion_id);
  const uniqueIds = new Set(criterionIds);
  const noDuplicates = criterionIds.length === uniqueIds.size;
  results.push({
    rule: 'R0-T34',
    passed: noDuplicates,
    message: noDuplicates
      ? 'No duplicate criterion_ids'
      : 'Duplicate criterion_ids found in criteria_results',
  });

  return {
    valid: results.every((r) => r.passed),
    results,
  };
}
