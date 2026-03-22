# spec-fa3a90b8: Core DDS System

## Overview

The Document Decomposition System (DDS) is a structured pipeline that transforms human-written specifications into validated, agent-executable atomic tasks. It operates through progressive decomposition: a specification decomposes into implementation documents, which decompose into atomic tasks small enough for a coding agent to execute in a single session. Every document passes through a three-ring validation pipeline — structural, semantic, and quality — before promotion or further decomposition.

This specification covers the core DDS system: the document hierarchy and schemas, the validation pipeline machinery, the refinement loop, and the decomposition process. It defines the data model (three document levels with paired JSON and Markdown artifacts), the validation rules (Ring 0 deterministic checks, Ring 1 LLM-based semantic checks, Ring 2 LLM-based quality rubrics), the refinement loop (automated fix-and-revalidate cycles with convergence detection and escalation), and the pipeline orchestration (full runs, incremental validation, spec change handling, cross-level invariants).

This specification does NOT cover the Claude Code integration layer — hooks, subagents, slash commands, workflows, and CLAUDE.md configuration. That is addressed by a separate specification (not yet created; will be linked via `related_specs` when available). The boundary is: this spec defines WHAT the system does; the integration spec defines HOW it is operated through Claude Code.

The primary consumers of this system are AI coding agents (which execute atomic tasks) and human authors (who write specifications and review escalations). The system is implemented as a TypeScript program that orchestrates validation and decomposition, using the `claude` CLI as its LLM backend for Ring 1, Ring 2, and fix functions.

## Functional Requirements

### Document Hierarchy

- **FR-01:** The system shall manage documents in a three-level hierarchy: Specification (root level), Implementation Document (middle level), and Atomic Task (leaf level).

- **FR-02:** Specifications are primarily human-authored with LLM assistance. Implementation documents are derived from specifications. Atomic tasks are derived from implementation documents.

- **FR-03:** Each level has distinct semantics: a specification describes a complete system or subsystem, an implementation document describes a coherent unit of functionality, and an atomic task represents a single agent-executable coding session.

### Document Artifacts

