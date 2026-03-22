# at-3971dcac: Spec Schema: Generation Prompt Templates

## Objective

Define the system prompt and user prompt template for generating specification documents from human input. After this task, the pipeline engine can invoke the LLM to create new specifications that conform to the SpecificationDefinition schema and the six-section Markdown template.

## Context

The generation prompt module lives at `src/validators/spec/generation.ts`. It exports a constant system prompt and a function that builds the user prompt from human input.

The types from at-e27804a5 define the `SpecDefinition` interface and the JSON Schema at `src/schemas/spec.schema.json`. The generation prompt must instruct the LLM to produce output conforming to both.

The spec Markdown template requires six H2 sections in order: Overview, Functional Requirements, Non-Functional Requirements, System Constraints, Glossary, Decomposition Guidance. The H1 must match `# {spec-id}: {title}`. Functional Requirements must use FR-XX identifiers under H3 subheadings. Non-Functional Requirements must use NFR-XX identifiers.

This module follows the same pattern as Ring 1/Ring 2 prompt templates: exported functions returning strings, no LLM calls.

## Approach

1. Create `src/validators/spec/generation.ts`.

2. Define and export a constant `SPEC_GENERATION_SYSTEM_PROMPT: string` containing the system prompt. The prompt must instruct the LLM to:
   - Generate a fresh spec ID using the `spec-[0-9a-f]{8}` pattern
   - Produce a JSON definition with all required fields: `id`, `title`, `description` (matching `{id}.md`), `status` set to `draft`, `version` set to 1
   - Produce a Markdown description starting with `# {spec-id}: {title}`
   - Include exactly six H2 sections in order: Overview, Functional Requirements, Non-Functional Requirements, System Constraints, Glossary, Decomposition Guidance
   - Use FR-XX identifiers under H3 subheadings in Functional Requirements
   - Use NFR-XX identifiers in Non-Functional Requirements
   - Output the JSON in a ```json code block and the Markdown after a horizontal rule separator

3. Define and export a function `buildSpecGenerationPrompt(humanInput: string, context?: string): string` that constructs the user prompt. Embed `humanInput` in a `<user-input>` delimited section. If `context` is provided, embed it in a `<project-context>` delimited section. Return the assembled prompt string.

## Constraints

- Do not call any LLM or execute prompts; only define and return prompt strings.
- Do not perform file I/O.
- Do not import the JSON Schema file at runtime; the prompt describes the schema requirements textually.
- Do not modify files outside the declared scope.
- The system prompt must be a string constant, not a function.

## References

- spec-fa3a90b8#specification-documents — Defines the SpecificationDefinition fields, six-section Markdown template, and FR-XX/NFR-XX identifier conventions
- at-e27804a5 — Provides SpecDefinition interface and spec.schema.json that generated specs must conform to
- impl-7e2a9f1b — See Requirement REQ-11 and Design Decision on prompt templates as exported functions
