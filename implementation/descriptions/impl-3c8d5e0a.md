# impl-3c8d5e0a: Implementation Document Schema and Validation

## Objective

Implement the implementation-document-level data model and validation rules so that implementation documents can be authored, structurally validated, semantically checked, and quality-assessed. After this implementation, the system can validate any implementation document through all three rings and check Implementation Document-to-Atomic Task cross-level invariants.

## Background

No codebase exists yet. This implementation document builds on the patterns established by Impl Doc 1 (impl-7e2a9f1b): pure-function validators, prompt template exports, shared heading extractor, and level-agnostic result types. All file paths below reference the planned structure from the project architecture (analysis Part 14).

**Planned file locations:**

- `src/schemas/impl.schema.json` — JSON Schema Draft-07 for ImplementationDefinition. Validated at runtime by `ajv` v8 (already a project dependency from Impl Doc 1).
- `src/types/definitions.ts` — This file already contains `SpecDefinition` (from Impl Doc 1). This impl doc adds the `ImplDefinition` TypeScript interface to the same file.
- `src/validators/impl/ring0.ts` — Impl-doc-level Ring 0 validator. Exports a function `validateImplRing0(impl: ImplDefinition, markdown: string, context: ImplValidationContext): Ring0Result` that runs R0-I40 through R0-I67.
- `src/parsers/markdown.ts` — Shared Markdown heading extractor (already implemented by Impl Doc 1). This impl doc consumes it; no modifications needed.
- `src/parsers/graph.ts` — Directed graph utilities: adjacency list construction and DFS cycle detection. Used for R0-I47 (dependency acyclicity). Also consumed by Impl Doc 3 for task dependency graph checks.
- `src/validators/cross-level/impl-task.ts` — Cross-level invariant checker for Implementation Document ↔ Atomic Task relationships (CL-T01 through CL-T05).
- `tests/unit/ring0/impl-validator.test.ts` — Unit tests for all R0-I rules using synthetic fixtures.
- `tests/fixtures/impl-docs/` — Synthetic impl doc definition and description files exercising valid and invalid cases.

**Patterns inherited from Impl Doc 1:**

- Ring 0 validators are pure functions: `(definition, markdown, context) → Ring0Result`. The `context` parameter provides data needed for cross-document checks within Ring 0 (e.g., existing impl doc IDs for uniqueness, task definitions for parent consistency). This is an extension of the Impl Doc 1 pattern, which didn't need context because spec-level Ring 0 checks are mostly self-contained.
- Ring 1 and Ring 2 prompt templates are exported functions returning prompt strings. The pipeline engine calls the `claude` CLI.
- JSON Schema validation reuses the same `ajv` instance pattern from Impl Doc 1.

**Key differences from spec-level validation:**

- Implementation documents have a `dependencies` field forming a directed graph. R0-I47 requires acyclicity checking, which introduces the graph parser (`src/parsers/graph.ts`).
- Implementation documents have a `modules` field with downstream containment constraints (CL-T03 checks that child task modules are subsets).
- The Markdown template has 7 H2 sections (vs. 6 for specs) and requires 3 H3 subsections under Decomposition Notes.
- R0-I50 and R0-I51 require loading child atomic task definitions to check parent consistency and module containment — these are Ring 0 checks that cross document boundaries (but remain deterministic).
- The `spec_sections` field uses the format `spec-XXXXXXXX#heading-slug`, which must be validated against the heading-slug format defined in Impl Doc 1.

**Naming conventions:** kebab-case files, PascalCase interfaces/types, camelCase functions, UPPER_SNAKE_CASE constants (same as Impl Doc 1).

## Requirements

