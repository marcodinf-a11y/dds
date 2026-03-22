# at-0b9f2dab: Spec Schema: Ring 0 Unit Tests and Fixtures

## Objective

Create comprehensive unit tests for the spec-level Ring 0 validator and the Spec-Impl cross-level validator, along with synthetic fixture files. After this task, all R0-S01 through R0-S14 and CL-S01 through CL-S04 rules have positive and negative test cases that can be run via `npx vitest run`.

## Context

The Ring 0 validator at `src/validators/spec/ring0.ts` (created in at-934f341f) exports `validateSpecRing0(spec: SpecDefinition, markdown: string): Ring0Result`. It implements 14 rules.

The cross-level validator at `src/validators/cross-level/spec-impl.ts` (created in at-17bc59d3) exports `validateSpecImplCrossLevel(spec: SpecDefinition, implDocs: ImplDocMinimal[], specMarkdown: string): Ring0Result`. It implements 4 invariants.

Types available from `src/types/`:
- `SpecDefinition` — the spec JSON definition interface
- `Ring0Result`, `Ring0RuleResult` — validation result types
- `ImplDocMinimal` — minimal impl doc interface exported from the cross-level module

The heading extractor at `src/parsers/markdown.ts` (created in at-73d6ad76) exports `extractHeadings` and `HeadingInfo`.

Tests use `vitest` as the test runner. Test files use `describe`/`it`/`expect` from vitest.

The valid spec fixture must be a realistic spec that passes all R0-S rules:
- JSON definition with correct ID pattern, title, description filename, status, version, etc.
- Markdown with correct H1 title, all six H2 sections in order, at least one FR-XX, and non-empty sections.

Invalid cases are constructed by programmatically mutating the valid fixture (e.g., changing the status, removing an H2 section, adding a duplicate FR-XX).

## Approach

1. Create `tests/fixtures/specs/valid-spec.json` with a complete SpecDefinition: `id: "spec-a1b2c3d4"`, `title: "Test Specification"`, `description: "spec-a1b2c3d4.md"`, `status: "draft"`, `version: 1`, no `implementation_docs`, no `related_specs`.

2. Create `tests/fixtures/specs/valid-spec.md` with a valid spec Markdown that starts with `# spec-a1b2c3d4: Test Specification`, followed by the six H2 sections (Overview, Functional Requirements, Non-Functional Requirements, System Constraints, Glossary, Decomposition Guidance). Under Functional Requirements, include an H3 "User Management" with `FR-01: The system shall...`. Under Non-Functional Requirements, include `NFR-01: The system shall...`. All sections have non-empty content.

3. Create `tests/unit/ring0/spec-validator.test.ts`. Import `validateSpecRing0` from `src/validators/spec/ring0.ts`, the valid fixture JSON and Markdown. Structure tests as:
   - `describe('validateSpecRing0')` with nested `describe` per rule group:
     - `describe('R0-S01 - Schema conformance')`: test passing with valid spec; test failing with missing required field.
     - `describe('R0-S03 - Description pattern')`: test passing; test failing with wrong filename pattern.
     - `describe('R0-S04 - No self-reference')`: test passing with no related_specs; test failing with self-reference in related_specs.
     - `describe('R0-S05 - H1 matches spec')`: test passing; test failing with wrong H1 title.
     - `describe('R0-S06/R0-S07 - H2 sections')`: test passing with all six; test failing with missing section; test failing with wrong order.
     - `describe('R0-S08 - Non-empty sections')`: test passing; test failing with empty section.
     - `describe('R0-S09 - H1 ID matches JSON')`: test passing; test failing with mismatched ID.
     - `describe('R0-S10 - Status-array consistency')`: test draft with no impl_docs passes; test decomposed with empty impl_docs fails.
     - `describe('R0-S11 - related_specs pattern')`: test passing; test failing with invalid pattern.
     - `describe('R0-S12 - FR-XX exists')`: test passing; test failing with no FR entries.
     - `describe('R0-S13 - Unique identifiers')`: test passing; test failing with duplicate FR-01.
     - `describe('R0-S14 - Version positive integer')`: test passing; test failing with version 0.
   - Each test calls `validateSpecRing0` with the appropriate fixture (mutated as needed), then asserts on the specific rule's `passed` value in the results array.

4. Create `tests/unit/ring0/cross-level.test.ts`. Import `validateSpecImplCrossLevel` from `src/validators/cross-level/spec-impl.ts`. Structure tests as:
   - `describe('validateSpecImplCrossLevel')` with nested `describe` per invariant:
     - `describe('CL-S01 - Bidirectional consistency')`: test passing with matching refs; test failing with missing back-reference.
     - `describe('CL-S02 - Decomposed has impl docs')`: test passing (decomposed with impl docs); test failing (decomposed with empty impl docs); test passing (draft with no impl docs).
     - `describe('CL-S03 - Functional area coverage')`: test passing (all H3 areas covered); test failing (missing area).
     - `describe('CL-S04 - Version/status consistency')`: test passing (version 1, any status); test failing (version 2, impl doc not draft).
   - Construct test data inline using the valid fixture as a base and modifying spec/implDocs as needed.

## Constraints

- Do not modify any source files outside the declared scope (no changes to validators or types).
- Do not add external testing utilities beyond vitest.
- Do not mock the `extractHeadings` function; use real Markdown strings and let it execute.
- Do not depend on file system reads at runtime; import fixtures directly or define them inline.
- Fixture files must be valid JSON and Markdown respectively (no syntax errors even in the "valid" fixtures).

## References

- spec-fa3a90b8#specification-documents — Defines R0-S01 through R0-S14 rules that tests must cover
- spec-fa3a90b8#cross-level-invariants — Defines CL-S01 through CL-S04 invariants that tests must cover
- at-934f341f — Provides the validateSpecRing0 function under test
- at-17bc59d3 — Provides the validateSpecImplCrossLevel function under test
- at-e27804a5 — Provides SpecDefinition and result types used in test assertions
- at-73d6ad76 — Provides extractHeadings used transitively by the validators
