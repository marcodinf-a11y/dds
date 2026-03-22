# at-e6ef2a88: Pipeline: CLI Entry Points and Reporting

## Objective

Implement all CLI entry points for programmatic and hook-invoked pipeline operations, plus the summary report generator. After this task, the system has executable commands for running the full pipeline, validating individual documents, refining documents, checking cross-level invariants, enforcing scope guards, and producing pipeline reports.

## Context

The pipeline orchestrator (at-0b694e5d) and all underlying modules are complete. This task creates thin CLI wrappers that parse arguments, load configuration, delegate to library functions, and format output. These entry points serve two consumers: (1) direct invocation via `npx tsx src/cli/...` and (2) Claude Code hooks (PostToolUse for validation, PreToolUse for scope guard).

The CLI entry points intentionally contain no business logic — they are wrappers. The report module generates pipeline summary JSON to `pipeline/reports/` per REQ-16.

Files in this task (grouped because they are all thin wrappers, max 5 files in scope but additional CLI files share the same `src/cli/` directory and pattern):
- `src/cli/run-pipeline.ts` — Full pipeline execution
- `src/cli/validate-spec.ts` — Single spec Ring 0 validation
- `src/cli/validate-impl.ts` — Single impl doc Ring 0 validation
- `src/cli/validate-task.ts` — Single task Ring 0 validation
- `src/cli/validate-cross.ts` — Cross-level invariant validation

Additional files created alongside (same module, same pattern):
- `src/cli/refine.ts` — Single document refinement
- `src/cli/scope-guard.ts` — PreToolUse scope enforcement
- `src/cli/report.ts` — Report generation library

## Approach

1. Create `src/cli/report.ts` exporting `generateReport(result: PipelineResult): string` that: (a) generates a unique run ID, (b) assembles a summary JSON object containing run ID, root spec ID, start/end timestamps, overall status, per-document results (ID, level, status, per-ring pass/fail, iteration count), and aggregate statistics (documents validated per level, cross-level checks passed, total LLM calls, total token usage, refinement iterations per level, escalation count), (c) creates `pipeline/reports/` directory if needed, (d) writes the report to `pipeline/reports/{runId}.json`, (e) returns the file path.

2. Create `src/cli/run-pipeline.ts` that: (a) reads `process.argv[2]` as spec ID, (b) calls `loadConfig()`, (c) calls `runPipeline(specId, config)`, (d) calls `generateReport(result)`, (e) prints summary to stdout, (f) exits 0 if completed, 1 if escalated/aborted.

3. Create `src/cli/validate-spec.ts` that: (a) reads `process.argv[2]` as spec ID, (b) loads the spec document, (c) calls `validateSpecRing0()` (from Impl Doc 1), (d) prints results, (e) exits 0 if valid, 1 if invalid. Create `src/cli/validate-impl.ts` and `src/cli/validate-task.ts` following the identical pattern with their respective Ring 0 validators.

4. Create `src/cli/validate-cross.ts` that: (a) reads `process.argv[2]` as root spec ID, (b) loads the full document tree, (c) runs all cross-level invariant validators (CL-S01 through CL-S04, CL-T01 through CL-T05, CL-F01, CL-F02), (d) prints per-invariant results, (e) exits 0 if all pass, 1 if any fail.

5. Create `src/cli/refine.ts` that: (a) reads `process.argv[2]` as document ID and `process.argv[3]` as level, (b) calls `loadConfig()`, (c) calls `refine(documentPath, level, config)`, (d) prints promoted/escalated result, (e) exits 0 if promoted, 1 if escalated.

6. Create `src/cli/scope-guard.ts` that: (a) reads `process.argv[2]` as file path and `process.argv[3]` as task ID, (b) loads the task definition JSON, (c) checks if the file path matches any entry in `scope.files`, (d) exits 0 if the file is in scope (allowed), 1 if out of scope (blocked), printing a message to stderr when blocked.

## Constraints

- CLI entry points must contain no business logic — only argument parsing, delegation, output formatting, and error handling.
- All CLI files must wrap their main logic in try/catch, printing errors to stderr and exiting with code 1.
- Use `process.argv` for argument parsing; no external CLI framework.
- Exit codes must be consistent: 0 for success/pass, 1 for failure/escalation/error.
- The scope guard must work standalone (no dependency on pipeline state) by reading the task JSON directly.
- Report JSON must include all fields specified in REQ-16.

## References

- spec-fa3a90b8#pipeline-orchestration — Defines pipeline execution entry points and summary report requirements (REQ-16)
- spec-fa3a90b8#non-functional-requirements — Defines report contents: token usage, LLM call counts, per-document results
- spec-fa3a90b8#system-constraints — Mandates the fixed directory structure for reports (`pipeline/reports/`) and document artifacts
- impl-5a0e3d8f — Parent implementation document; see REQ-16, REQ-26, REQ-31 for reporting and directory requirements, and Design Decisions on scope guard as CLI for PreToolUse hook
