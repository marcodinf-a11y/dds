# impl-5a0e3d8f: Validation Pipeline and Orchestration

## Objective

Implement the pipeline engine that orchestrates document validation, refinement, decomposition, and reporting. After this implementation, the system can run a complete pipeline from a root specification through three-ring validation, automated refinement with convergence detection, LLM-assisted decomposition, cross-level invariant checking, and summary reporting — producing validated, agent-executable atomic tasks or escalation reports for human review.

## Background

No codebase exists yet. This is the largest and final implementation document in the dependency chain. It consumes the per-level validators, prompt templates, and cross-level invariant checkers produced by Impl Docs 1, 2, and 3, and wraps them in the pipeline engine that controls execution flow. All file paths below reference the planned structure from the project architecture (analysis Part 14).

**Planned file locations:**

- `src/llm/claude-cli.ts` — Thin wrapper around `child_process.execSync` for invoking `claude -p`. Accepts a prompt string, returns parsed JSON. Handles timeouts, malformed output, retries on short 429s, and abort on long 429s. Validates returned JSON against expected schemas using `ajv` as a safety net. Configurable via `pipeline/config.json`.
- `src/llm/ring1.ts` — Ring 1 check runner. Takes a rule ID and document content, calls the appropriate prompt template function (from Impl Docs 1/2/3), prepends the shared Ring 1 system prompt, invokes `claude-cli.ts`, and returns a parsed `Ring1Result`.
- `src/llm/ring2.ts` — Ring 2 check runner. Same pattern as Ring 1 but with the shared Ring 2 system prompt and `Ring2Result` output schema.
- `src/llm/fix.ts` — Fix function implementations: `fixStructural()`, `fixSemantic()`, `fixQuality()`. Each takes a document and failure details, invokes `claude-cli.ts` with the appropriate fix prompt, and returns the revised document.
- `src/pipeline/refine.ts` — Refinement loop: `refine(document, level, config)`. Implements the `refine()` pseudocode from docs/04-validation-pipeline.md almost verbatim. Maintains `previous_ring1_issues` and `previous_ring2_issues` as local variables. Returns `{ promoted: true }` or `{ escalated: true, report: EscalationReport }`.
- `src/pipeline/convergence.ts` — Convergence detection: `checkConvergence(currentIssues, previousIssues, threshold)`. Compares `(rule, reference)` pair sets and returns boolean.
- `src/pipeline/orchestrate.ts` — Pipeline orchestration: `runPipeline(specId, config?, existingImplDocs?)` and `onSpecChange(specId)`. Implements the four-phase full pipeline run and the spec-change re-validation flow.
- `src/pipeline/escalation.ts` — Escalation report generation. Writes structured JSON reports to `pipeline/escalations/` with document snapshots.
- `src/cli/run-pipeline.ts` — CLI entry point: `npx tsx src/cli/run-pipeline.ts <spec-id>`. Parses arguments, loads config, calls `runPipeline()`, writes summary report.
- `src/cli/validate-spec.ts`, `src/cli/validate-impl.ts`, `src/cli/validate-task.ts` — CLI entry points for single-document Ring 0 validation (used by PostToolUse hooks).
- `src/cli/validate-cross.ts` — CLI entry point for cross-level invariant validation.
- `src/cli/refine.ts` — CLI entry point for single-document refinement loop.
- `src/cli/scope-guard.ts` — PreToolUse hook for scope enforcement: checks if a file modification is within the active task's `scope.files`.
- `src/cli/report.ts` — Pipeline report generation. Writes summary JSON to `pipeline/reports/`.
- `src/schemas/pipeline-config.schema.json` — JSON Schema for `pipeline/config.json`.
- `pipeline/config.json` — Runtime configuration (optional file; all fields have compiled-in defaults).
- `tests/unit/convergence.test.ts` — Unit tests for convergence detection.
- `tests/unit/pipeline-logic.test.ts` — Unit tests for orchestration logic with mocked `claude` CLI.
- `tests/smoke/` — Smoke tests using real `claude` CLI (on-demand, not in CI).