- **REQ-01:** The system shall define an `ImplementationDefinition` JSON Schema (Draft-07) with required fields `id`, `spec_sections`, `description`, `modules`, `status` and optional arrays `atomic_tasks`, `dependencies`, enforcing the patterns and constraints specified in the schema. (from spec-fa3a90b8#implementation-documents)

- **REQ-02:** Implementation document IDs shall use the pattern `impl-[0-9a-f]{8}` — 8 random hex characters with `impl-` prefix. The JSON Schema `pattern` field shall enforce this. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-03:** Implementation documents shall consist of two paired artifacts: a JSON definition file and a Markdown description file. The `description` field in the JSON definition shall match the pattern `impl-[0-9a-f]{8}\.md`. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-04:** Implementation document definitions shall follow a three-state status lifecycle: `draft`, `validated`, `decomposed`. When `draft` or `validated`, the `atomic_tasks` array must be empty. When `decomposed`, it must be non-empty. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-05:** The `spec_sections` field shall contain at least one entry, each following the format `spec-XXXXXXXX#heading-slug` where heading-slug uses standard Markdown heading anchors (lowercase, hyphens, no special characters). (from spec-fa3a90b8#implementation-documents)

- **REQ-06:** Implementation document descriptions shall be Markdown files beginning with an H1 heading matching `# {impl-id}: {title}` and containing exactly seven H2 sections in order: Objective, Background, Requirements, Design Decisions, Out of Scope, Dependencies, Decomposition Notes. The Decomposition Notes section shall contain exactly three H3 subsections: Suggested Task Boundaries, Ordering Rationale, Decomposition Constraints. No H2 section may be empty. (from spec-fa3a90b8#implementation-documents)

- **REQ-07:** Each requirement in an implementation document's Requirements section shall use the `REQ-XX` identifier format and include a spec section reference in the format `(from spec-XXXXXXXX#heading-slug)`. Ring 0 shall validate the presence of at least one REQ-XX entry (R0-I66) and that each entry includes a spec section reference (R0-I67). (from spec-fa3a90b8#implementation-documents)

- **REQ-08:** The dependency graph formed by implementation document `dependencies` fields shall be acyclic. No implementation document may directly or transitively depend on itself. Ring 0 shall validate this using DFS cycle detection (R0-I47). (from spec-fa3a90b8#implementation-documents)

- **REQ-09:** Ring 0 shall implement 18 deterministic structural checks (R0-I40 through R0-I51, R0-I60 through R0-I67) covering: JSON Schema conformance, ID uniqueness, description file existence, spec_sections format validity, atomic_tasks reference validity, dependencies reference validity and acyclicity, no self-references in dependencies, status-array consistency, parent consistency invariant (R0-I50), module containment invariant (R0-I51), Markdown template structure (7 H2 sections, 3 H3 subsections), and REQ-XX format with spec references. (from spec-fa3a90b8#implementation-documents)

- **REQ-10:** Ring 1 shall define six semantic check prompt templates (R1-I10 through R1-I15): spec coverage, out-of-scope consistency, design decision coherence, dependency completeness, decomposition coverage (conditional on `decomposed` status), and cross-implementation contradiction. Each prompt shall ask exactly one question and expect structured JSON output with `check`, `verdict`, and `issues` fields. (from spec-fa3a90b8#implementation-documents)

- **REQ-11:** Ring 2 shall define six quality rubric prompt templates (R2-I10 through R2-I15): decomposability, requirement testability, background sufficiency, design decision completeness, boundary clarity, and decomposition notes quality. Each rubric shall produce structured JSON output with `check`, `dimension`, `verdict`, `evidence`, and `summary` fields. (from spec-fa3a90b8#implementation-documents)

- **REQ-12:** The system shall define an implementation document generation prompt (system prompt and user prompt template) for decomposing a validated specification into implementation documents. The prompt shall instruct the LLM to produce paired JSON definition and Markdown description artifacts conforming to the schema and template, following the spec's Decomposition Guidance. (from spec-fa3a90b8#implementation-documents)

- **REQ-13:** Cross-level invariant CL-T01 shall verify bidirectional consistency: every atomic task's `parent` field references an impl doc that lists that task in its `atomic_tasks` array, and vice versa. (from spec-fa3a90b8#cross-level-invariants)

- **REQ-14:** Cross-level invariant CL-T02 shall verify that every impl doc with `status: decomposed` has at least one atomic task. (from spec-fa3a90b8#cross-level-invariants)

- **REQ-15:** Cross-level invariant CL-T03 shall verify that every module in the impl doc's `modules` list appears in at least one child task's `scope.modules`, and every child task's `scope.modules` is a subset of the impl doc's `modules` (full coverage without boundary violations). (from spec-fa3a90b8#cross-level-invariants)

- **REQ-16:** Cross-level invariant CL-T04 shall verify that the union of all `context_refs` across an impl doc's atomic tasks covers all entries in the impl doc's `spec_sections` (full traceability). (from spec-fa3a90b8#cross-level-invariants)

- **REQ-17:** Cross-level invariant CL-T05 shall verify that dependency ordering between impl docs is consistent with the `blocked_by`/`blocks` graph of their atomic tasks. (from spec-fa3a90b8#cross-level-invariants)

- **REQ-18:** All cross-level invariants (CL-T01 through CL-T05) shall be deterministic with no LLM involvement, consistent with Ring 0 complexity requirements. (from spec-fa3a90b8#cross-level-invariants)

## Design Decisions

- **Ring 0 validator context parameter:** Unlike the spec-level Ring 0 validator (which is largely self-contained), the impl-doc validator needs external data for cross-document checks: existing impl doc IDs (R0-I41 uniqueness), existing task definitions (R0-I50, R0-I51), and the full impl doc dependency graph (R0-I47). Rather than having the validator perform file I/O, these are passed in as a typed `ImplValidationContext` object. The pipeline engine populates this context before calling the validator. *Alternative rejected:* having the validator load files directly — violates the pure-function pattern; makes unit testing require file system setup.

- **Shared graph utilities in `src/parsers/graph.ts`:** DFS cycle detection is needed for both impl doc `dependencies` (R0-I47) and atomic task `blocked_by`/`blocks` (R0-T08, implemented in Impl Doc 3). Rather than duplicating graph logic, a shared module provides `buildAdjacencyList()` and `detectCycles()` functions that both validators import. *Alternative rejected:* inline cycle detection in each validator — duplication and divergence risk.

- **Heading-slug validation by regex, not by spec lookup:** R0-I43 validates that `spec_sections` entries follow the format `spec-XXXXXXXX#heading-slug`. The format check is regex-based (lowercase, hyphens, no special chars). Whether the slug actually exists in the referenced spec is a cross-level concern (CL-S01/CL-S03), not a structural check. This keeps Ring 0 self-contained per document. *Alternative rejected:* R0-I43 resolves and validates against actual spec headings — requires loading spec files, crossing the pure-function boundary.

- **R0-I50 and R0-I51 included in Ring 0 despite cross-document data:** These rules (parent consistency, module containment) are listed in the impl doc Ring 0 table and are deterministic. They require child task data, which is provided via the context parameter. They are conceptually Ring 0 (structural, deterministic, no LLM) even though they span documents. *Alternative rejected:* moving them to cross-level invariants — would break alignment with the source reference document (docs/02) and the spec's rule numbering.

- **Prompt templates follow Impl Doc 1's pattern:** Ring 1/2 prompt templates are exported functions `(documentContent, additionalContext?) → string`. The `additionalContext` parameter handles cases like R1-I15 (cross-implementation contradiction), which needs sibling impl doc content. *Alternative rejected:* a different API shape for impl-level prompts — inconsistency across levels.

## Out of Scope

- **Specification schema and validation** — Covered by Impl Doc 1 (impl-7e2a9f1b). The spec_sections format validation in R0-I43 checks format only, not existence.

- **Atomic task schema and validation** — Covered by Impl Doc 3 (impl-9f4b1c7d). R0-I44, R0-I50, and R0-I51 reference task definitions but do not define the task schema.

- **Ring 1/2 execution machinery** — The framework for invoking the `claude` CLI, parsing LLM responses, and handling timeouts is Impl Doc 4 (impl-5a0e3d8f).

- **Refinement loop and fix functions** — Impl Doc 4.

- **Pipeline orchestration and reporting** — Impl Doc 4.

- **Full-stack traceability invariants (CL-F01, CL-F02)** — These span all three levels and are implemented in Impl Doc 3 (impl-9f4b1c7d).

- **The term "harness" for scope enforcement** — The spec avoids this term. Scope enforcement for the programmatic mode is a pipeline concern (Impl Doc 4). Hook-based enforcement belongs to the Claude Code Integration spec (not yet created).

## Dependencies

- impl-7e2a9f1b — Provides the Markdown heading extractor (`src/parsers/markdown.ts`), the `SpecDefinition` type (needed by CL-S/CL-T cross-references), the shared result types (`Ring0Result`, `Ring1Result`, `Ring2Result`), and the `ajv` setup pattern. Also establishes the pure-function validator and prompt-template-export patterns that this impl doc follows.

- External: `ajv` v8 (already a dependency from Impl Doc 1).

## Decomposition Notes

### Suggested Task Boundaries

- **Impl Doc JSON Schema and TypeScript types** — `src/schemas/impl.schema.json`, `src/types/definitions.ts` (add `ImplDefinition` interface) — Define the ImplementationDefinition JSON Schema Draft-07 file and the TypeScript interface.

- **Graph utilities** — `src/parsers/graph.ts` — Implement `buildAdjacencyList()` and `detectCycles()` for directed graph analysis. Used by R0-I47 (impl doc dependency acyclicity) and later by Impl Doc 3's R0-T08 (task dependency acyclicity).

- **Impl Doc Ring 0 validator** — `src/validators/impl/ring0.ts` — Implement `validateImplRing0()` covering R0-I40 through R0-I51 and R0-I60 through R0-I67. Takes definition, markdown, and context. Uses `ajv`, heading extractor, and graph utilities.

- **Impl Doc Ring 1 and Ring 2 prompt templates** — Define prompt-building functions for R1-I10 through R1-I15 and R2-I10 through R2-I15. Each function takes document content and optional context, returns a complete prompt string.

- **Impl Doc generation prompt templates** — Define the system prompt and user prompt template for decomposing specifications into implementation documents.

- **Impl↔Task cross-level validators** — `src/validators/cross-level/impl-task.ts` — Implement CL-T01 through CL-T05. Takes impl doc definitions, task definitions, and impl doc Markdown as input.

- **Impl Doc Ring 0 unit tests and fixtures** — `tests/unit/ring0/impl-validator.test.ts`, `tests/fixtures/impl-docs/` — Test all R0-I rules including graph acyclicity, parent consistency, and module containment with synthetic fixtures. Include graph utility tests.

### Ordering Rationale

The JSON Schema and TypeScript types must exist before the Ring 0 validator can import them. The graph utilities must exist before the Ring 0 validator can check dependency acyclicity (R0-I47). The Ring 0 validator must exist before its unit tests. Prompt templates depend on the TypeScript types for document structure knowledge but are otherwise independent of Ring 0 and can be developed in parallel. Cross-level validators depend on both the `ImplDefinition` type and task definition types (from Impl Doc 3's schema), but the CL-T function signatures can be defined now with task types imported later.

Dependency chain: Schema + Types → Graph Utilities → Ring 0 Validator → Unit Tests. Prompt templates branch off after Types. Cross-level validators branch off after Types + Graph Utilities.

### Decomposition Constraints

- Each atomic task should touch no more than 4 files.
- The graph utilities module (`src/parsers/graph.ts`) must be a standalone task — it is shared infrastructure consumed by both Impl Doc 2 and Impl Doc 3 validators.
- Ring 1/Ring 2 prompt templates can share a task since they follow the same pattern (exported functions returning prompt strings).
- Unit tests should be a separate task from the Ring 0 validator implementation, as they involve creating fixture files across multiple directories.
- Cross-level validators (CL-T01 through CL-T05) should be a separate task because they have a different data access pattern (loading both impl docs and tasks) and will need their own test fixtures.
- Naming convention: task descriptions should follow the pattern "{Module}: {What is built}".
