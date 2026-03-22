# at-b95ee0ad: Spec Schema: Ring 1 and Ring 2 Prompt Templates

## Objective

Define the prompt-building functions for Ring 1 semantic checks (R1-S01 through R1-S04) and Ring 2 quality rubrics (R2-S01 through R2-S03) for specification documents. After this task, the pipeline engine can generate fully-formed prompts for LLM-based validation of specifications without the schema modules having any LLM dependency.

## Context

Ring 1 and Ring 2 are not executed by the validator module directly. Instead, prompt templates are exported as functions that accept document content and return a fully-formed prompt string. The pipeline engine (Impl Doc 4, impl-5a0e3d8f) is responsible for invoking the `claude` CLI with these prompts.

The types from at-e27804a5 are available:
- `Ring1CheckResult` in `src/types/results.ts` has fields `check: string`, `verdict: string`, `issues: string[]`
- `Ring2CheckResult` in `src/types/results.ts` has fields `check: string`, `dimension: string`, `verdict: string`, `evidence: string`, `summary: string`

The prompt functions do not return these types — they return prompt strings that instruct the LLM to produce JSON matching these structures.

**Ring 1 semantic checks (R1-S01 through R1-S04):**
- R1-S01: Internal terminology consistency — check that terms are used consistently throughout the spec
- R1-S02: Requirement atomicity — check that each FR-XX and NFR-XX defines exactly one testable requirement
- R1-S03: Cross-spec consistency — conditional on non-empty `related_specs`; check for contradictions with related specs
- R1-S04: Decomposition guidance coverage — check that decomposition guidance addresses all functional areas

**Ring 2 quality rubrics (R2-S01 through R2-S03):**
- R2-S01: Decomposition readiness — is the spec detailed enough to decompose into impl docs?
- R2-S02: Requirement precision — are requirements specific enough to implement without ambiguity?
- R2-S03: Completeness — does the spec cover all aspects of the feature it describes?

## Approach

1. Create `src/validators/spec/ring1.ts`. Define and export four functions:
   - `buildR1S01Prompt(specMarkdown: string): string` — terminology consistency. Prompt instructs the LLM to scan the spec for terms used inconsistently (same concept, different words or vice versa). Expects JSON output: `{check: "R1-S01", verdict: "pass"|"fail", issues: [...]}`.
   - `buildR1S02Prompt(specMarkdown: string): string` — requirement atomicity. Prompt instructs the LLM to examine each FR-XX and NFR-XX for compound requirements. Expects same JSON structure with check "R1-S02".
   - `buildR1S03Prompt(specMarkdown: string, relatedSpecMarkdowns: string[]): string` — cross-spec consistency. If `relatedSpecMarkdowns` is empty, return a prompt that produces an automatic pass verdict. Otherwise, prompt instructs comparison for contradictions.
   - `buildR1S04Prompt(specMarkdown: string): string` — decomposition guidance coverage. Prompt instructs the LLM to list all functional areas (H3 headings under Functional Requirements) and check each is addressed in the Decomposition Guidance section.

2. Create `src/validators/spec/ring2.ts`. Define and export three functions:
   - `buildR2S01Prompt(specMarkdown: string): string` — decomposition readiness. Prompt includes rubric: PASS if spec has enough detail for impl doc decomposition, FAIL if key decisions are deferred. Expects JSON output: `{check: "R2-S01", dimension: "decomposition-readiness", verdict: "pass"|"fail", evidence: "...", summary: "..."}`.
   - `buildR2S02Prompt(specMarkdown: string): string` — requirement precision. Rubric: PASS if all requirements are specific and testable, FAIL if any is vague or untestable.
   - `buildR2S03Prompt(specMarkdown: string): string` — completeness. Rubric: PASS if no obvious gaps, FAIL if missing areas are identified.

3. Each function uses template literals to build the prompt string, embedding the document content in clearly delimited sections (e.g., `<spec-content>...</spec-content>`).

## Constraints

- Do not call any LLM or execute prompts; only build and return prompt strings.
- Do not perform file I/O.
- Do not import or depend on `ajv` or any validation library.
- Do not modify files outside the declared scope.
- Each prompt must specify the exact JSON output structure the LLM should return.

## References

- spec-fa3a90b8#specification-documents — Defines R1-S01 through R1-S04 and R2-S01 through R2-S03 check requirements
- at-e27804a5 — Provides Ring1CheckResult and Ring2CheckResult type structures that prompts must instruct the LLM to produce
- impl-7e2a9f1b — See Requirements REQ-09, REQ-10 and Design Decision on prompt templates as exported functions
