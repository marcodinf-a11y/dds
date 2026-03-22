# at-e0ffdd40: Pipeline: Convergence Detection and Escalation

## Objective

Implement convergence detection (set-overlap comparison of validation issues between iterations) and escalation report generation. After this task, the refinement loop can detect when automated fixes are no longer making progress and can produce structured escalation reports for human review.

## Context

Convergence detection and escalation are tightly coupled: convergence triggers escalation. They share no dependencies on LLM modules (no `claude-cli.ts` import needed) and can be implemented before the Ring runners or fix functions exist. Convergence operates on sets of `(rule, reference)` pairs extracted from Ring 1 or Ring 2 results. Escalation writes structured JSON reports to `pipeline/escalations/`.

The convergence threshold is configurable via `refinement.convergence_threshold` (default 0.7). When the overlap ratio between current and previous issues exceeds this threshold, the refinement loop declares a convergence plateau.

Escalation reports contain: `document_id`, `document_level`, `reason` (convergence or max_iterations), `iterations_completed`, `unresolved_issues`, `history` (array of per-iteration results), and `document_snapshot` (file path to the document's state at escalation time).

## Approach

1. Create `src/pipeline/convergence.ts` exporting:
   - An `IssuePair` type or interface: `{ rule: string; reference: string }`.
   - A `checkConvergence(currentIssues: IssuePair[], previousIssues: IssuePair[], threshold: number): boolean` function that: (a) converts both arrays to sets of serialized `(rule, reference)` pair strings, (b) computes the intersection of the two sets, (c) computes the overlap ratio as `|intersection| / |currentIssues|` (proportion of current issues that are repeats), (d) returns `true` if the ratio exceeds or equals the threshold, (e) returns `false` if `previousIssues` is empty (first iteration — no convergence possible).

2. Create `src/pipeline/escalation.ts` exporting:
   - An `EscalationReport` interface with fields: `document_id: string`, `document_level: string`, `reason: 'convergence' | 'max_iterations'`, `iterations_completed: number`, `unresolved_issues: IssuePair[]`, `history: IterationRecord[]`, `document_snapshot: string`, `timestamp: string`.
   - An `IterationRecord` interface with fields: `iteration: number`, `ring0_passed: boolean`, `ring1_passed: boolean | null`, `ring2_passed: boolean | null`, `issues_found: number`, `fix_applied: string | null`.
   - A `generateEscalationReport(report: EscalationReport): string` function that: (a) creates `pipeline/escalations/` directory if it does not exist, (b) writes the report as formatted JSON to `pipeline/escalations/{document_id}-{timestamp}.json`, (c) returns the file path of the written report.

## Constraints

- Do not import from `src/llm/` modules — convergence and escalation are pure logic with no LLM dependency.
- Do not call any validation or fix functions; this module only compares issue sets and writes reports.
- Escalation report files must be valid JSON.
- The `document_snapshot` field stores a file path, not the document content itself.

## References

- spec-fa3a90b8#refinement-and-escalation — Defines convergence detection semantics (set overlap on (rule, reference) pairs), convergence threshold, escalation report structure, and re-submission workflow
- spec-fa3a90b8#non-functional-requirements — Defines the configurable convergence threshold (default 0.7)
- impl-5a0e3d8f — Parent implementation document; see REQ-08, REQ-09, REQ-10, REQ-11 for convergence and escalation requirements