**Architecture — TypeScript orchestrator + `claude` CLI:**

The TypeScript program is the full implementation. It owns all control flow:
- Ring 0: calls per-level validator functions directly (from Impl Docs 1/2/3).
- Ring 1/2: calls per-level prompt template functions, prepends the shared system prompt, invokes `claude -p` via `claude-cli.ts`, validates the response.
- Fix functions: constructs fix prompts from docs/04 templates, invokes `claude -p`.
- Refinement loop: TypeScript `while` loop. `previous_issues` is a program variable.
- Convergence: TypeScript set math.
- Pipeline orchestration: TypeScript `runPipeline()` function with four sequential phases.

The `claude` CLI is invoked with:
- `-p` — non-interactive print mode (subscription billing, not API)
- `--output-format json` — structured JSON output
- `--json-schema '{...}'` — schema-constrained responses
- `--max-turns N` — limits agent turns per call

**Rate limit handling:**
- Short 429 (retry-after ≤ 60s): retry with exponential backoff, up to `claude_cli.max_retries_on_short_429` times (default 3) with `claude_cli.backoff_multiplier` (default 2).
- Long 429 (retry-after > 60s): abort pipeline immediately, report rate limit as termination reason.
- Configurable delay between calls: `claude_cli.delay_between_calls_ms` (default 2000ms).

**Naming conventions:** kebab-case files, PascalCase interfaces/types, camelCase functions, UPPER_SNAKE_CASE constants.

## Requirements

