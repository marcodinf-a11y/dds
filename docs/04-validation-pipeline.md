# Validation Pipeline

> Part of the Document Decomposition System (DDS).
> Referenced by: [Agent Guide](agent-guide.md)
> References: [Spec Schema](01-spec-schema.md), [Implementation Doc Schema](02-implementation-doc-schema.md), [Atomic Task Schema](03-atomic-task-schema.md)

## Overview

The validation pipeline is the CI system for text artifacts. Documents enter as drafts, pass through three validation rings, get refined in automated loops, and either reach "good enough" or escalate to human review.

This document defines:
1. The shared system prompts for LLM-based validation
2. The refinement loop algorithm
3. Convergence detection
4. Escalation handling
5. Pipeline orchestration (full runs and incremental)
6. Cross-level invariants
7. Pipeline output reporting

For the specific validation rules per document level, see the schema documents. This document focuses on the machinery that runs those rules.

---

## Validation Rings

### Ring 0 — Structural Validation

Deterministic. No LLM. Implemented as code (JSON schema validators, markdown parsers, graph cycle detectors). Runs in milliseconds. Produces binary pass/fail per rule.

**Implementation guidance:** Use any JSON Schema validator library. Parse markdown with a heading extractor (no full AST needed — just find H1/H2/H3 headings and check ordering and non-emptiness). For dependency graph checks, build an adjacency list and run DFS cycle detection.

Ring 0 rules are defined per level:
- Specification: R0-S01 through R0-S14 → see [Spec Schema](01-spec-schema.md)
- Implementation Document: R0-40 through R0-67 → see [Implementation Doc Schema](02-implementation-doc-schema.md)
- Atomic Task: R0-01 through R0-34 → see [Atomic Task Schema](03-atomic-task-schema.md)

### Ring 1 — Semantic Consistency

LLM-based. Narrow prompts. Structured JSON output. Each check asks exactly one question and expects an issues list.

**Determinism:** LLM-based checks are inherently non-deterministic. If running the same check twice produces different verdicts, the check prompt is too ambiguous — tighten it before proceeding. The system prompts below are designed to minimize variance through narrow questions and structured JSON output. Budget approximately 2K–5K tokens per Ring 1 check and 3K–8K tokens per Ring 2 check.

#### System Prompt (All Ring 1 Checks)

```
You are a document validation engine. Your job is to check a specific
property of the provided documents. You must:

1. Answer ONLY the question asked. Do not provide general feedback,
   suggestions, or commentary.
2. Output valid JSON matching the specified schema.
3. If no issues are found, return an empty issues array with verdict
   "pass".
4. For each issue found, provide a specific reference (section,
   requirement ID, or line) and a concrete description of the problem.
5. Do not suggest improvements. Only report violations of the specific
   property being checked.
6. Be thorough. Check every item, not just the first few.

Output schema:
{
  "check": "{rule_id}",
  "verdict": "pass" | "fail",
  "issues": [
    {
      "reference": "string — section, ID, or line where the issue occurs",
      "description": "string — what specifically is wrong"
    }
  ]
}
```

Ring 1 check prompts are defined per level:
- Specification: R1-S01 through R1-S04 → see [Spec Schema](01-spec-schema.md)
- Implementation Document: R1-10 through R1-15 → see [Implementation Doc Schema](02-implementation-doc-schema.md)
- Atomic Task: R1-01 through R1-04 → see [Atomic Task Schema](03-atomic-task-schema.md)

### Ring 2 — Quality Rubric

LLM-based. Explicit rubric prompts. Pass/fail verdicts with per-element evidence.

#### System Prompt (All Ring 2 Checks)

```
You are a document quality assessor. You evaluate a single quality
dimension using the rubric provided. You must:

1. Evaluate ONLY the dimension described. Do not assess other
   qualities.
2. Provide a clear PASS or FAIL verdict.
3. Support your verdict with specific evidence from the document.
4. If FAIL, list every instance that caused the failure.
5. Be strict. "Probably fine" is not PASS. If you are uncertain,
   FAIL with an explanation of what is ambiguous.
6. Assess each element individually where the rubric calls for it.

Output schema:
{
  "check": "{rule_id}",
  "dimension": "string — name of quality dimension",
  "verdict": "pass" | "fail",
  "evidence": [
    {
      "reference": "string — section or element assessed",
      "finding": "string — what you observed",
      "assessment": "pass" | "fail"
    }
  ],
  "summary": "string — one-sentence overall assessment"
}
```

