# impl-9f4b1c7d: Atomic Task Schema and Validation

## Objective

Implement the atomic-task-level data model (task definitions, acceptance criteria, execution records) and all task-level validation rules so that atomic tasks can be authored, structurally validated, semantically checked, and quality-assessed. Also implement the full-stack traceability invariants (CL-F01, CL-F02) that verify end-to-end reference chains from spec requirements through impl doc requirements to task acceptance criteria.

## Background

No codebase exists yet. This implementation document builds on the patterns established by Impl Doc 1 (impl-7e2a9f1b) and Impl Doc 2 (impl-3c8d5e0a): pure-function validators, prompt template exports, shared parsers, and level-agnostic result types. All file paths below reference the planned structure from the project architecture (analysis Part 14).

**Planned file locations:**

- `src/schemas/task.schema.json` — JSON Schema Draft-07 for AtomicTaskDefinition, including the `AcceptanceCriterion` oneOf discriminator (TestCriterion, BuildCriterion, LintCriterion, ReviewCriterion) and the nested `scope` object.
- `src/schemas/execution-record.schema.json` — JSON Schema Draft-07 for ExecutionRecord, including the `CriterionResult` definition. (Note: the planned file structure in Part 14 shows this as part of `task.schema.json`, but a separate file is cleaner since it's a distinct artifact type with its own lifecycle.)
- `src/types/definitions.ts` — Already contains `SpecDefinition` (Impl Doc 1) and `ImplDefinition` (Impl Doc 2). This impl doc adds `TaskDefinition`, `AcceptanceCriterion` (union type), `ExecutionRecord`, and `CriterionResult` interfaces.
- `src/validators/task/ring0.ts` — Task-level Ring 0 validator. Exports `validateTaskRing0(task: TaskDefinition, markdown: string, context: TaskValidationContext): Ring0Result` covering R0-T01 through R0-T14 and R0-T20 through R0-T24, plus `validateExecutionRecord(record: ExecutionRecord, context: ExecutionRecordContext): Ring0Result` covering R0-T30 through R0-T34.
- `src/parsers/markdown.ts` — Shared heading extractor (from Impl Doc 1). Consumed, not modified.
- `src/parsers/graph.ts` — Shared graph utilities (from Impl Doc 2). Consumed for task dependency acyclicity (R0-T08).
- `src/validators/cross-level/full-stack.ts` — Full-stack traceability invariant checker (CL-F01, CL-F02). Traverses the full spec → impl doc → task → acceptance criterion chain.
- `tests/unit/ring0/task-validator.test.ts` — Unit tests for all R0-T rules.
- `tests/fixtures/tasks/` — Synthetic task definition, description, and execution record files.

**Key differences from higher-level validators:**

- Task definitions have the most complex schema: nested `scope` object with `files` and `modules` arrays, `acceptance_criteria` array with a `oneOf` discriminator across four criterion types, and bidirectional dependency fields (`blocked_by`/`blocks`).
- R0-T07 (dependency symmetry) is unique to tasks. For every task B in `blocks`, B's `blocked_by` must contain this task's ID, and vice versa. This requires loading sibling task definitions — provided via `TaskValidationContext`.
- Execution records are a third artifact type specific to atomic tasks. They are mutable (unlike definitions and descriptions) and have their own validation rules (R0-T30 through R0-T34).
- The task Markdown template has 5 H2 sections (Objective, Context, Approach, Constraints, References) — different from spec (6) and impl doc (7).
- Scope enforcement (FR-16: rejecting modifications outside `scope.files`) is a runtime concern handled by the pipeline engine and Claude Code hooks. This impl doc validates scope declaration correctness, not runtime enforcement.

**Naming conventions:** kebab-case files, PascalCase interfaces/types, camelCase functions, UPPER_SNAKE_CASE constants.

## Requirements

- **REQ-01:** The system shall define an `AtomicTaskDefinition` JSON Schema (Draft-07) with required fields `id`, `parent`, `description`, `blocked_by`, `blocks`, `scope`, `acceptance_criteria`, `context_refs`. The `scope` object shall have required `files` and `modules` arrays. The `acceptance_criteria` array shall use a `oneOf` discriminator across four criterion types (test, build, lint, review). (from spec-fa3a90b8#atomic-tasks)

- **REQ-02:** Atomic task IDs shall use the pattern `at-[0-9a-f]{8}` and acceptance criterion IDs shall use `ac-[0-9a-f]{8}` — 8 random hex characters with type-specific prefixes. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-03:** Atomic tasks shall consist of two paired artifacts: a JSON definition and a Markdown description. The `description` field shall match `at-[0-9a-f]{8}\.md`. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-04:** Atomic task definitions shall follow a three-state status lifecycle: `draft`, `validated`, `decomposed`. (Note: tasks are leaf-level and do not decompose further, but the status field follows the same lifecycle model for consistency. In practice, tasks progress from `draft` to `validated` only.) (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-05:** The `blocked_by` and `blocks` fields across all atomic tasks shall maintain strict dependency symmetry: for every pair of tasks (A, B), A.blocks contains B's ID if and only if B.blocked_by contains A's ID. Ring 0 shall validate this (R0-T07). (from spec-fa3a90b8#atomic-tasks)

- **REQ-06:** The dependency graph formed by atomic task `blocked_by`/`blocks` relationships shall be acyclic. No task may directly or transitively depend on itself. Ring 0 shall validate this using DFS cycle detection (R0-T08). (from spec-fa3a90b8#atomic-tasks)

- **REQ-07:** The `scope.files` field shall contain at least one entry representing the exhaustive list of files the executing agent is permitted to modify. Ring 0 validates non-emptiness (R0-T12); runtime enforcement is a pipeline/hook concern. (from spec-fa3a90b8#atomic-tasks)

- **REQ-08:** Every entry in an atomic task's `scope.modules` shall be a member of the parent implementation document's `modules` list (subset constraint). This is enforced by both R0-I51 (at impl doc validation time) and CL-T03 (at cross-level invariant time). (from spec-fa3a90b8#atomic-tasks)

- **REQ-09:** Each atomic task shall have one or more acceptance criteria, each identified by a unique `ac-`prefixed ID. Criteria of type `test`, `build`, `lint` shall include a `verify` field (shell command, exit 0 = pass). Criteria of type `review` shall include a `rubric` field (LLM evaluation prompt). (from spec-fa3a90b8#acceptance-criteria-and-execution)

- **REQ-10:** Atomic task descriptions shall be Markdown files beginning with an H1 heading matching `# {at-id}: {title}` and containing exactly five H2 sections in order: Objective, Context, Approach, Constraints, References. No H2 section may be empty. (from spec-fa3a90b8#atomic-tasks)

- **REQ-11:** Execution records shall conform to the `ExecutionRecord` JSON Schema with required fields `task_id`, `run`, `status`, `criteria_results`, `started_at` and optional fields `commits`, `scope_violations`, `agent_notes`, `token_usage`, `finished_at`. The `status` field shall be one of: pending, running, completed, failed, abandoned. (from spec-fa3a90b8#acceptance-criteria-and-execution)

- **REQ-12:** A single task definition may have multiple execution records representing retry attempts. Run numbers shall be sequential per task_id with no gaps. Ring 0 shall validate sequential run numbers (R0-T32). (from spec-fa3a90b8#acceptance-criteria-and-execution)

- **REQ-13:** When a task's parent implementation document is invalidated (reverts to draft status), any execution records for that task with status `pending` or `running` shall be updated to `abandoned` status with `finished_at` set to the current time. (Note: the detection is this impl doc's Ring 0 / cross-level checks; the actual status mutation is performed by the pipeline engine in Impl Doc 4.) (from spec-fa3a90b8#acceptance-criteria-and-execution)

- **REQ-14:** Ring 0 shall implement 24 deterministic structural checks for task definitions (R0-T01 through R0-T14, R0-T20 through R0-T24) and 5 checks for execution records (R0-T30 through R0-T34) covering: JSON Schema conformance, ID uniqueness, parent reference validity, description file existence, dependency reference validity, dependency symmetry, dependency acyclicity, acceptance criteria ID uniqueness, criterion type/field consistency, scope non-emptiness, context_refs non-emptiness, no self-references, Markdown template structure, execution record schema conformance, task_id reference validity, sequential run numbers, criterion_id reference validity, and no duplicate criterion_ids. (from spec-fa3a90b8#atomic-tasks)

- **REQ-15:** Ring 1 shall define four semantic check prompt templates (R1-T01 through R1-T04): coverage completeness, contradiction detection, scope coherence, and dependency correctness. Each prompt shall ask exactly one question and expect structured JSON output. (from spec-fa3a90b8#atomic-tasks)

- **REQ-16:** Ring 2 shall define five quality rubric prompt templates (R2-T01 through R2-T05): actionability, scope boundedness, approach specificity, constraint testability, and criterion completeness. Each rubric shall produce structured JSON output with evidence. (from spec-fa3a90b8#atomic-tasks)

- **REQ-17:** The system shall define an atomic task generation prompt (system prompt and user prompt template) for decomposing a validated implementation document into atomic tasks. The prompt shall instruct the LLM to produce paired JSON definition and Markdown description artifacts, maintain dependency symmetry across all `blocked_by`/`blocks` fields, and list tasks in intended execution order. (from spec-fa3a90b8#atomic-tasks)

- **REQ-18:** Cross-level invariant CL-F01 shall verify that every specification FR-XX and NFR-XX traces forward through at least one implementation document REQ-XX to at least one atomic task acceptance criterion (top-down traceability chain). (from spec-fa3a90b8#cross-level-invariants)

- **REQ-19:** Cross-level invariant CL-F02 shall verify that every atomic task acceptance criterion traces backward through its parent implementation document to at least one specification FR-XX or NFR-XX (bottom-up, no orphan criteria). (from spec-fa3a90b8#cross-level-invariants)

- **REQ-20:** Full-stack traceability invariants (CL-F01, CL-F02) are structural — they verify the existence of reference chains, not semantic coverage. They shall be deterministic with no LLM involvement. (from spec-fa3a90b8#cross-level-invariants)

## Design Decisions

- **Separate schema file for execution records:** The `ExecutionRecord` schema is defined in its own file (`src/schemas/execution-record.schema.json`) rather than bundled with the task definition schema. Execution records are mutable artifacts with a different lifecycle than immutable task definitions. Separating them makes schema compilation and validation dispatch clearer. *Alternative rejected:* single `task.schema.json` containing both — conflates immutable and mutable artifacts.

- **Two Ring 0 validator functions:** The task module exports `validateTaskRing0()` for task definitions/descriptions and `validateExecutionRecord()` for execution records. These are separate functions because they validate different schemas with different rule sets (R0-T01-T24 vs R0-T30-T34) and require different context objects. *Alternative rejected:* a single function dispatching on input type — less explicit and harder to test.

- **Dependency symmetry check loads sibling tasks:** R0-T07 requires checking that for every task B in `blocks`, B's `blocked_by` contains this task's ID. The validator receives all sibling task definitions via `TaskValidationContext.siblingTasks`. The check iterates over declared `blocks`/`blocked_by` entries and verifies bidirectional consistency. *Alternative rejected:* checking only one direction and inferring the other — would miss asymmetric errors.

- **Scope enforcement is not this impl doc's responsibility:** FR-16 states "The system shall reject any attempt to modify a file not listed in the active task's `scope.files`." This is a runtime enforcement concern implemented as a PreToolUse hook (`src/cli/scope-guard.ts`) in the Claude Code Integration spec, and as a check in the programmatic pipeline (Impl Doc 4). This impl doc validates that `scope.files` is properly declared (non-empty, R0-T12) and that the Approach section references stay within scope (R1-T03). The spec uses "the system" rather than "harness" to avoid tying enforcement to a specific mechanism. *Alternative rejected:* implementing scope enforcement in this module — wrong layer; this is schema and validation, not runtime.

- **Full-stack traceability via structural chain walking:** CL-F01 and CL-F02 traverse reference chains structurally: spec FR-XX → impl doc REQ-XX `(from spec-XXXXXXXX#heading-slug)` → task `context_refs` → task `acceptance_criteria`. The check verifies chain existence, not semantic equivalence (which is Ring 1's job at each level). The traversal loads all three document levels and builds a forward/backward reference map. *Alternative rejected:* LLM-based traceability checking — contradicts FR-37 (all cross-level invariants are deterministic).

- **AcceptanceCriterion as a TypeScript discriminated union:** The four criterion types share an `id`, `type`, and `description` field but differ in their verification field (`verify` for test/build/lint, `rubric` for review). TypeScript models this as a discriminated union on the `type` field, matching the JSON Schema `oneOf` structure. *Alternative rejected:* a single interface with optional `verify` and `rubric` fields — loses type safety.

## Out of Scope

- **Specification and implementation document schemas** — Impl Docs 1 (impl-7e2a9f1b) and 2 (impl-3c8d5e0a).

- **Runtime scope enforcement** — FR-16's "reject any attempt to modify a file not listed" is enforced at runtime by the pipeline engine (Impl Doc 4) and Claude Code hooks (Integration spec). This impl doc validates scope declarations, not runtime behavior.

- **Execution record creation and lifecycle management** — Creating execution records when a task begins, updating status during execution, and abandoning records on parent invalidation are pipeline engine responsibilities (Impl Doc 4). This impl doc defines the schema and validates structural correctness of existing records.

- **Ring 1/2 execution machinery, refinement loop, fix functions** — Impl Doc 4.

- **Pipeline orchestration and reporting** — Impl Doc 4.

- **CL-S and CL-T cross-level invariants** — Impl Docs 1 and 2 respectively. CL-F01 and CL-F02 (full-stack traceability) are in this impl doc because they terminate at the task/acceptance-criterion level.

## Dependencies

- impl-3c8d5e0a — Provides the `ImplDefinition` TypeScript type (needed for parent reference validation and CL-F chain traversal), the graph utilities in `src/parsers/graph.ts` (reused for task dependency acyclicity R0-T08), and the `spec_sections` heading-slug format definition.

- impl-7e2a9f1b (transitive via impl-3c8d5e0a) — Provides the Markdown heading extractor, `SpecDefinition` type (needed for CL-F01/CL-F02 chain traversal), shared result types, and `ajv` setup pattern.

- External: `ajv` v8 (already a dependency).

## Decomposition Notes

### Suggested Task Boundaries

- **Task JSON Schema, Execution Record Schema, and TypeScript types** — `src/schemas/task.schema.json`, `src/schemas/execution-record.schema.json`, `src/types/definitions.ts` (add `TaskDefinition`, `AcceptanceCriterion`, `ExecutionRecord`, `CriterionResult`) — Define both JSON Schema files and all TypeScript interfaces for the task level.

- **Task definition Ring 0 validator** — `src/validators/task/ring0.ts` — Implement `validateTaskRing0()` covering R0-T01 through R0-T14 and R0-T20 through R0-T24. Uses `ajv`, heading extractor, and graph utilities. Handles dependency symmetry (R0-T07) and acyclicity (R0-T08) via sibling task context.

- **Execution record Ring 0 validator** — `src/validators/task/ring0.ts` (same file, separate exported function) — Implement `validateExecutionRecord()` covering R0-T30 through R0-T34. Validates schema conformance, task reference, sequential runs, and criterion ID consistency.

- **Task Ring 1 and Ring 2 prompt templates** — Define prompt-building functions for R1-T01 through R1-T04 and R2-T01 through R2-T05. Each function takes document content and context, returns a prompt string.

- **Task generation prompt templates** — Define the system prompt and user prompt template for decomposing implementation documents into atomic tasks.

- **Full-stack traceability validators** — `src/validators/cross-level/full-stack.ts` — Implement CL-F01 and CL-F02. Loads spec, impl doc, and task definitions to build forward and backward reference chain maps.

- **Task Ring 0 unit tests and fixtures** — `tests/unit/ring0/task-validator.test.ts`, `tests/fixtures/tasks/` — Test all R0-T rules including dependency symmetry, acyclicity, criterion type/field validation, execution record validation, and full-stack traceability. Create fixtures for valid tasks, symmetry violations, cyclic dependencies, malformed criteria, and incomplete traceability chains.

### Ordering Rationale

The JSON Schemas and TypeScript types must exist before either Ring 0 validator function can import them. The task definition validator (R0-T01-T24) and execution record validator (R0-T30-T34) can be implemented in parallel since they validate different artifact types, but they share the same module file and types, so sequential development within the same task is more practical. The task definition validator must exist before the dependency symmetry tests can exercise it. Prompt templates depend on types but are independent of Ring 0. Full-stack traceability depends on types from all three levels.

Dependency chain: Schemas + Types → Task Definition Validator + Execution Record Validator → Unit Tests. Prompt templates branch off after Types. Full-stack traceability branches off after Types.

### Decomposition Constraints

- Each atomic task should touch no more than 5 files (the task and execution record schemas/validators are closely coupled and may need a slightly higher file count).
- The task definition validator and execution record validator should be in the same task since they share a module file and context patterns, despite validating different artifacts.
- Full-stack traceability (CL-F01, CL-F02) must be a separate task because it has a unique data access pattern (loading all three document levels) and requires its own multi-level fixture setup.
- Prompt templates (Ring 1/2 + generation) can be combined into one task.
- Unit tests should be a separate task due to the large number of fixtures needed (dependency symmetry, acyclicity, criterion type variants, execution record edge cases, traceability chains).
- Naming convention: task descriptions should follow the pattern "{Module}: {What is built}".
