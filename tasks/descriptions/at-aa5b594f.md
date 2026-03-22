# at-aa5b594f: Task Schema: Ring 0 Validators

## Objective

Implement the two Ring 0 validator functions for the task level: `validateTaskRing0()` covering all task definition and description structural checks (R0-T01 through R0-T14, R0-T20 through R0-T24), and `validateExecutionRecord()` covering all execution record structural checks (R0-T30 through R0-T34). After this task, all task-level artifacts can be deterministically validated for structural correctness.

## Context

The Ring 0 validator pattern is established by impl-7e2a9f1b (spec-level: `src/validators/spec/ring0.ts`) and impl-3c8d5e0a (impl-doc-level: `src/validators/impl/ring0.ts`). Each exports a pure function that takes a definition object, markdown string, and context object, then returns a `Ring0Result` with per-rule pass/fail entries.

Shared utilities already available:
- `src/parsers/markdown.ts` — heading extractor that returns an array of `{ level, text, content }` objects. Used for R0-T20 through R0-T24.
- `src/parsers/graph.ts` — `detectCycle(adjacencyList)` function for DFS cycle detection. Used for R0-T08.
- `ajv` v8 — JSON Schema validator. Used for R0-T01 and R0-T30.

The task validator is unique in requiring a `TaskValidationContext` that includes `siblingTasks: TaskDefinition[]` for dependency symmetry checking (R0-T07). This is unlike spec and impl doc validators which only need their own document set.

The execution record validator needs a separate `ExecutionRecordContext` containing the referenced `TaskDefinition` and all existing execution records for sequential run number validation (R0-T32).

Key rule details:
- R0-T07 (dependency symmetry): For every task B in `this.blocks`, verify B.blocked_by includes this task's ID. For every task A in `this.blocked_by`, verify A.blocks includes this task's ID.
- R0-T08 (acyclicity): Build adjacency list from all sibling tasks' `blocks` relationships, run DFS cycle detection.
- R0-T21 (H2 sections): Exactly five H2s in order: Objective, Context, Approach, Constraints, References.
- R0-T10/R0-T11: Criterion type field consistency — test/build/lint must have `verify`, review must have `rubric`.

## Approach

1. Create `src/validators/task/ring0.ts`. Import `TaskDefinition`, `AcceptanceCriterion`, `ExecutionRecord`, `CriterionResult` from `src/types/definitions.ts`. Import the heading extractor from `src/parsers/markdown.ts`. Import `detectCycle` from `src/parsers/graph.ts`. Import `Ajv` from `ajv`. Import the JSON schemas from `src/schemas/task.schema.json` and `src/schemas/execution-record.schema.json`.

2. Define the `TaskValidationContext` interface: `siblingTasks: TaskDefinition[]`, `existingTaskIds: Set<string>`, `parentImplId: string`, `descriptionFileExists: boolean`.

3. Define the `ExecutionRecordContext` interface: `taskDefinition: TaskDefinition`, `existingRecords: ExecutionRecord[]`.

4. Implement `validateTaskRing0(task: TaskDefinition, markdown: string, context: TaskValidationContext): Ring0Result`:
   - R0-T01: Validate task JSON against task.schema.json using ajv.
   - R0-T02: Check task.id not in context.existingTaskIds.
   - R0-T03: Check task.parent === context.parentImplId (or validate against known impl IDs).
   - R0-T04: Check context.descriptionFileExists is true.
   - R0-T05: Check every entry in task.blocked_by exists in sibling task IDs.
   - R0-T06: Check every entry in task.blocks exists in sibling task IDs.
   - R0-T07: For each B in task.blocks, verify B.blocked_by includes task.id. For each A in task.blocked_by, verify A.blocks includes task.id.
   - R0-T08: Build adjacency list from all sibling tasks, call detectCycle().
   - R0-T09: Check all acceptance_criteria[].id values are unique within the task.
   - R0-T10: For criteria with type test/build/lint, check verify field exists.
   - R0-T11: For criteria with type review, check rubric field exists.
   - R0-T12: Check task.scope.files.length >= 1.
   - R0-T13: Check task.context_refs.length >= 1.
   - R0-T14: Check task.id not in task.blocked_by and not in task.blocks.
   - R0-T20: Extract H1 from markdown, verify it matches `# {task.id}: {title}`.
   - R0-T21: Extract all H2 headings, verify exactly 5 in order: Objective, Context, Approach, Constraints, References.
   - R0-T22: Verify H2 order matches required sequence.
   - R0-T23: Verify each H2 section has non-empty content.
   - R0-T24: Verify the at-id in the H1 matches task.id.
   - Collect all rule results into a Ring0Result array and return.

5. Implement `validateExecutionRecord(record: ExecutionRecord, context: ExecutionRecordContext): Ring0Result`:
   - R0-T30: Validate record JSON against execution-record.schema.json using ajv.
   - R0-T31: Check record.task_id matches context.taskDefinition.id.
   - R0-T32: Check record.run is exactly max(existing runs for this task_id) + 1 (sequential, no gaps).
   - R0-T33: Check every criterion_id in record.criteria_results references a criterion in context.taskDefinition.acceptance_criteria.
   - R0-T34: Check no duplicate criterion_ids within record.criteria_results.
   - Return Ring0Result.

6. Export both functions and both context interfaces.

## Constraints

- Do not modify any files outside src/validators/task/ring0.ts.
- Do not modify shared parsers (markdown.ts, graph.ts) — consume only.
- Both validator functions must be pure functions: no file I/O, no side effects.
- Do not implement Ring 1 or Ring 2 checks in this file.
- Use the same ajv configuration pattern as the spec and impl doc validators.

## References

- spec-fa3a90b8#atomic-tasks — Defines R0-T01 through R0-T14, R0-T20 through R0-T24 validation rules
- spec-fa3a90b8#acceptance-criteria-and-execution — Defines R0-T30 through R0-T34 execution record rules
- impl-9f4b1c7d — Parent implementation document; REQ-05 through REQ-08, REQ-14
- at-ce9fa326 — Provides TaskDefinition, AcceptanceCriterion, ExecutionRecord types and JSON schemas
- impl-7e2a9f1b — Established Ring 0 validator pattern for spec-level
- impl-3c8d5e0a — Established Ring 0 validator pattern for impl-doc-level, provides graph utilities