Ring 2 rubric prompts are defined per level:
- Specification: R2-S01 through R2-S03 → see [Spec Schema](01-spec-schema.md)
- Implementation Document: R2-10 through R2-15 → see [Implementation Doc Schema](02-implementation-doc-schema.md)
- Atomic Task: R2-01 through R2-05 → see [Atomic Task Schema](03-atomic-task-schema.md)

---

## Refinement Loop

The refinement loop is the core automation. It takes a document, runs validation, and either promotes it or fixes it.

### Algorithm

```
function refine(document, level, max_iterations=5):
    iteration = 0
    previous_issues = null

    while iteration < max_iterations:
        iteration += 1

        # Ring 0 — structural
        ring0_result = run_ring0(document, level)
        if ring0_result.has_failures:
            document = fix_structural(document, ring0_result)
            continue  # restart from Ring 0

        # Ring 1 — semantic
        ring1_result = run_ring1(document, level)
        if ring1_result.has_failures:
            if converged(ring1_result.issues, previous_issues):
                return escalate("Ring 1 convergence plateau",
                               document, ring1_result)
            previous_issues = ring1_result.issues
            document = fix_semantic(document, ring1_result)
            continue  # restart from Ring 0

        # Ring 2 — quality
        ring2_result = run_ring2(document, level)
        if ring2_result.all_pass:
            return promote(document)
        else:
            if converged(ring2_result.issues, previous_issues):
                return escalate("Ring 2 convergence plateau",
                               document, ring2_result)
            previous_issues = ring2_result.issues
            document = fix_quality(document, ring2_result)
            continue  # restart from Ring 0

    return escalate("Max iterations reached", document, last_result)
```

**Critical design decision:** The loop restarts from Ring 0 after every fix. A semantic fix might break structure. A quality fix might introduce contradictions. Always re-validate from the bottom.

### Fix Functions

#### fix_structural

Deterministic fixes where possible (add missing sections, fix JSON schema violations). Falls back to LLM for non-trivial structural issues.

```
System prompt for structural fixes:

You are a document structure fixer. The following document has
structural validation failures. Fix ONLY the structural issues
listed below. Do not change content, meaning, or wording beyond
what is necessary to fix the structure.

Document:
{document_content}

Structural failures:
{ring0_failures_json}

Rules:
- If a required section is missing, add it with a placeholder
  "[TODO: Fill in {section name}]".
- If sections are in the wrong order, reorder them.
- If the H1 heading doesn't match the expected pattern, fix it.
- If JSON schema validation fails, fix the JSON to conform.
- Do not invent content. Use placeholders where content is needed.

Output the complete revised document.
```

#### fix_semantic

```
System prompt for semantic fixes:

You are a document editor. The following document failed a semantic
consistency check. Fix ONLY the specific issues listed. Do not make
any other changes. Preserve all existing content that was not flagged.

Document:
{document_content}

Issues to fix:
{ring1_issues_json}

Rules:
- For coverage gaps: add the missing content in the appropriate
  section.
- For contradictions: resolve by aligning with the parent document
  (spec for impl docs, impl doc for atomic tasks).
- For silently dropped items: add them either to Requirements or
  Out of Scope with a note explaining which.
- For scope violations: either adjust the Approach to stay in scope
  or note that the scope definition may need updating (flag for
  human review).

Output the complete revised document.
```

#### fix_quality

```
System prompt for quality fixes:

You are a document editor. The following document failed a quality
check on the dimension "{dimension}". Fix ONLY the aspects flagged
in the evidence below. Do not make any other changes. Preserve all
existing content that was not flagged.

Document:
{document_content}

Failed dimension: {dimension}
Evidence:
{ring2_evidence_json}

Rules:
- Make the minimum changes necessary to pass the rubric.
- For vague requirements: make them specific and testable.
- For missing coverage: add the missing error paths or edge cases.
- For insufficient context: add specific file/class/method
  references.
- For vague approach steps: make them concrete with file and method
  names.

Output the complete revised document.
```

---

## Convergence Detection

```
function converged(current_issues, previous_issues):
    if previous_issues is null:
        return false

    # Extract the set of (rule, reference) pairs
    current_set = {(i.rule, i.reference) for i in current_issues}
    previous_set = {(i.rule, i.reference) for i in previous_issues}

    # If the same issues keep appearing, we've plateaued
    if len(current_set) == 0:
        return false  # no issues = not converged, actually passed

    overlap = current_set & previous_set
    if len(overlap) / len(current_set) > 0.7:
        return true

    return false
```

The 0.7 threshold: if 70% or more of the current issues were also present in the previous iteration, the fixer is not making progress. This is tunable — lower values are more aggressive about escalating, higher values give the loop more chances.

