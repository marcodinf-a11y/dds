# at-ce9fa326: Task Schema: JSON Schemas and TypeScript Types

## Objective

Define the JSON Schema files for atomic task definitions and execution records, and add the corresponding TypeScript interfaces to the shared type definitions module. After this task, the project has machine-validatable schemas for all task-level artifacts and compile-time type safety for task data structures.

## Context

The project has an established pattern from impl-7e2a9f1b (spec-level) and impl-3c8d5e0a (impl-doc-level): each document level has a JSON Schema file in `src/schemas/` and corresponding TypeScript interfaces in `src/types/definitions.ts`. The definitions.ts file already contains `SpecDefinition` and `ImplDefinition` interfaces. This task adds the task-level types alongside them.

The canonical schemas are defined in `docs/03-atomic-task-schema.md` under the "Artifact 1: Task Definition (JSON)" and "Artifact 3: Execution Record (JSON)" sections. These must be faithfully transcribed into standalone `.schema.json` files.

Key structural details:
- The `AtomicTaskDefinition` schema uses a `oneOf` discriminator under `definitions.AcceptanceCriterion` with four sub-schemas: `TestCriterion`, `BuildCriterion`, `LintCriterion`, `ReviewCriterion`. The first three have a `verify` field; `ReviewCriterion` has a `rubric` field instead.
- The `scope` property is a nested object with required `files` (minItems: 1) and `modules` (minItems: 1) arrays.
- The `ExecutionRecord` schema includes a `CriterionResult` definition with `criterion_id`, `verdict` (pass/fail/skipped), and optional `output`.
- All schemas use JSON Schema Draft-07.

Naming conventions: kebab-case files, PascalCase interfaces, camelCase functions.

## Approach

1. Create `src/schemas/task.schema.json` — transcribe the AtomicTaskDefinition schema from `docs/03-atomic-task-schema.md`. Include the `$schema` Draft-07 declaration, all required fields (`id`, `parent`, `description`, `blocked_by`, `blocks`, `scope`, `acceptance_criteria`, `context_refs`), the nested `scope` object definition, and the `definitions` block containing `AcceptanceCriterion` (oneOf), `TestCriterion`, `BuildCriterion`, `LintCriterion`, and `ReviewCriterion`. Set `additionalProperties: false` at both root and sub-schema levels.

2. Create `src/schemas/execution-record.schema.json` — transcribe the ExecutionRecord schema from `docs/03-atomic-task-schema.md`. Include all required fields (`task_id`, `run`, `status`, `criteria_results`, `started_at`), optional fields (`commits`, `scope_violations`, `agent_notes`, `token_usage`, `finished_at`), and the `CriterionResult` definition.

3. Add TypeScript interfaces to `src/types/definitions.ts`:
   - `TaskDefinition` interface mirroring the task schema: `id: string`, `parent: string`, `description: string`, `blocked_by: string[]`, `blocks: string[]`, `scope: { files: string[]; modules: string[] }`, `acceptance_criteria: AcceptanceCriterion[]`, `context_refs: string[]`.
   - `AcceptanceCriterion` as a discriminated union type: `TestCriterion | BuildCriterion | LintCriterion | ReviewCriterion`.
   - Individual criterion interfaces: `TestCriterion` (id, type: 'test', description, verify), `BuildCriterion` (id, type: 'build', description, verify), `LintCriterion` (id, type: 'lint', description, verify), `ReviewCriterion` (id, type: 'review', description, rubric).
   - `ExecutionRecord` interface: `task_id: string`, `run: number`, `status: 'pending' | 'running' | 'completed' | 'failed' | 'abandoned'`, `criteria_results: CriterionResult[]`, `started_at: string`, and optional fields `commits?: string[]`, `scope_violations?: string[]`, `agent_notes?: string`, `token_usage?: number`, `finished_at?: string | null`.
   - `CriterionResult` interface: `criterion_id: string`, `verdict: 'pass' | 'fail' | 'skipped'`, `output?: string`.

## Constraints

- Do not modify existing `SpecDefinition` or `ImplDefinition` interfaces in definitions.ts.
- Do not deviate from the canonical schemas in docs/03-atomic-task-schema.md.
- Do not add runtime validation logic in this task — schemas and types only.
- Do not add dependencies beyond what already exists in the project.
- JSON Schema files must use Draft-07 (`"$schema": "http://json-schema.org/draft-07/schema#"`).

## References

- spec-fa3a90b8#document-hierarchy-and-structure — Defines ID formats (at-[0-9a-f]{8}, ac-[0-9a-f]{8}) and artifact pairing rules
- spec-fa3a90b8#atomic-tasks — Defines the task definition structure, scope, and dependency fields
- spec-fa3a90b8#acceptance-criteria-and-execution — Defines acceptance criterion types and execution record structure
- impl-9f4b1c7d — Parent implementation document; REQ-01 through REQ-04, REQ-09, REQ-11
- impl-7e2a9f1b — Established the schema/types pattern for spec-level
- impl-3c8d5e0a — Established the schema/types pattern for impl-doc-level
