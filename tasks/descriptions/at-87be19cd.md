# at-87be19cd: Task Schema: Ring 1 and Ring 2 Prompt Templates

## Objective

Define the Ring 1 semantic consistency prompt templates (R1-T01 through R1-T04) and Ring 2 quality rubric prompt templates (R2-T01 through R2-T05) for the task level. After this task, the validation pipeline can perform LLM-based semantic and quality checks on atomic task artifacts.

## Context

Ring 1 and Ring 2 prompt templates follow the pattern established by impl-7e2a9f1b (spec-level) and impl-3c8d5e0a (impl-doc-level). Each ring has its own module file that exports prompt-building functions. Each function takes document content and context parameters and returns a complete prompt string.

The canonical prompt templates are defined in `docs/03-atomic-task-schema.md` under "Ring 1 -- Semantic Consistency" and "Ring 2 -- Quality Rubric" sections.

Ring 1 checks (semantic, narrow prompts, structured JSON output):
- R1-T01: Coverage completeness — do tasks fully cover their parent impl doc?
- R1-T02: Contradiction detection — do sibling tasks make contradictory assumptions?
- R1-T03: Scope coherence — does the approach stay within declared file scope?
- R1-T04: Dependency correctness — are task dependencies correctly declared?

Ring 2 checks (quality rubrics, binary pass/fail with evidence):
- R2-T01: Actionability — could an agent execute without clarification?
- R2-T02: Scope boundedness — is the task small enough for a single session?
- R2-T03: Approach specificity — does every step name concrete file/class/method?
- R2-T04: Constraint testability — can each constraint be verified?
- R2-T05: Criterion completeness — do acceptance criteria cover all behavioral changes?

The validation pipeline (`docs/04-validation-pipeline.md`) defines a shared system prompt for all Ring 1 checks that requires structured JSON output with an `issues` array and `verdict` field. Ring 2 follows the same output pattern but with quality-focused rubrics.

## Approach

1. Create `src/validators/task/ring1.ts`. Import `TaskDefinition` and `ImplDefinition` from `src/types/definitions.ts`.

2. Export `buildCoverageCompletenessPrompt(implContent: string, taskDescriptions: string[]): string` — builds the R1-T01 prompt. Interpolates `implContent` as the parent implementation description and `taskDescriptions` as all child atomic task descriptions. The prompt asks the LLM to list every requirement from the parent and check each has a covering task.

3. Export `buildContradictionDetectionPrompt(taskDescriptions: string[]): string` — builds the R1-T02 prompt. Interpolates all sibling task descriptions. The prompt asks the LLM to compare Context, Approach, and Constraints sections for incompatible modifications, forbidden assumptions, and interface disagreements.

4. Export `buildScopeCoherencePrompt(scopeFiles: string[], approach: string): string` — builds the R1-T03 prompt. Interpolates the task's scope.files and the Approach section. The prompt asks the LLM to identify any file referenced in the Approach that is not in scope.files.

5. Export `buildDependencyCorrectnessPrompt(taskContent: string, dependencyDescriptions: string[]): string` — builds the R1-T04 prompt. Interpolates this task's description and all blocked_by task descriptions. The prompt asks the LLM to find unresolved references to artifacts not in the codebase and not produced by dependencies.

6. Create `src/validators/task/ring2.ts`. Import `TaskDefinition` from `src/types/definitions.ts`.

7. Export five prompt-building functions, one per R2-T rule:
   - `buildActionabilityPrompt(taskDescription: string): string` — R2-T01.
   - `buildScopeBoundednessPrompt(taskDescription: string): string` — R2-T02.
   - `buildApproachSpecificityPrompt(approach: string): string` — R2-T03.
   - `buildConstraintTestabilityPrompt(constraints: string): string` — R2-T04.
   - `buildCriterionCompletenessPrompt(approach: string, criteria: string): string` — R2-T05.

8. Each function returns the full prompt string matching the canonical template from docs/03-atomic-task-schema.md, with placeholders replaced by the function arguments.

## Constraints

- Do not modify any files outside src/validators/task/ring1.ts and src/validators/task/ring2.ts.
- Do not implement prompt execution logic — these are template builders only.
- Each prompt must ask exactly one question (no multi-part prompts).
- Prompt content must match the canonical templates from docs/03-atomic-task-schema.md.
- Do not add LLM client dependencies or API calls.

## References

- spec-fa3a90b8#atomic-tasks — Defines R1-T01 through R1-T04 and R2-T01 through R2-T05 prompt templates
- impl-9f4b1c7d — Parent implementation document; REQ-15, REQ-16
- at-ce9fa326 — Provides TaskDefinition and ImplDefinition types
- impl-7e2a9f1b — Established Ring 1/2 prompt template pattern for spec-level
- impl-3c8d5e0a — Established Ring 1/2 prompt template pattern for impl-doc-level
