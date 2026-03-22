# impl-7e2a9f1b: Specification Schema and Validation

## Objective

Implement the specification-level data model and validation rules so that specification documents can be authored, structurally validated, semantically checked, and quality-assessed. After this implementation, the system can validate any specification through all three rings and check Spec-to-Implementation Document cross-level invariants.

## Background

No codebase exists yet. This is the first implementation document in the dependency chain and establishes foundational patterns that Impl Docs 2 and 3 will follow. All file paths below reference the planned structure from the project architecture (analysis Part 14).

**Planned file locations:**

- `src/schemas/spec.schema.json` — JSON Schema Draft-07 for SpecificationDefinition. Validated at runtime by `ajv` v8.
- `src/types/definitions.ts` — TypeScript interfaces for all definition types. This impl doc defines `SpecDefinition`; sibling impl docs will add `ImplDefinition` and `TaskDefinition` to the same file.
- `src/types/results.ts` — TypeScript interfaces for validation results: `Ring0Result`, `Ring1Result`, `Ring2Result`. Shared across all levels. This impl doc defines the initial interfaces; they are level-agnostic.
- `src/validators/spec/ring0.ts` — Spec-level Ring 0 validator. Exports a function `validateSpecRing0(spec: SpecDefinition, markdown: string): Ring0Result` that runs R0-S01 through R0-S14.
- `src/parsers/markdown.ts` — Shared Markdown heading extractor. Extracts H1, H2, H3 headings with their content boundaries. No full AST — only heading recognition and ordering. Used by all three level validators.
- `src/validators/cross-level/spec-impl.ts` — Cross-level invariant checker for Spec ↔ Implementation Document relationships (CL-S01 through CL-S04).
- `tests/unit/ring0/spec-validator.test.ts` — Unit tests for all R0-S rules using synthetic fixtures.
- `tests/fixtures/specs/` — Synthetic spec definition and description files exercising valid and invalid cases.

**Key patterns to establish:**

- Each Ring 0 validator is a pure function: takes parsed definition + raw markdown string, returns a `Ring0Result` containing an array of `{ rule: string, passed: boolean, message?: string }` entries. No side effects, no file I/O.
- Ring 1 and Ring 2 are not executed by the validator module directly. Instead, prompt templates are exported as functions that accept document content and return a fully-formed prompt string. The pipeline engine (Impl Doc 4) is responsible for invoking the `claude` CLI with these prompts.
- JSON Schema validation uses `ajv` v8 with Draft-07 support. The schema file is loaded once and compiled. The compiled validator is reused across calls.
- The heading extractor returns `{ level: number, text: string, slug: string, startLine: number, endLine: number }[]`. Slug generation follows standard Markdown anchor rules: lowercase, spaces to hyphens, strip special characters.

**Naming conventions:** kebab-case files, PascalCase interfaces/types, camelCase functions, UPPER_SNAKE_CASE constants.

## Requirements