**Why issue identity, not issue count:** The detector compares `(rule, reference)` pairs, not counts. This catches the case where the fixer resolves one issue but introduces a new one — the count stays the same but it's making progress.

---

## Escalation

When the loop cannot resolve issues, it produces an escalation report for human review.

### Escalation Report Schema

```json
{
  "document_id": "impl-c9d2f4a1",
  "document_level": "implementation",
  "reason": "Ring 2 convergence plateau",
  "iterations_completed": 4,
  "unresolved_issues": [
    {
      "rule": "R2-12",
      "reference": "Background section",
      "description": "Does not name specific file paths for the SOAP client wrapper"
    }
  ],
  "history": [
    {
      "iteration": 1,
      "ring0": "pass",
      "ring1": "fail — 3 issues",
      "ring2": "not reached"
    },
    {
      "iteration": 2,
      "ring0": "pass",
      "ring1": "pass",
      "ring2": "fail — 2 issues"
    },
    {
      "iteration": 3,
      "ring0": "pass",
      "ring1": "pass",
      "ring2": "fail — 2 issues (same)"
    }
  ],
  "document_snapshot": "pipeline/escalations/impl-c9d2f4a1-escalated.md"
}
```

### Handling Escalations

1. Read the escalation report in `pipeline/escalations/`.
2. Review `unresolved_issues` and `history` to understand what the loop tried.
3. Options:
   - Fix the document manually and re-submit to the pipeline.
   - Adjust the validation rubric if it's too strict for this case.
   - Accept the document as-is if the remaining issues are acceptable (manual override).
4. Re-run the pipeline from the escalated document's level.

---

## Pipeline Orchestration

### Full Pipeline Run

```
function run_pipeline(spec_id):

    # Phase 1: Validate specification
    spec = load(spec_id)
    spec = refine(spec, level="spec")
    if spec.escalated:
        return pipeline_result(blocked_at="spec",
                               escalation=spec.escalation)
    set_status(spec, "validated")

    # Phase 2: Decompose spec → implementation docs
    impl_docs = generate_impl_docs(spec)  # uses generation prompt
    for impl in impl_docs:
        impl = refine(impl, level="implementation")
        if impl.escalated:
            return pipeline_result(blocked_at="implementation",
                                   escalation=impl.escalation)
        set_status(impl, "validated")

    # Update spec with impl doc IDs
    spec.implementation_docs = [impl.id for impl in impl_docs]
    set_status(spec, "decomposed")

    # Phase 3: Decompose impl docs → atomic tasks
    for impl in impl_docs:
        tasks = generate_atomic_tasks(impl)  # uses generation prompt

        # Validate cross-task invariants (dependency symmetry, cycles)
        cross_task_result = validate_cross_task(tasks)
        if cross_task_result.has_failures:
            tasks = fix_cross_task(tasks, cross_task_result)

        for task in tasks:
            task = refine(task, level="atomic_task")
            if task.escalated:
                return pipeline_result(blocked_at="atomic_task",
                                       escalation=task.escalation)

        # Update impl doc with task IDs
        impl.atomic_tasks = [t.id for t in tasks]
        set_status(impl, "decomposed")

    # Phase 4: Cross-level invariants
    cl_result = validate_cross_level(spec_id)
    if cl_result.has_failures:
        return pipeline_result(blocked_at="cross_level",
                               issues=cl_result)

    return pipeline_result(status="ready",
                           task_count=count_tasks(spec_id))
```

### Re-validation on Spec Change

```
function on_spec_change(spec_id):
    spec = load(spec_id)
    spec.version += 1

    # Invalidate all downstream documents
    for impl_id in spec.implementation_docs:
        set_status(impl_id, "draft")
        impl = load(impl_id)
        for task_id in impl.atomic_tasks:
            mark_stale(task_id)

    # Re-run the full pipeline
    run_pipeline(spec_id)
```

### Incremental Validation

When a single document changes, only affected rules re-run:

| Change | Re-run |
|---|---|
| Spec markdown edited | Ring 0-S + Ring 1-S + Ring 2-S for that spec. If pass, re-run CL-S rules. If spec version incremented, trigger on_spec_change. |
| Impl doc markdown edited | Rings 0+1+2 for that doc. If pass, re-run CL-T rules for its atomic tasks. |
| Task description edited | Rings 0+1+2 for that task. Re-run CL-T03, CL-T04 for its parent. |
| Task definition edited | Ring 0 for that task. R0-07 for all referenced tasks. CL-T01, CL-T05. |
| New impl doc added to spec | CL-S01, CL-S03 for spec. Full Ring 0+1+2 for new doc. |
| New task added to impl | CL-T01, CL-T03, CL-T04 for parent. Full Ring 0+1+2 for new task. R0-07 for referenced deps. |