- **REQ-01:** Every document shall pass through three validation rings in strict sequence: Ring 0 (structural), then Ring 1 (semantic), then Ring 2 (quality). No ring may be skipped or reordered. Ring 1 executes only if Ring 0 passes. Ring 2 executes only if Ring 1 passes. (from spec-fa3a90b8#validation-rings)

- **REQ-02:** Ring 0 shall perform deterministic structural validation with no LLM involvement. The pipeline shall call per-level Ring 0 validator functions (from Impl Docs 1/2/3) directly. (from spec-fa3a90b8#validation-rings)

- **REQ-03:** Ring 1 shall perform semantic consistency validation using LLM prompts. The pipeline shall prepend the shared Ring 1 system prompt (defined in docs/04) to per-level check prompts (from Impl Docs 1/2/3), invoke `claude -p`, and parse structured JSON output conforming to the Ring 1 result schema (`check`, `verdict`, `issues`). (from spec-fa3a90b8#validation-rings)

- **REQ-04:** Ring 2 shall perform quality assessment using LLM rubrics. The pipeline shall prepend the shared Ring 2 system prompt to per-level rubric prompts, invoke `claude -p`, and parse structured JSON output conforming to the Ring 2 result schema (`check`, `dimension`, `verdict`, `evidence`, `summary`). (from spec-fa3a90b8#validation-rings)

- **REQ-05:** Each document level shall use its own set of Ring 0, Ring 1, and Ring 2 validation rules. The pipeline engine shall dispatch to the correct per-level validators and prompt templates based on the document level. (from spec-fa3a90b8#validation-rings)

- **REQ-06:** The refinement loop shall execute validation rings sequentially. When any ring fails and a fix is applied, validation shall restart from Ring 0 (because a semantic fix may break structure and a quality fix may introduce semantic contradictions). (from spec-fa3a90b8#refinement-and-escalation)

- **REQ-07:** When validation fails at any ring, the system shall attempt automated fixes: `fixStructural` for Ring 0 failures (deterministic where possible, LLM-based for non-trivial issues), `fixSemantic` for Ring 1 failures (LLM-based, aligning with the parent document), and `fixQuality` for Ring 2 failures (LLM-based, minimum changes to pass the rubric). (from spec-fa3a90b8#refinement-and-escalation)

- **REQ-08:** Convergence detection shall track previous issues separately per ring (`previous_ring1_issues` and `previous_ring2_issues`). Detection shall compare the set of `(rule, reference)` pairs between the current and previous iteration of the same ring. When the overlap ratio exceeds the configured convergence threshold, the system shall declare a convergence plateau and escalate. (from spec-fa3a90b8#refinement-and-escalation)

- **REQ-09:** The refinement loop shall terminate in one of three ways: (1) all three rings pass — promote to `validated`; (2) convergence detected at Ring 1 or Ring 2 — escalate; (3) max iteration count reached — escalate. (from spec-fa3a90b8#refinement-and-escalation)

- **REQ-10:** Escalation reports shall be written to `pipeline/escalations/` containing: `document_id`, `document_level`, `reason`, `iterations_completed`, `unresolved_issues`, `history`, and `document_snapshot` (file path to the document's state at escalation time). (from spec-fa3a90b8#refinement-and-escalation)

- **REQ-11:** Escalated documents may be manually edited and re-submitted. Re-submission shall restart the refinement loop from Ring 0 at the escalated document's level. (from spec-fa3a90b8#refinement-and-escalation)

- **REQ-12:** All cross-level invariants (CL-S01 through CL-S04, CL-T01 through CL-T05, CL-F01, CL-F02) shall be checked both after any individual document change (incremental validation) and during Phase 4 of full pipeline runs. All are deterministic (Ring 0 complexity). (from spec-fa3a90b8#cross-level-invariants)

- **REQ-13:** A full pipeline run shall proceed through four sequential phases: (1) validate spec through refinement loop; (2) decompose spec into impl docs and validate each; (3) decompose each impl doc into tasks, validate each, and check cross-task invariants; (4) check all cross-level invariants across the full document tree. The pipeline shall halt at any phase where an escalation occurs. (from spec-fa3a90b8#pipeline-orchestration)

- **REQ-14:** When a specification is modified, the system shall increment its `version`, revert all downstream impl docs to `draft`, and set any `pending` or `running` execution records to `abandoned`. Re-decomposition shall pass existing impl docs for incremental adjustment rather than generating entirely new documents. (from spec-fa3a90b8#pipeline-orchestration)

- **REQ-15:** The system shall support incremental validation: when a single document changes, only the validation rules affected by that change shall re-run. Affected rules are determined by the document type and change scope per the incremental validation table in docs/04. (from spec-fa3a90b8#pipeline-orchestration)

- **REQ-16:** Each pipeline run shall produce a summary report in `pipeline/reports/` containing: run ID, root spec ID, timestamps, overall status, per-document results (ID, level, status, per-ring pass/fail, iteration count), and aggregate statistics (documents validated per level, cross-level checks passed, total LLM calls, total token usage, refinement iterations per level, escalation count). (from spec-fa3a90b8#pipeline-orchestration)

- **REQ-17:** The system shall decompose validated specifications into implementation documents via LLM-assisted generation following the spec's Decomposition Guidance. The generation shall use the implementation document generation prompt (defined in Impl Doc 2) and produce paired JSON/Markdown artifacts. (from spec-fa3a90b8#document-decomposition)

- **REQ-18:** The system shall decompose validated implementation documents into 3-8 atomic tasks via LLM-assisted generation following the impl doc's Decomposition Notes. The generation shall use the atomic task generation prompt (defined in Impl Doc 3), maintain dependency symmetry, and list tasks in execution order. (from spec-fa3a90b8#document-decomposition)

- **REQ-19:** After successful decomposition and validation of all generated children, the parent document's JSON definition shall be updated: `implementation_docs` populated (for specs) or `atomic_tasks` populated (for impl docs). The parent's status shall change to `decomposed`. (from spec-fa3a90b8#document-decomposition)

- **REQ-20:** Ring 0 validation shall complete in under 1000 milliseconds per document. This constrains Ring 0 to deterministic algorithms with no LLM calls. (from spec-fa3a90b8#non-functional-requirements)

- **REQ-21:** The maximum number of refinement loop iterations shall be configurable via `pipeline/config.json` field `refinement.max_iterations` (default 5). (from spec-fa3a90b8#non-functional-requirements)

- **REQ-22:** The convergence detection threshold shall be configurable via `pipeline/config.json` field `refinement.convergence_threshold` (default 0.7). (from spec-fa3a90b8#non-functional-requirements)

- **REQ-23:** LLM call timeouts shall be configurable per operation type via `pipeline/config.json`: Ring 1 checks (`timeouts.ring1_check_seconds`, default 60), Ring 2 checks (`timeouts.ring2_check_seconds`, default 90), and fix function calls (`timeouts.fix_call_seconds`, default 120). (from spec-fa3a90b8#non-functional-requirements)

- **REQ-24:** The system shall handle LLM rate limits gracefully. For short rate limits (retry-after ≤ 60s): retry with exponential backoff up to `claude_cli.max_retries_on_short_429` times (default 3) with `claude_cli.backoff_multiplier` (default 2). For long rate limits (retry-after > 60s): abort the pipeline run immediately and report the rate limit reason. (from spec-fa3a90b8#non-functional-requirements)

- **REQ-25:** A configurable delay between consecutive LLM calls (`claude_cli.delay_between_calls_ms`, default 2000) shall be enforced to prevent burst rate limiting. (from spec-fa3a90b8#non-functional-requirements)

- **REQ-26:** Pipeline summary reports shall record total token usage and total LLM call count per pipeline run. (from spec-fa3a90b8#non-functional-requirements)

- **REQ-27:** The system shall be implemented in TypeScript targeting the Node.js runtime. (from spec-fa3a90b8#system-constraints)

- **REQ-28:** JSON definition files shall validate against JSON Schema Draft-07, using `ajv` v8. (from spec-fa3a90b8#system-constraints)

- **REQ-29:** The LLM backend shall be the `claude` CLI invoked via `claude -p` with `--output-format json` and `--json-schema` for schema-constrained responses. No Anthropic API key is required. (from spec-fa3a90b8#system-constraints)

- **REQ-30:** All pipeline configuration parameters shall be stored in `pipeline/config.json`. All fields are optional; omission means use the compiled-in default. The pipeline shall operate correctly without this file existing. (from spec-fa3a90b8#system-constraints)

- **REQ-31:** Document artifacts shall follow the fixed directory structure: specs in `specs/`, impl docs in `implementation/`, tasks in `tasks/`, reports in `pipeline/reports/`, escalations in `pipeline/escalations/`. (from spec-fa3a90b8#system-constraints)

## Design Decisions

- **`child_process.execSync` for `claude` CLI invocation:** The `claude-cli.ts` wrapper uses synchronous execution because the refinement loop is inherently sequential (each step depends on the previous result). Async execution would add complexity without enabling parallelism within a single refinement cycle. The pipeline does parallelize across documents in Phase 3 (multiple tasks), but this is achieved by sequential refinement of each task, not by concurrent LLM calls. *Alternative rejected:* `child_process.execFile` with async/await — adds unnecessary complexity for sequential pipeline flow; also risks concurrent rate limit issues.

- **`ajv` double-validation of LLM output:** The `claude` CLI's `--json-schema` flag constrains LLM output at generation time. The pipeline additionally validates the parsed JSON with `ajv` as a safety net against malformed responses. This belt-and-suspenders approach costs negligible time (ajv validation is microseconds) and catches edge cases where the CLI's schema enforcement might not be perfect. *Alternative rejected:* trusting `--json-schema` alone — insufficient defense against malformed output.

- **Compiled-in defaults with optional config overlay:** All configuration parameters have hardcoded defaults in the TypeScript source. If `pipeline/config.json` exists, it overrides those defaults. If the file doesn't exist or is empty, the pipeline works with defaults. This avoids a required configuration step. *Alternative rejected:* requiring `pipeline/config.json` to exist — friction for first-time use.

- **Separate modules for refinement, convergence, escalation, and orchestration:** Despite being tightly coupled (the orchestrator calls refine, which calls convergence and escalation), these are separated into distinct files for testability. Each function can be unit-tested independently with mocked dependencies. The coupling is through function calls, not shared state. *Alternative rejected:* a single monolithic pipeline module — harder to test individual components.

- **Fix prompt templates inline in `src/llm/fix.ts`:** The three fix prompts (`fixStructural`, `fixSemantic`, `fixQuality`) are defined directly in the fix module rather than in the per-level schema modules. Fix prompts are generic across levels (they receive the document and failures, not level-specific logic), unlike Ring 1/2 prompts which are level-specific. *Alternative rejected:* per-level fix prompts — unnecessary; the fix prompts from docs/04 are level-agnostic.

- **Shared Ring 1/2 system prompts as constants:** The shared system prompts for Ring 1 (docs/04 "System Prompt (All Ring 1 Checks)") and Ring 2 (docs/04 "System Prompt (All Ring 2 Checks)") are defined as constants in `src/llm/ring1.ts` and `src/llm/ring2.ts` respectively. They are prepended to the per-level check prompts before invocation. *Alternative rejected:* storing system prompts in external files — adds file I/O for static content that is version-controlled with the source.

- **Pipeline config schema as JSON Schema Draft-07:** The `pipeline/config.json` file is validated against its own JSON Schema (`src/schemas/pipeline-config.schema.json`) at pipeline startup. All fields are optional with no required fields. This provides early error detection for misconfigured pipelines. *Alternative rejected:* unvalidated config — typos in config keys would silently use defaults.

- **Scope guard as a CLI invoked by PreToolUse hook:** `src/cli/scope-guard.ts` is a standalone CLI that checks if a file path is within the active task's `scope.files`. It's invoked by a PreToolUse hook in the Claude Code Integration spec. For the programmatic mode, the pipeline engine calls the same check function directly. *Alternative rejected:* scope enforcement only in Claude Code hooks — would not protect the programmatic execution mode.

## Out of Scope

- **Per-level validation rules and prompt templates** — The specific Ring 0 validators, Ring 1/2 prompt templates, and generation prompts for each document level are defined in Impl Docs 1 (spec), 2 (impl doc), and 3 (task). This impl doc provides the framework that calls them.

- **JSON Schemas for document definitions** — `spec.schema.json`, `impl.schema.json`, `task.schema.json`, and `execution-record.schema.json` are defined in Impl Docs 1, 2, and 3. This impl doc defines only `pipeline-config.schema.json`.

- **Claude Code integration layer** — Hooks configuration (`.claude/settings.json`), subagent definitions (`.claude/agents/`), slash commands (`.claude/commands/`), and workflow orchestration through Claude Code sessions are covered by the Claude Code Integration spec (not yet created). This impl doc provides the CLI entry points that hooks and commands invoke.

- **CI/CD integration** — No CI environment exists yet (confirmed in analysis Appendix F). Tests run locally only.

- **Ring 1/2 batching optimization** — V1 uses separate LLM calls for each check (confirmed in analysis Appendix F: "fresh-context quality" over batching efficiency). Batching is a future optimization.

## Dependencies

- impl-7e2a9f1b — Provides the spec-level Ring 0 validator (`validateSpecRing0`), spec Ring 1/2 prompt template functions, spec generation prompt, CL-S01 through CL-S04 cross-level validators, the `SpecDefinition` type, shared result types (`Ring0Result`, `Ring1Result`, `Ring2Result`), and the Markdown heading extractor.

- impl-3c8d5e0a — Provides the impl-doc-level Ring 0 validator (`validateImplRing0`), impl doc Ring 1/2 prompt template functions, impl doc generation prompt, CL-T01 through CL-T05 cross-level validators, the `ImplDefinition` type, and graph utilities.

- impl-9f4b1c7d — Provides the task-level Ring 0 validator (`validateTaskRing0`), execution record validator (`validateExecutionRecord`), task Ring 1/2 prompt template functions, task generation prompt, CL-F01 and CL-F02 full-stack traceability validators, and the `TaskDefinition`, `ExecutionRecord` types.

- External: `ajv` v8 (already a dependency). `child_process` (Node.js built-in, for `claude` CLI invocation).

## Decomposition Notes

### Suggested Task Boundaries

- **Claude CLI wrapper and pipeline config** — `src/llm/claude-cli.ts`, `src/schemas/pipeline-config.schema.json`, `pipeline/config.json` — Implement the `claude -p` invocation wrapper with timeout handling, retry logic (short 429 backoff, long 429 abort), inter-call delay, output parsing, and `ajv` response validation. Define the pipeline config schema and default config file.

- **Ring 1 and Ring 2 runners** — `src/llm/ring1.ts`, `src/llm/ring2.ts` — Implement the Ring 1 check runner (shared system prompt + per-level check prompt → `claude-cli` → parsed `Ring1Result`) and Ring 2 check runner (same pattern with Ring 2 system prompt and `Ring2Result`). These dispatch to the appropriate per-level prompt template functions based on document level.

- **Fix functions** — `src/llm/fix.ts` — Implement `fixStructural()`, `fixSemantic()`, `fixQuality()` with the fix prompt templates from docs/04. Each function takes a document and failure details, invokes `claude-cli`, returns the revised document content.

- **Convergence detection and escalation** — `src/pipeline/convergence.ts`, `src/pipeline/escalation.ts` — Implement `checkConvergence()` (set math on `(rule, reference)` pairs) and escalation report generation (structured JSON to `pipeline/escalations/` with document snapshots).

- **Refinement loop** — `src/pipeline/refine.ts` — Implement `refine(document, level, config)` following the pseudocode from docs/04. Calls Ring 0 directly, Ring 1/2 via runners, fix functions on failure, convergence detection per ring. Returns promoted or escalated result.

- **Pipeline orchestration** — `src/pipeline/orchestrate.ts` — Implement `runPipeline(specId, config?, existingImplDocs?)` with four phases and `onSpecChange(specId)` with version increment, downstream invalidation, and re-decomposition. Calls per-level generation prompts for decomposition, refine() for validation, and cross-level validators for Phase 4.

- **CLI entry points and reporting** — `src/cli/run-pipeline.ts`, `src/cli/validate-spec.ts`, `src/cli/validate-impl.ts`, `src/cli/validate-task.ts`, `src/cli/validate-cross.ts`, `src/cli/refine.ts`, `src/cli/scope-guard.ts`, `src/cli/report.ts` — Implement all CLI entry points for programmatic and hook-invoked usage. Implement pipeline summary report generation.

- **Pipeline unit tests** — `tests/unit/convergence.test.ts`, `tests/unit/pipeline-logic.test.ts` — Test convergence detection with various overlap scenarios. Test orchestration logic with mocked `claude` CLI (mock `claude-cli.ts` to return predetermined responses). Test refinement loop termination conditions (promotion, convergence, max iterations).

### Ordering Rationale

The Claude CLI wrapper must exist before Ring 1/2 runners, fix functions, or any LLM-dependent component. Ring 1/2 runners and fix functions can be developed in parallel since they both depend on `claude-cli.ts` but not on each other. Convergence detection must exist before the refinement loop (which calls it). The refinement loop must exist before pipeline orchestration (which calls it). CLI entry points depend on orchestration but are thin wrappers. Reporting depends on the pipeline result types.

Dependency chain: Claude CLI Wrapper + Config → Ring Runners + Fix Functions (parallel) → Convergence + Escalation → Refinement Loop → Pipeline Orchestration → CLI Entry Points + Reporting → Unit Tests.

### Decomposition Constraints

- Each atomic task should touch no more than 5 files (this impl doc has more CLI entry points, but they are thin wrappers that can be grouped).
- The Claude CLI wrapper must be a standalone task — it is the foundation for all LLM operations and must have a stable interface before downstream tasks consume it.
- The refinement loop must not be combined with pipeline orchestration — they are separate control flow layers (per-document vs. cross-document).
- Convergence detection and escalation should share a task — they are tightly coupled (convergence triggers escalation) and small individually.
- CLI entry points can be grouped into a single task since they are thin wrappers over library functions.
- Unit tests should be a separate task. Mock the `claude` CLI at the `claude-cli.ts` boundary, not at the process level.
- Naming convention: task descriptions should follow the pattern "{Module}: {What is built}".