- **FR-04:** Each document shall consist of two paired artifacts: a JSON definition file (structural metadata, relationships, status) and a Markdown description file (prose narrative organized per the level's template).

### Document Identification

- **FR-05:** All document IDs shall use randomly generated 8-character hexadecimal strings with type-specific prefixes: `spec-` for specifications, `impl-` for implementation documents, `at-` for atomic tasks, and `ac-` for acceptance criteria.

### Document Status Lifecycle

- **FR-06:** Documents shall follow a three-state status lifecycle: `draft` (authored but not yet validated), `validated` (passed all three validation rings, ready for decomposition), and `decomposed` (child documents generated and themselves validated).

- **FR-07:** Backward status transitions are permitted: a validated document reverts to draft when validation fails, and a decomposed document reverts to draft when its content changes or downstream issues are detected.

### Specification Documents

- **FR-08:** Specification definitions shall conform to the SpecificationDefinition JSON schema.

- **FR-09:** The SpecificationDefinition schema shall include an `id` field containing a spec-prefixed hex ID.

- **FR-10:** The SpecificationDefinition schema shall include a `title` field containing a human-readable name.

- **FR-11:** The SpecificationDefinition schema shall include a `description` field containing the filename of the Markdown description.

- **FR-12:** The SpecificationDefinition schema shall include an `implementation_docs` field containing an array of impl doc IDs — empty when the document status is draft or validated, populated when decomposed.

- **FR-13:** The SpecificationDefinition schema shall include a `related_specs` field containing an array of other spec IDs sharing terminology or interface boundaries.

- **FR-14:** The SpecificationDefinition schema shall include a `status` field with one of the values: draft, validated, or decomposed.

- **FR-15:** The SpecificationDefinition schema shall include a `version` field containing a positive integer, incremented on each substantive revision.

- **FR-16:** The `description` field of a specification definition shall match the filename pattern `spec-XXXXXXXX.md`.

- **FR-17:** Specification description Markdown files shall begin with an H1 heading matching `# {spec-id}: {title}`.

- **FR-18:** Specification descriptions shall contain exactly six H2 sections in this order: Overview, Functional Requirements, Non-Functional Requirements, System Constraints, Glossary, Decomposition Guidance.

- **FR-19:** No H2 section in a specification description may be empty.

- **FR-20:** The Functional Requirements section of a specification description shall organize requirements under H3 subheadings by functional area.

- **FR-21:** Each requirement in the Functional Requirements section shall use the `FR-XX` identifier format (sequentially numbered).

- **FR-22:** Each requirement shall be atomic (one testable behavior).

- **FR-23:** Each requirement shall be unambiguous, using Glossary terms consistently.

- **FR-24:** Each requirement shall be testable — a developer could write a pass/fail test from the requirement text alone.

- **FR-25:** When a specification's `version` field increments, all downstream implementation documents shall revert to `draft` status and must be re-validated.

- **FR-26:** When a specification's `version` field increments, any pending or running execution records for atomic tasks under those implementation documents shall be set to `abandoned` status with `finished_at` set to the current time.

### Implementation Documents

- **FR-27:** Implementation document definitions shall conform to the ImplementationDefinition JSON schema.

- **FR-28:** The ImplementationDefinition schema shall include an `id` field containing an impl-prefixed hex ID.

- **FR-29:** The ImplementationDefinition schema shall include a `spec_sections` field containing an array of spec section references in `spec-XXXXXXXX#heading-slug` format, using standard Markdown heading anchors — lowercase, hyphens, no special characters.

- **FR-30:** The ImplementationDefinition schema shall include a `description` field containing a filename matching `impl-XXXXXXXX.md`.

- **FR-31:** The ImplementationDefinition schema shall include an `atomic_tasks` field containing an array of task IDs in execution order — empty when the document status is draft or validated, populated when decomposed.

- **FR-32:** The ImplementationDefinition schema shall include a `modules` field containing an array of logical module names this implementation operates within.

- **FR-33:** The ImplementationDefinition schema shall include a `dependencies` field containing an array of other impl doc IDs that must be completed first.

- **FR-34:** The ImplementationDefinition schema shall include a `status` field.

- **FR-35:** Implementation document description Markdown files shall begin with an H1 heading matching `# {impl-id}: {title}`.

- **FR-36:** Implementation document descriptions shall contain exactly seven H2 sections in this order: Objective, Background, Requirements, Design Decisions, Out of Scope, Dependencies, Decomposition Notes.

- **FR-37:** The Decomposition Notes section of an implementation document description shall contain exactly three H3 subsections: Suggested Task Boundaries, Ordering Rationale, Decomposition Constraints.

- **FR-38:** No H2 section in an implementation document description may be empty.

- **FR-39:** Each requirement in an implementation document's Requirements section shall use the `REQ-XX` identifier format.

- **FR-40:** Each requirement in an implementation document's Requirements section shall include a spec section reference in the format `(from spec-XXXXXXXX#heading-slug)`.

- **FR-41:** Every requirement from the referenced spec sections shall appear either in Requirements or be explicitly listed in Out of Scope with a reason — nothing may be silently dropped.

- **FR-42:** The dependency graph formed by implementation document `dependencies` fields shall be acyclic. No implementation document may directly or transitively depend on itself.

### Atomic Tasks

- **FR-43:** Atomic task definitions shall conform to the AtomicTaskDefinition JSON schema.

- **FR-44:** The AtomicTaskDefinition schema shall include an `id` field containing an at-prefixed hex ID.

- **FR-45:** The AtomicTaskDefinition schema shall include a `parent` field containing the impl doc ID this task was decomposed from.

- **FR-46:** The AtomicTaskDefinition schema shall include a `description` field containing a filename matching `at-XXXXXXXX.md`.

- **FR-47:** The AtomicTaskDefinition schema shall include a `blocked_by` field containing an array of task IDs that must complete first.

- **FR-48:** The AtomicTaskDefinition schema shall include a `blocks` field containing an array of task IDs that depend on this task.

- **FR-49:** The AtomicTaskDefinition schema shall include a `scope` field containing an object with `files` and `modules` arrays.

- **FR-50:** The AtomicTaskDefinition schema shall include an `acceptance_criteria` field containing one or more criterion objects.

- **FR-51:** The AtomicTaskDefinition schema shall include a `context_refs` field containing an array of spec section references this task fulfills.

- **FR-52:** Atomic task description Markdown files shall begin with an H1 heading matching `# {at-id}: {title}`.

- **FR-53:** Atomic task descriptions shall contain exactly five H2 sections in this order: Objective, Context, Approach, Constraints, References.

- **FR-54:** No H2 section in an atomic task description may be empty.

- **FR-55:** The `blocked_by` and `blocks` fields across all atomic tasks shall maintain strict symmetry: for every pair of tasks (A, B), A.blocks contains B's ID if and only if B.blocked_by contains A's ID.

- **FR-56:** The dependency graph formed by atomic task `blocked_by`/`blocks` relationships shall be acyclic. No task may directly or transitively depend on itself.

- **FR-57:** The `scope.files` field shall be the exhaustive list of files the executing agent is permitted to modify.

- **FR-58:** The system shall reject any attempt to modify a file not listed in the active task's `scope.files`.

- **FR-59:** Every entry in an atomic task's `scope.modules` shall be a member of the parent implementation document's `modules` list (subset constraint).

### Acceptance Criteria

- **FR-60:** Each atomic task shall have one or more acceptance criteria.

- **FR-61:** Each acceptance criterion shall be identified by a unique `ac-`prefixed ID.

- **FR-62:** Each acceptance criterion shall be classified as one of four types: `test` (unit or integration test pass), `build` (compilation without errors), `lint` (static analysis or architectural rule compliance), or `review` (LLM-evaluated code quality assessment).

- **FR-63:** Acceptance criteria of type `test`, `build`, and `lint` shall include a `verify` field containing a shell command. The criterion passes when the command exits with code 0.

- **FR-64:** Acceptance criteria of type `review` shall include a `rubric` field containing an evaluation prompt specific enough for an LLM to produce a binary pass/fail verdict with supporting evidence.

### Execution Records

- **FR-65:** Execution records shall conform to the ExecutionRecord JSON schema.

- **FR-66:** The ExecutionRecord schema shall include a `task_id` field referencing the atomic task definition.

- **FR-67:** The ExecutionRecord schema shall include a `run` field containing a positive integer, sequential per task.

- **FR-68:** The ExecutionRecord schema shall include a `status` field with one of the values: pending, running, completed, failed, or abandoned.

- **FR-69:** The ExecutionRecord schema shall include a `criteria_results` field containing an array of per-criterion results, each with `criterion_id`, `verdict` of pass/fail/skipped, and `output`.

- **FR-70:** The ExecutionRecord schema shall include a `commits` field containing an array of git commit SHAs produced.

- **FR-71:** The ExecutionRecord schema shall include a `scope_violations` field containing an array of files modified outside declared scope.

- **FR-72:** The ExecutionRecord schema shall include an `agent_notes` field containing the filename of the agent's reasoning log.

- **FR-73:** The ExecutionRecord schema shall include a `token_usage` field containing total tokens consumed.

- **FR-74:** The ExecutionRecord schema shall include a `started_at` field containing an ISO 8601 timestamp.

- **FR-75:** The ExecutionRecord schema shall include a `finished_at` field containing an ISO 8601 timestamp, null while in progress.

- **FR-76:** A single task definition may have multiple execution records representing retry attempts.

- **FR-78:** Execution record run numbers shall be sequential per task_id with no gaps.

- **FR-77:** When a task's parent implementation document is invalidated (reverts to draft status), any execution records for that task with status `pending` or `running` shall be updated to `abandoned` status with `finished_at` set to the current time.

### Validation Ring Sequence

- **FR-78:** Every document shall pass through three validation rings in strict sequence before promotion from `draft` to `validated`: Ring 0 (structural), then Ring 1 (semantic), then Ring 2 (quality). No ring may be skipped or reordered.

- **FR-79:** Ring 1 shall only execute if Ring 0 passes. Ring 2 shall only execute if Ring 1 passes.

### Ring 0: Structural Validation

- **FR-80:** Ring 0 shall perform deterministic structural validation with no LLM involvement.

- **FR-81:** Ring 0 shall validate JSON schema conformance against the level's definition schema.

- **FR-82:** Ring 0 shall validate Markdown template structure (correct headings in required order, no empty sections).

- **FR-83:** Ring 0 shall validate ID format and uniqueness.

- **FR-84:** Ring 0 shall validate dependency graph acyclicity.

- **FR-85:** Ring 0 shall validate dependency symmetry (for atomic tasks).

- **FR-86:** Ring 0 shall validate status-field consistency (e.g., child arrays empty when draft/validated, non-empty when decomposed).

- **FR-87:** Ring 0 shall validate cross-field consistency (e.g., H1 ID matches JSON definition ID).

### Ring 1: Semantic Validation

- **FR-88:** Ring 1 shall perform semantic consistency validation using LLM prompts. Each Ring 1 rule shall ask exactly one question, receive the relevant document content as input, and produce structured JSON output conforming to the Ring 1 result schema: `rule_id` (the rule's identifier), `verdict` (pass or fail), and `issues` (array of objects each with `reference` and `description` fields). An empty issues array with verdict pass indicates no problems found.

### Ring 2: Quality Validation

- **FR-89:** Ring 2 shall perform quality assessment using LLM rubrics. Each Ring 2 rule shall evaluate a single quality dimension against an explicit rubric and produce structured JSON output conforming to the Ring 2 result schema: `rule_id` (the rule's identifier), `dimension` (quality dimension name), `verdict` (pass or fail), `evidence` (array of objects each with `reference`, `finding`, and per-element `assessment`), and `summary` (one-sentence overall assessment).

### Level-Specific Validation Rules

- **FR-90:** Each document level shall have its own set of Ring 0, Ring 1, and Ring 2 validation rules. The specific rules, prompts, and rubrics for each level are defined in the corresponding schema documentation: specification rules in the spec schema document, implementation document rules in the impl doc schema document, and atomic task rules in the task schema document.

### Refinement and Escalation

- **FR-91:** The refinement loop shall execute validation rings sequentially: Ring 0 first, then Ring 1 (only if Ring 0 passes), then Ring 2 (only if Ring 1 passes).

- **FR-92:** When any ring fails and a fix is applied, validation shall restart from Ring 0, because a semantic fix may break structure and a quality fix may introduce semantic contradictions.

- **FR-93:** When Ring 0 validation fails, the system shall attempt automated structural fixes via `fix_structural` (deterministic corrections where possible, such as reordering sections or fixing JSON schema violations; LLM-based for non-trivial structural issues).

- **FR-94:** When Ring 1 validation fails, the system shall attempt automated semantic fixes via `fix_semantic` (LLM-based, aligning with the parent document and using placeholders where content is unknown).

- **FR-95:** When Ring 2 validation fails, the system shall attempt automated quality fixes via `fix_quality` (LLM-based, making the minimum changes necessary to pass the rubric).

- **FR-96:** Convergence detection shall track previous issues separately per ring (`previous_ring1_issues` and `previous_ring2_issues` as independent variables).

- **FR-97:** Convergence detection shall compare the set of (rule, reference) pairs between the current and previous iteration of the same ring. The overlap ratio is defined as |intersection| / |current|.

- **FR-98:** When the overlap ratio exceeds the configured convergence threshold, the system shall declare a convergence plateau and escalate.

- **FR-99:** When all three validation rings pass, the refinement loop shall terminate and the document shall be promoted to `validated` status.

- **FR-100:** When convergence is detected at Ring 1 or Ring 2, the refinement loop shall terminate and the document shall be escalated for human review.

- **FR-101:** When the configured maximum iteration count is reached without promotion, the refinement loop shall terminate and the document shall be escalated for human review.

- **FR-102:** Escalation reports shall be written to the `pipeline/escalations/` directory.

- **FR-103:** Escalation reports shall contain: `document_id`, `document_level` (one of: `specification`, `implementation_document`, or `atomic_task`), `reason` (convergence plateau at a specific ring, or max iterations reached), `iterations_completed`, `unresolved_issues` (array with per-issue `rule` and `description`), `history` (array of per-iteration results showing each ring's pass/fail status), and `document_snapshot` (file path to the document's state at escalation time).

- **FR-104:** Escalated documents may be manually edited by a human and re-submitted to the pipeline for another refinement attempt. Re-submission shall restart the refinement loop from Ring 0 at the escalated document's level.

### Cross-Level Invariants

- **FR-105:** The system shall enforce forward consistency from implementation documents to specifications (CL-S01 forward): every implementation document's `spec_sections` entries shall reference a specification whose `implementation_docs` list contains that implementation document's ID.

- **FR-106:** The system shall enforce backward consistency from specifications to implementation documents (CL-S01 backward): every specification's `implementation_docs` entries shall reference an implementation document whose `spec_sections` entries reference that specification.

- **FR-107:** The system shall enforce forward consistency from atomic tasks to implementation documents (CL-T01 forward): every atomic task's `parent` field shall reference an implementation document whose `atomic_tasks` array contains that task's ID.

- **FR-108:** The system shall enforce backward consistency from implementation documents to atomic tasks (CL-T01 backward): every implementation document's `atomic_tasks` entries shall reference tasks whose `parent` field matches that implementation document's ID.

- **FR-109:** The system shall enforce that the union of all `spec_sections` entries across a specification's implementation documents covers every functional area (H3 heading under Functional Requirements) in that specification (CL-S03).

- **FR-110:** The system shall enforce that every module in an implementation document's `modules` list appears in at least one child task's `scope.modules`, and every child task's `scope.modules` is a subset of the parent's `modules` (CL-T03).

- **FR-111:** The system shall enforce that the union of all `context_refs` across an implementation document's atomic tasks covers all entries in that implementation document's `spec_sections` (CL-T04).

- **FR-112:** The system shall enforce forward traceability (CL-F01): every specification FR-XX and NFR-XX shall trace forward through at least one implementation document REQ-XX to at least one atomic task acceptance criterion.

- **FR-113:** The system shall enforce backward traceability (CL-F02): every atomic task acceptance criterion shall trace backward through its parent implementation document to at least one specification FR-XX or NFR-XX. Traceability is structural — it verifies the existence of reference chains, not semantic coverage (which is Ring 1's responsibility).

- **FR-114:** All cross-level invariants shall be deterministic (Ring 0 complexity) and shall be checked both after any individual document change (as part of incremental validation) and during Phase 4 of full pipeline runs.

### Pipeline Orchestration

- **FR-115:** Phase 1 of a full pipeline run shall validate the specification through the refinement loop.

- **FR-116:** Phase 2 of a full pipeline run shall decompose the specification into implementation documents and validate each through the refinement loop.

- **FR-117:** Phase 3 of a full pipeline run shall decompose each implementation document into atomic tasks, validate each through the refinement loop, and check cross-task invariants (dependency symmetry, acyclicity).

- **FR-118:** Phase 4 of a full pipeline run shall check all cross-level invariants across the full document tree.

- **FR-119:** A full pipeline run shall execute phases sequentially in order (Phase 1 through Phase 4) and shall halt at any phase where an escalation occurs, reporting the blocking escalation.

- **FR-120:** When a specification is modified, the system shall increment its `version` field.

- **FR-121:** When a specification is modified, the system shall revert all downstream implementation documents to `draft` status and set any `pending` or `running` execution records for descendant tasks to `abandoned`.

- **FR-122:** When re-decomposing after a specification modification, the system shall pass existing implementation documents to the generation step for incremental adjustment rather than generating entirely new documents, to preserve prior work where boundaries remain valid.

- **FR-123:** The system shall support incremental validation: when a single document changes, only the validation rules affected by that change shall re-run. The affected rules are determined by the document type and change scope — for example, editing a spec's Markdown triggers spec-level Ring 0+1+2 and affected CL-S rules; editing a task definition triggers task Ring 0 and dependency symmetry checks for all tasks referenced in its `blocked_by`/`blocks`.

- **FR-124:** Each pipeline run shall produce a summary report written to `pipeline/reports/`.

- **FR-125:** Pipeline summary reports shall contain: a unique run ID, the root spec ID, start and end timestamps, overall status (ready or blocked), per-document results (document ID, level, final status, per-ring pass/fail, iteration count), and aggregate statistics (documents validated per level, cross-level checks passed, total LLM calls, total token usage, refinement iterations per level, escalation count).

### Document Decomposition

- **FR-126:** The system shall decompose validated specifications into one or more implementation documents via LLM-assisted generation.

- **FR-127:** Implementation document generation shall follow the specification's Decomposition Guidance section.

- **FR-128:** Generated implementation documents shall produce paired JSON definition and Markdown description artifacts conforming to the implementation document schema and template.

- **FR-129:** The system shall decompose validated implementation documents into atomic tasks via LLM-assisted generation. The generation shall follow the implementation document's Decomposition Notes section.

- **FR-130:** Decomposition of implementation documents shall produce between 3 and 8 tasks.

- **FR-131:** Decomposition shall maintain dependency symmetry across all generated `blocked_by`/`blocks` fields.

- **FR-132:** Decomposition shall list tasks in intended execution order in the parent's `atomic_tasks` array.

- **FR-133:** After successful decomposition and validation of all generated children, the parent document's JSON definition shall be updated: `implementation_docs` populated with generated impl doc IDs (for specs) or `atomic_tasks` populated with generated task IDs in execution order (for impl docs).

- **FR-134:** After successful decomposition and validation of all generated children, the parent's status shall change to `decomposed`.

## Non-Functional Requirements

- **NFR-01:** Ring 0 validation shall complete in under 1000 milliseconds per document.

- **NFR-02:** Ring 0 shall be constrained to deterministic algorithms (JSON schema validation, heading extraction, graph traversal) with no LLM calls.

- **NFR-03:** The maximum number of refinement loop iterations shall be configurable via `pipeline/config.json` field `refinement.max_iterations`, with a default value of 5.

- **NFR-04:** The convergence detection threshold shall be configurable via `pipeline/config.json` field `refinement.convergence_threshold`, with a default value of 0.7 (escalation triggered when 70% or more of the current issues were also present in the previous iteration of the same ring).

- **NFR-05:** LLM call timeouts shall be configurable per operation type via `pipeline/config.json`: Ring 1 checks (field `timeouts.ring1_check_seconds`, default 60), Ring 2 checks (field `timeouts.ring2_check_seconds`, default 90), and fix function calls (field `timeouts.fix_call_seconds`, default 120).

- **NFR-06:** The system shall detect short LLM rate limits, defined as responses where the retry-after header value is 60 seconds or less.

- **NFR-07:** When a short rate limit is detected, the system shall retry the request using exponential backoff.

- **NFR-08:** The maximum retry count for short rate limits shall be configurable via `pipeline/config.json` field `claude_cli.max_retries_on_short_429`, with a default value of 3.

- **NFR-09:** The backoff multiplier for short rate limit retries shall be configurable via `pipeline/config.json` field `claude_cli.backoff_multiplier`, with a default value of 2.

- **NFR-10:** The system shall handle long LLM rate limits (retry-after exceeds 60 seconds) by aborting the pipeline run immediately and reporting the rate limit as the reason for termination.

- **NFR-11:** A configurable delay between consecutive LLM calls (field `claude_cli.delay_between_calls_ms`, default 2000) shall be enforced to prevent burst rate limiting.

- **NFR-12:** Pipeline summary reports shall record total token usage and total LLM call count per pipeline run to enable cost tracking and usage optimization.

## System Constraints

- The system shall be implemented in TypeScript targeting the Node.js runtime. Rationale: TypeScript interfaces map directly to DDS JSON schemas, providing compile-time type safety for a self-validating system. Node.js provides native JSON handling and a mature ecosystem for JSON Schema validation and Markdown parsing.

- JSON definition files shall validate against JSON Schema Draft-07. Rationale: Draft-07 is the version specified in all DDS schema documents and is broadly supported by validation libraries (notably `ajv` v8).

- The LLM backend shall be the `claude` CLI invoked via `claude -p` (non-interactive print mode) with `--output-format json` for structured output and `--json-schema` for schema-constrained responses. No Anthropic API key is required; billing uses the user's Claude subscription. Rationale: avoids per-token API costs and allows the system to operate under any Claude subscription tier.

- All description documents shall use Markdown format. Heading extraction for Ring 0 validation requires only H1, H2, and H3 heading recognition and ordering — a full Markdown AST is not required.

- All pipeline configuration parameters shall be stored in `pipeline/config.json`. All fields are optional; omission means use the compiled-in default. The pipeline shall operate correctly without this file existing.

- Document artifacts shall follow a fixed directory structure: specification definitions in `specs/definitions/`, descriptions in `specs/descriptions/`; implementation document definitions in `implementation/definitions/`, descriptions in `implementation/descriptions/`; atomic task definitions in `tasks/definitions/`, descriptions in `tasks/descriptions/`, execution records in `tasks/executions/`; pipeline reports in `pipeline/reports/`, escalation reports and document snapshots in `pipeline/escalations/`.

## Glossary

- **Specification:** The root document level in the DDS hierarchy. Primarily human-authored with LLM assistance. Contains functional requirements, non-functional requirements, system constraints, a glossary, and decomposition guidance. Decomposes into implementation documents.

- **Implementation Document:** The middle document level. Derived from one or more specification sections. Describes a coherent unit of functionality with traced requirements, design decisions, explicit scope boundaries, and decomposition notes for the next level. Decomposes into atomic tasks.

- **Atomic Task:** The leaf document level. Represents a single agent-executable coding session. Includes enforced file scope, ordered dependencies, acceptance criteria, and a step-by-step implementation approach.

- **Artifact:** A concrete file in the DDS system. Each document consists of two artifacts: a JSON definition (structural metadata, relationships, status) and a Markdown description (prose narrative). Execution records are a third artifact type specific to atomic tasks.

- **Acceptance Criterion:** A verifiable condition that must be satisfied for an atomic task to be considered complete. Identified by an `ac-`prefixed ID. Four types: test, build, lint (machine-verifiable via shell command exit code), and review (LLM-evaluated via rubric prompt).

- **Execution Record:** A mutable JSON artifact tracking the runtime state of a single attempt to execute an atomic task. Records per-criterion results, git commits, scope violations, and resource usage. A task may have multiple execution records representing retries.

- **Document Level:** One of three levels in the DDS hierarchy: specification, implementation document, or atomic task. Each level has its own JSON schema, Markdown template, and set of validation rules.

- **Ring 0 (Structural Validation):** The first validation ring. Deterministic checks with no LLM involvement: JSON schema conformance, Markdown template structure, dependency graph properties, cross-field consistency. Constrained to complete in under 1000ms per document.

- **Ring 1 (Semantic Validation):** The second validation ring. LLM-based rules using narrow prompts that each ask exactly one question about semantic consistency — terminology usage, requirement atomicity, cross-document coherence, coverage completeness. Produces structured JSON output with a verdict and issues list.

- **Ring 2 (Quality Validation):** The third validation ring. LLM-based rules using explicit rubrics that evaluate quality dimensions — decomposability, precision, completeness, actionability, boundary clarity. Produces per-element evidence with individual pass/fail assessments.

- **Validation Rule:** A single validation item within any ring. Ring 0 rules are deterministic checks. Ring 1 rules are LLM-based semantic consistency prompts. Ring 2 rules are LLM-based quality rubrics. Each rule produces a structured result with a verdict and supporting details. Rules are identified by level-specific IDs (e.g., R0-S01, R1-I10, R2-T03).

- **Refinement Loop:** The core automation cycle. Runs a document through Ring 0, Ring 1, Ring 2 in sequence. When a ring fails, applies the corresponding fix function and restarts from Ring 0. Terminates on promotion (all rings pass), convergence (fixes not making progress), or max iterations reached.

- **Convergence Plateau:** A state where the refinement loop's fix functions are not making meaningful progress on a specific ring's issues. Detected when the overlap of (rule, reference) pairs between consecutive iterations of the same ring exceeds the configured threshold. Triggers escalation.

- **Escalation:** The outcome when the refinement loop cannot resolve a document's validation issues automatically. Produces a structured report with the document's unresolved issues, iteration history, and a snapshot of the document at escalation time. The document remains in `draft` status until manually edited and re-submitted.

- **Promotion:** The successful outcome of the refinement loop. A document passes all three validation rings and its status changes from `draft` to `validated`.

- **Decomposition:** The process of breaking a parent document into child documents at the next level down. Specification to implementation documents (following the Decomposition Guidance section). Implementation document to atomic tasks (following the Decomposition Notes section). Uses LLM-assisted generation.

- **Dependency Symmetry:** The invariant requiring that `blocked_by` and `blocks` fields between atomic tasks are bidirectionally consistent: if task A's `blocks` array contains task B's ID, then task B's `blocked_by` array must contain task A's ID, and vice versa.

- **Scope:** The enforced boundary on what files and modules an agent may modify when executing an atomic task. `scope.files` is an exhaustive list of permitted files (enforced by the system — modifications outside scope are rejected). `scope.modules` lists logical modules (must be a subset of the parent implementation document's modules).

- **Functional Area:** An H3 subheading under the Functional Requirements section of a specification description. Represents a cohesive group of related requirements. Used as the unit of coverage checking in cross-level invariants (CL-S03).

- **Cross-Level Invariant:** A validation rule that spans document boundaries — for example, specification to implementation document or implementation document to atomic task. All cross-level invariants are deterministic (Ring 0 complexity). They ensure bidirectional consistency, coverage, and traceability across the document hierarchy.

- **Pipeline Run:** A single execution of the DDS pipeline from a root specification through validation, decomposition, and cross-level invariant checking. Produces a summary report. Identified by a unique run ID.

- **Pipeline Configuration:** Tunable operational parameters stored in `pipeline/config.json`. Includes refinement limits (max iterations), convergence thresholds, LLM timeouts per operation type, rate limit handling parameters, and inter-call delays. All fields are optional with compiled-in defaults.

## Decomposition Guidance

This specification should decompose into five implementation documents. Impl Docs 2 through 5 each map to one of the source reference documents (docs/01 through docs/04), preserving traceability to the original material. Impl Doc 1 covers the shared data model that underpins all levels.

### Impl Doc 1: Document Data Model and Shared Infrastructure

Covers FR-01 through FR-07 (three-level document hierarchy, paired artifacts, ID format conventions, and status lifecycle with backward transitions). Implements the shared data model foundations: the three-level hierarchy structure, the paired-artifact pattern (JSON definition + Markdown description), the ID generation and format rules across all document types, and the three-state status lifecycle with forward and backward transition rules. These cross-cutting concerns are consumed by all level-specific schemas and by the pipeline engine.

Maps to modules: `data-model`, `id-generation`, `status-lifecycle`.

Dependencies: none (root of the data model; all other impl docs depend on this).

### Impl Doc 2: Specification Schema and Validation

Covers FR-08 through FR-26 (specification document structure and version cascade). Implements the SpecificationDefinition JSON schema, the six-section Markdown template, and all specification-level validation rules: Ring 0 rules R0-S01 through R0-S14, Ring 1 rules R1-S01 through R1-S04, and Ring 2 rules R2-S01 through R2-S03. Also implements the specification generation prompt (system and user prompt templates) and the Spec-to-Implementation Document cross-level invariants CL-S01 through CL-S04.

Maps to modules: `spec-schema`, `spec-validation`.

Dependencies: Impl Doc 1 (ID format, status lifecycle, and paired-artifact pattern are defined there).

### Impl Doc 3: Implementation Document Schema and Validation

Covers FR-27 through FR-42 (implementation document structure, requirement traceability, and dependency acyclicity). Implements the ImplementationDefinition JSON schema, the seven-section Markdown template (with three H3 subsections in Decomposition Notes), and all implementation-level validation rules: Ring 0 rules R0-I40 through R0-I67, Ring 1 rules R1-I10 through R1-I15, and Ring 2 rules R2-I10 through R2-I15. Also implements the implementation document generation prompt and the Implementation Document-to-Atomic Task cross-level invariants CL-T01 through CL-T05.

Maps to modules: `impl-schema`, `impl-validation`.

Dependencies: Impl Doc 1 (ID format and status lifecycle), Impl Doc 2 (spec section reference format `spec-XXXXXXXX#heading-slug` is defined there).

### Impl Doc 4: Atomic Task Schema and Validation

Covers FR-43 through FR-77 (atomic task structure, dependency symmetry, scope enforcement, acceptance criteria, and execution records). Implements the AtomicTaskDefinition JSON schema, the five-section Markdown template, the ExecutionRecord JSON schema, and all task-level validation rules: Ring 0 rules R0-T01 through R0-T34, Ring 1 rules R1-T01 through R1-T04, and Ring 2 rules R2-T01 through R2-T05. Also implements the atomic task generation prompt and the full-stack traceability invariants CL-F01 and CL-F02.

Maps to modules: `task-schema`, `task-validation`, `execution-records`.

Dependencies: Impl Doc 1 (ID format and status lifecycle), Impl Doc 3 (parent reference format and module containment invariant CL-T03 are defined there).

Note: The source reference document (docs/03-atomic-task-schema.md) uses the term "harness" to mean the runtime system that enforces scope boundaries and runs acceptance criteria. This spec avoids the term (using "the system" instead) because the enforcement mechanism differs between programmatic mode (TypeScript checks) and interactive mode (Claude Code hooks). The impl doc should define scope enforcement concretely for the programmatic mode and leave hook-based enforcement to the Claude Code Integration spec.

### Impl Doc 5: Validation Pipeline and Orchestration

Covers FR-78 through FR-134 (validation ring framework, shared LLM system prompts, refinement loop, convergence detection, fix functions, escalation, pipeline orchestration, incremental validation, decomposition coordination, and reporting). This is the largest implementation document because it contains the pipeline engine that consumes the per-level rules defined in Impl Docs 2 through 4. The size imbalance reflects the system's architecture: the pipeline engine is genuinely the largest component. This is not a signal to split — the refinement loop, convergence detection, fix functions, escalation, and orchestration are tightly coupled and share state (e.g., `previous_ring1_issues`). Splitting them would create artificial boundaries across a single control flow.

Maps to modules: `pipeline`, `refinement`, `escalation`, `decomposition`, `reporting`.

Dependencies: Impl Docs 1, 2, 3, and 4 (all per-level validation rules, schemas, and generation prompts are consumed by the pipeline engine).

### Alternative Decomposition

An alternative separates concerns by architectural role rather than document level: (1) Document Schemas and Templates (all three JSON schemas, all templates, ID formats, status lifecycle — the data model), (2) Validation Rules (all Ring 0/1/2 rules across all levels, cross-level invariants — the rule catalog), (3) Pipeline Engine (refinement loop, convergence, fix functions, escalation, orchestration, reporting — the runtime), (4) Decomposition and Generation (generation prompts, decomposition logic, re-decomposition — the document factory). This achieves cleaner architectural separation but breaks traceability to the source reference documents and splits each level's validation rules away from the schemas they validate. The decomposition agent should assess coupling before deviating from the primary suggestion.