---

## Cross-Level Invariants

These rules span document boundaries. All are deterministic (Ring 0 level). They are checked after any document change and during Phase 4 of a full pipeline run.

### Spec ↔ Implementation Document

| Rule | Check |
|---|---|
| CL-S01 | **Bidirectional consistency:** every impl doc's `spec_sections` entries reference a spec whose `implementation_docs` list contains that impl doc's ID, and vice versa |
| CL-S02 | Every spec with `status: decomposed` has ≥1 implementation document |
| CL-S03 | The union of all `spec_sections` across a spec's implementation docs covers every functional area (H3 heading) in the spec |
| CL-S04 | When a spec's `version` increments, all downstream implementation docs revert to `draft` |

### Implementation Document ↔ Atomic Task

| Rule | Check |
|---|---|
| CL-T01 | **Bidirectional consistency:** every task's `parent` references an impl doc that lists that task in its `atomic_tasks` array, and vice versa |
| CL-T02 | Every impl doc with `status: decomposed` has ≥1 atomic task |
| CL-T03 | **Complete module coverage:** The union of all `scope.modules` across an impl doc's atomic tasks must exactly equal the impl doc's `modules`. Every declared module must be claimed by at least one task. A module should only be declared in an impl doc if at least one task will operate within it. For transitive dependencies (e.g., shared type modules accessed indirectly), include the module in a task's `scope.modules` if the task directly depends on it. |
| CL-T04 | The union of all `context_refs` across an impl doc's atomic tasks covers all entries in the impl doc's `spec_sections` (full traceability) |
| CL-T05 | Dependency ordering between impl docs is consistent with the `blocked_by`/`blocks` graph of their atomic tasks |

### Full-Stack Traceability

| Rule | Check |
|---|---|
| CL-F01 | Every spec FR-XX traces through ≥1 impl doc REQ-XX to ≥1 atomic task acceptance criterion (top-down chain) |
| CL-F02 | Every atomic task acceptance criterion traces back through its parent to ≥1 spec FR/NFR (bottom-up, no orphan criteria) |

---

## Pipeline Output Report

Each pipeline run produces a summary report stored in `pipeline/reports/`.

```json
{
  "pipeline_run_id": "run-20260321-143022",
  "spec_id": "spec-e8a2b4c6",
  "started_at": "2026-03-21T14:30:22Z",
  "finished_at": "2026-03-21T14:35:18Z",
  "status": "ready",
  "summary": {
    "specs_validated": 1,
    "impl_docs_validated": 2,
    "atomic_tasks_validated": 7,
    "cross_level_checks_passed": 9,
    "total_llm_calls": 34,
    "total_tokens": 145000,
    "refinement_iterations": {
      "spec": 1,
      "implementation": 3,
      "atomic_task": 8
    },
    "escalations": 0
  },
  "documents": [
    {
      "id": "spec-e8a2b4c6",
      "level": "spec",
      "status": "decomposed",
      "ring0": "pass",
      "ring1": "pass",
      "ring2": "pass",
      "iterations": 1
    },
    {
      "id": "impl-c9d2f4a1",
      "level": "implementation",
      "status": "decomposed",
      "ring0": "pass",
      "ring1": "pass",
      "ring2": "pass",
      "iterations": 2
    },
    {
      "id": "at-a1b2c3d4",
      "level": "atomic_task",
      "status": "validated",
      "ring0": "pass",
      "ring1": "pass",
      "ring2": "pass",
      "iterations": 1
    }
  ]
}
```

---

## File Organization

```
project-root/
├── validation/
│   ├── ring0/                # Ring 0 validator scripts
│   ├── ring1/                # Ring 1 prompt templates
│   ├── ring2/                # Ring 2 rubric templates
│   └── cross-level/          # Cross-level invariant checkers
├── pipeline/
│   ├── reports/              # Pipeline run reports (JSON)
│   │   └── run-20260321-143022.json
│   └── escalations/          # Escalation reports + snapshots
│       └── impl-c9d2f4a1-escalated.md
└── schemas/
    ├── 01-spec-schema.md
    ├── 02-implementation-doc-schema.md
    ├── 03-atomic-task-schema.md
    ├── 04-validation-pipeline.md     # This document
    └── 05-agent-guide.md
```
