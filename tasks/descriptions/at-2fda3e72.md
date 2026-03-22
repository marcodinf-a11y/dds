# at-2fda3e72: Pipeline: Fix Functions

## Objective

Implement the three fix functions that attempt automated repair of documents failing validation rings. After this task, the refinement loop can call `fixStructural()`, `fixSemantic()`, or `fixQuality()` to produce a revised document when the corresponding ring reports failures.

## Context

The Claude CLI wrapper (`src/llm/claude-cli.ts` from at-08d20126) already exists and provides `callClaude()`. Fix functions are generic across document levels — they receive the document content and failure details, not level-specific logic. The fix prompt templates come from docs/04-validation-pipeline.md and are defined inline in `fix.ts` rather than imported from per-level modules.

Each fix function follows the same pattern: construct a prompt from the document content and failure details, invoke `callClaude()`, and return the revised document content as a string. The key differences are:
- `fixStructural()`: For Ring 0 failures. Applies deterministic fixes where possible (e.g., adding missing fields). Falls back to LLM for non-trivial structural issues.
- `fixSemantic()`: For Ring 1 failures. Includes the parent document for alignment context.
- `fixQuality()`: For Ring 2 failures. Requests minimum changes sufficient to pass the rubric.

## Approach

1. Create `src/llm/fix.ts` exporting three functions:

2. Implement `fixStructural(documentContent: string, issues: Ring0RuleResult[], documentPath: string, config: PipelineConfig): string` that: (a) examines each failing Ring 0 rule to determine if a deterministic fix is possible (e.g., missing required JSON field can be added programmatically), (b) for non-trivial issues, constructs a fix prompt including the document content, the list of structural failures, and instructions to fix only what is broken while preserving all other content, (c) invokes `callClaude()` with the fix prompt and the configured `timeouts.fix_call_seconds`, (d) returns the revised document content.

3. Implement `fixSemantic(documentContent: string, issues: Ring1CheckResult[], parentContent: string, config: PipelineConfig): string` that: (a) constructs a fix prompt including the document content, the parent document content for alignment reference, the list of semantic issues with their verdicts and details, and instructions to make minimal changes to resolve the semantic contradictions, (b) invokes `callClaude()`, (c) returns the revised document content.

4. Implement `fixQuality(documentContent: string, issues: Ring2CheckResult[], config: PipelineConfig): string` that: (a) constructs a fix prompt including the document content, the list of quality failures with their dimensions, evidence, and summaries, and instructions to make the minimum changes necessary to pass each failing rubric, (b) invokes `callClaude()`, (c) returns the revised document content.

5. Define all fix prompt templates as string constants or template functions within `fix.ts`.

## Constraints

- Fix prompts must be defined inline in this module, not imported from per-level modules — fix logic is level-agnostic.
- Do not call any validation functions; fixing and validation are separate concerns.
- Each fix function must return a complete document string, not a diff or patch.
- Do not modify files outside the declared scope.

## References

- spec-fa3a90b8#refinement-and-escalation — Defines the three fix function types (structural, semantic, quality) and their triggers
- spec-fa3a90b8#validation-rings — Provides context on what each ring validates, which determines what each fix function must address
- impl-5a0e3d8f — Parent implementation document; see REQ-07 for fix function requirements and Design Decisions on inline fix prompts
