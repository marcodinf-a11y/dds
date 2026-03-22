# at-3a0e5e9c: Impl Schema: JSON Schema and TypeScript Types

## Objective

After this task, the project has a JSON Schema (Draft-07) defining the ImplementationDefinition structure and a matching TypeScript interface in the shared definitions file. These artifacts are the foundation for all impl-doc validation, generation, and cross-level checks.

## Context

This is the first task in the impl-3c8d5e0a decomposition. No codebase exists yet, but the patterns are established by impl-7e2a9f1b (Spec Schema and Validation).

**Existing file to modify:** `src/types/definitions.ts` already contains `SpecDefinition` (from impl-7e2a9f1b). The `ImplDefinition` interface will be added to the same file.

**New file to create:** `src/schemas/impl.schema.json` alongside the existing `src/schemas/spec.schema.json`.

**Schema requirements from the impl doc (REQ-01 through REQ-05):**

- Required fields: `id`, `spec_sections`, `description`, `modules`, `status`.
- Optional arrays: `atomic_tasks`, `dependencies`.
- `id` pattern: `^impl-[0-9a-f]{8}$`.
- `description` pattern: `^impl-[0-9a-f]{8}\.md$`.
- `spec_sections` items pattern: `^spec-[0-9a-f]{8}#[a-z0-9-]+$`, minItems 1.
- `modules` is an array of strings, minItems 1.
- `status` enum: `draft`, `validated`, `decomposed`.
- Status-array consistency: when `draft` or `validated`, `atomic_tasks` must have maxItems 0; when `decomposed`, `atomic_tasks` must have minItems 1.
- `dependencies` items pattern: `^impl-[0-9a-f]{8}$`.

**Naming conventions:** PascalCase for interfaces, snake_case for JSON field names (matching the JSON Schema), kebab-case for file names.

**ajv usage pattern:** The project uses ajv v8 for runtime JSON Schema validation. The schema file is loaded and compiled once. The Ring 0 validator (at-e1c51f43) will import this schema.

## Approach

1. Create `src/schemas/impl.schema.json` as a JSON Schema Draft-07 file. Define the `ImplementationDefinition` schema with all required and optional fields, patterns, enums, and the status-array conditional constraint using `if/then` (Draft-07 conditional).
   - Use `if: { properties: { status: { const: "decomposed" } } }, then: { properties: { atomic_tasks: { minItems: 1 } } }` for the decomposed case.
   - Use `if: { properties: { status: { enum: ["draft", "validated"] } } }, then: { properties: { atomic_tasks: { maxItems: 0 } } }` for the draft/validated case.
   - Set `additionalProperties: false`.

2. Open `src/types/definitions.ts` and add the `ImplDefinition` interface below the existing `SpecDefinition`. Fields:
   - `id: string`
   - `spec_sections: string[]`
   - `description: string`
   - `modules: string[]`
   - `status: 'draft' | 'validated' | 'decomposed'`
   - `atomic_tasks: string[]`
   - `dependencies: string[]`

3. Export `ImplDefinition` as a named export.

4. Verify with `npx tsc --noEmit`.

## Constraints

- Do not modify `SpecDefinition` or any existing types in `definitions.ts`.
- Do not add runtime dependencies beyond what impl-7e2a9f1b already provides.
- Do not add validation logic to this task -- that belongs to at-e1c51f43.
- `additionalProperties` must be `false` in the JSON Schema.
- Field names in the JSON Schema must use snake_case to match the existing spec schema convention.

## References

- spec-fa3a90b8#document-hierarchy-and-structure -- Defines the impl doc ID pattern and paired-artifact structure
- spec-fa3a90b8#implementation-documents -- Defines all impl doc fields and constraints
- at-9d55dbbd -- Depends on ImplDefinition for graph utility type awareness
- at-e1c51f43 -- Depends on ImplDefinition and impl.schema.json for Ring 0 validation