- **REQ-01:** The system shall define a `SpecificationDefinition` JSON Schema (Draft-07) with required fields `id`, `title`, `description`, `status`, `version` and optional arrays `implementation_docs`, `related_specs`, enforcing the patterns and constraints specified in the schema. (from spec-fa3a90b8#specification-documents)

- **REQ-02:** Specification IDs shall use the pattern `spec-[0-9a-f]{8}` — 8 random hex characters with `spec-` prefix. The JSON Schema `pattern` field shall enforce this at validation time. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-03:** Specification documents shall consist of two paired artifacts: a JSON definition file and a Markdown description file. The `description` field in the JSON definition shall match the pattern `spec-[0-9a-f]{8}\.md`. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-04:** Specification definitions shall follow a three-state status lifecycle: `draft`, `validated`, `decomposed`. The JSON Schema shall enforce this as an enum. Backward transitions (validated→draft, decomposed→draft) are permitted at the application level. (from spec-fa3a90b8#document-hierarchy-and-structure)

- **REQ-05:** Specification descriptions shall be Markdown files beginning with an H1 heading matching `# {spec-id}: {title}` and containing exactly six H2 sections in order: Overview, Functional Requirements, Non-Functional Requirements, System Constraints, Glossary, Decomposition Guidance. No H2 section may be empty. Ring 0 shall validate this structure. (from spec-fa3a90b8#specification-documents)

- **REQ-06:** The Functional Requirements section shall organize requirements under H3 subheadings by functional area. Each requirement shall use the `FR-XX` identifier format, sequentially numbered. Ring 0 shall validate the presence of at least one FR-XX entry (R0-S12) and uniqueness of all FR-XX and NFR-XX identifiers (R0-S13). (from spec-fa3a90b8#specification-documents)

- **REQ-07:** When a specification's `version` field increments, all downstream implementation documents shall revert to `draft` status. The cross-level invariant CL-S04 shall detect version/status inconsistencies. Application-level cascade logic is implemented in the pipeline (Impl Doc 4). (from spec-fa3a90b8#specification-documents)

- **REQ-08:** Ring 0 shall implement 14 deterministic structural checks (R0-S01 through R0-S14) covering: JSON Schema conformance, ID uniqueness, description file existence, reference validity for `implementation_docs` and `related_specs`, no self-reference in `related_specs`, status-array consistency (empty when draft/validated, non-empty when decomposed), Markdown template structure, and H1-to-JSON ID consistency. (from spec-fa3a90b8#specification-documents)

- **REQ-09:** Ring 1 shall define four semantic check prompt templates (R1-S01 through R1-S04): internal terminology consistency, requirement atomicity, cross-spec consistency (conditional on non-empty `related_specs`), and decomposition guidance coverage. Each prompt shall ask exactly one question and expect structured JSON output with `check`, `verdict`, and `issues` fields. (from spec-fa3a90b8#specification-documents)

- **REQ-10:** Ring 2 shall define three quality rubric prompt templates (R2-S01 through R2-S03): decomposition readiness, requirement precision, and completeness. Each rubric shall produce structured JSON output with `check`, `dimension`, `verdict`, `evidence`, and `summary` fields. (from spec-fa3a90b8#specification-documents)

- **REQ-11:** The system shall define a specification generation prompt (system prompt and user prompt template) for creating specifications from human input. The system prompt shall instruct the LLM to produce paired JSON definition and Markdown description artifacts conforming to the schema and template. (from spec-fa3a90b8#specification-documents)

- **REQ-12:** Cross-level invariant CL-S01 shall verify bidirectional consistency: every impl doc's `spec_sections` entries reference a spec whose `implementation_docs` list contains that impl doc's ID, and vice versa. This check is deterministic (Ring 0 complexity). (from spec-fa3a90b8#cross-level-invariants)

- **REQ-13:** Cross-level invariant CL-S02 shall verify that every spec with `status: decomposed` has at least one implementation document. (from spec-fa3a90b8#cross-level-invariants)

- **REQ-14:** Cross-level invariant CL-S03 shall verify that the union of all `spec_sections` entries across a spec's implementation documents covers every functional area (H3 heading under Functional Requirements) in that specification. (from spec-fa3a90b8#cross-level-invariants)

- **REQ-15:** Cross-level invariant CL-S04 shall verify that when a spec's `version` increments, all downstream implementation documents have reverted to `draft` status. (from spec-fa3a90b8#cross-level-invariants)

- **REQ-16:** All cross-level invariants (CL-S01 through CL-S04) shall be deterministic with no LLM involvement, consistent with Ring 0 complexity requirements. (from spec-fa3a90b8#cross-level-invariants)

## Design Decisions

- **Pure-function validators over stateful classes:** Each Ring 0 validator is a pure function that takes a parsed definition and raw Markdown string and returns a result object. No file I/O, no side effects. This makes unit testing trivial and allows the pipeline engine to control I/O. *Alternative rejected:* validator classes with injected file system access — adds unnecessary complexity for deterministic checks that only need parsed data.

- **Prompt templates as exported functions, not executed LLM calls:** Ring 1 and Ring 2 are defined as functions that return prompt strings, not as functions that call the LLM. The pipeline engine (Impl Doc 4) owns all LLM invocation. This keeps the schema modules free of LLM dependencies and makes them testable without mocking the `claude` CLI. *Alternative rejected:* each schema module directly calls the `claude` CLI — couples schema validation to LLM infrastructure and makes unit testing require CLI mocking.

- **Shared heading extractor in `src/parsers/markdown.ts`:** A single Markdown heading extractor serves all three document levels. It extracts H1/H2/H3 headings with line boundaries and generates slugs. No full Markdown AST parser (e.g., `remark`) is used — only heading-line regex matching. This satisfies the spec's constraint that "a full Markdown AST is not required" and avoids a heavy dependency. *Alternative rejected:* `remark`/`unified` ecosystem — overkill for heading extraction; adds transitive dependencies.

- **`ajv` v8 for JSON Schema validation:** The spec constrains JSON Schema to Draft-07. `ajv` v8 supports Draft-07 natively and is the standard TypeScript JSON Schema validator. Schema files are compiled once and reused. *Alternative rejected:* runtime schema checks without a library — error-prone and would duplicate `ajv`'s logic.

- **Result types are level-agnostic:** `Ring0Result`, `Ring1Result`, `Ring2Result` are defined once in `src/types/results.ts` and used by all three level validators. The structure is identical across levels (array of rule results); only the rule IDs differ. *Alternative rejected:* per-level result types — unnecessary duplication since the structure is the same.

- **CL-S invariants in a dedicated module:** Cross-level Spec↔Impl checks live in `src/validators/cross-level/spec-impl.ts`, separate from the per-document Ring 0 validator. They require loading both spec and impl doc definitions, which is a different data access pattern than single-document validation. *Alternative rejected:* embedding CL-S checks in the spec Ring 0 validator — would require the spec validator to load impl doc data, violating the pure-function pattern.

## Out of Scope

- **Ring 1/2 execution machinery** — The framework for invoking the `claude` CLI, parsing LLM responses, and handling timeouts is Impl Doc 4 (impl-5a0e3d8f). This impl doc only defines the prompt templates.

- **Refinement loop and fix functions** — Automated fix-and-revalidate cycles are Impl Doc 4. This impl doc provides the validators and prompt templates that the refinement loop consumes.

- **Implementation document and atomic task schemas** — Impl Docs 2 (impl-3c8d5e0a) and 3 (impl-9f4b1c7d) handle their respective schemas and validation rules.

- **Pipeline orchestration** — `run_pipeline()`, `on_spec_change()`, incremental validation logic, and reporting are all Impl Doc 4.

- **Version cascade application logic** — FR-07 requires that version increments revert downstream docs to `draft`. CL-S04 detects the inconsistency; the actual cascade mutation is performed by the pipeline engine in `on_spec_change()` (Impl Doc 4). This impl doc provides the detection, not the action.

- **DFS cycle detection for dependency graphs** — Specifications do not have a dependency graph (`related_specs` is informational, not ordered). Graph cycle detection (`src/parsers/graph.ts`) is needed by Impl Docs 2 and 3 for `dependencies` and `blocked_by`/`blocks` fields.

## Dependencies

- None. This is the root of the implementation document dependency chain. It establishes the foundational patterns (pure-function validators, prompt template exports, shared Markdown parser, result types) that Impl Docs 2 and 3 build upon.

- External: `ajv` v8 (JSON Schema validation library). Must be added to `package.json`.

## Decomposition Notes

### Suggested Task Boundaries

- **Spec JSON Schema and TypeScript types** — `src/schemas/spec.schema.json`, `src/types/definitions.ts` (SpecDefinition interface), `src/types/results.ts` (Ring0Result, Ring1Result, Ring2Result interfaces) — Define the SpecificationDefinition JSON Schema Draft-07 file and corresponding TypeScript interfaces for definitions and validation results.

- **Markdown heading extractor** — `src/parsers/markdown.ts` — Implement the shared heading extractor that returns H1/H2/H3 headings with slug, level, and line boundaries. Include slug generation following standard Markdown anchor rules. This is a shared utility used by all Ring 0 validators.

- **Spec Ring 0 validator** — `src/validators/spec/ring0.ts` — Implement `validateSpecRing0()` covering R0-S01 through R0-S14. Uses `ajv` for JSON Schema conformance and the heading extractor for Markdown structure checks. Pure function, no I/O.

- **Spec Ring 1 and Ring 2 prompt templates** — Define prompt-building functions for R1-S01 through R1-S04 and R2-S01 through R2-S03. Each function takes document content and returns a complete prompt string. Output as exported functions, grouped by ring.

- **Spec generation prompt templates** — Define the system prompt and user prompt template for creating specifications from human input. Exported as constants/functions.

- **Spec↔Impl cross-level validators** — `src/validators/cross-level/spec-impl.ts` — Implement CL-S01 through CL-S04. Takes spec definitions, impl doc definitions, and spec Markdown as input. Returns a Ring0Result (same structure as per-document Ring 0).

- **Spec Ring 0 unit tests and fixtures** — `tests/unit/ring0/spec-validator.test.ts`, `tests/fixtures/specs/` — Test all R0-S rules with valid specs, specs with specific violations for each rule, and edge cases (empty sections, duplicate IDs, wrong heading order). Include cross-level validator tests in `tests/unit/ring0/cross-level.test.ts`.

### Ordering Rationale

The JSON Schema and TypeScript types must exist before the Ring 0 validator can import and use them. The Markdown heading extractor must exist before the Ring 0 validator can call it for template structure checks. The Ring 0 validator must exist before its unit tests can exercise it. Prompt templates are independent of Ring 0 and can be implemented in parallel, but should come after types are defined since they reference the same document structures. Cross-level validators depend on the SpecDefinition type and the heading extractor.

Dependency chain: Schema + Types → Heading Extractor → Ring 0 Validator → Unit Tests. Prompt templates branch off after Types. Cross-level validators branch off after Heading Extractor.

### Decomposition Constraints

- Each atomic task should touch no more than 4 files (production source files + their direct test files).
- The Markdown heading extractor is a shared utility — it must be a standalone task so that its interface is stable before downstream consumers (Ring 0 validators across all levels) depend on it.
- Ring 1/Ring 2 prompt templates can share a task since they are similar in structure (exported functions returning prompt strings) and small in scope.
- Unit tests for Ring 0 should be a separate task from the Ring 0 validator implementation, because the test task creates fixture files and has a larger file scope.
- Naming convention: task descriptions should follow the pattern "{Module}: {What is built}" (e.g., "Spec Schema: Ring 0 Validator").
