# Atomic Task Schema

> Part of the Document Decomposition System (DDS).
> Referenced by: [Validation Pipeline](validation-pipeline.md), [Agent Guide](agent-guide.md)

## Overview

An atomic task is the smallest unit of work in the decomposition pipeline. It represents a single, agent-executable coding task derived from an implementation document.

```
Specification
  └── Implementation Document
        └── Atomic Task  ← this level
```

An atomic task consists of two immutable artifacts and one mutable artifact:

- **Task Definition** (JSON) — structural metadata, dependencies, acceptance criteria. Immutable once validated.
- **Task Description** (Markdown) — prose narrative the agent uses to understand and execute the task. Immutable once validated.
- **Execution Record** (JSON) — created by the agent harness at runtime, tracks what happened. Mutable.

The definition and description are produced by the decomposition pipeline and frozen once validated. The execution record is created and updated by the agent harness during execution. One task definition can have multiple execution records (retries).

---

## ID Formats

| Type | Pattern | Example |
|---|---|---|
| Atomic Task | `at-[0-9a-f]{8}` | `at-a1b2c3d4` |
| Acceptance Criterion | `ac-[0-9a-f]{8}` | `ac-d4e5f6a7` |

Generate with: `openssl rand -hex 4`

---

## Artifact 1: Task Definition (JSON)

### Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AtomicTaskDefinition",
  "type": "object",
  "required": [
    "id", "parent", "description", "blocked_by", "blocks",
    "scope", "acceptance_criteria", "context_refs"
  ],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^at-[0-9a-f]{8}$",
      "description": "Unique identifier. Generated as 8 random hex characters with 'at-' prefix."
    },
    "parent": {
      "type": "string",
      "pattern": "^impl-[0-9a-f]{8}$",
      "description": "ID of the implementation document this task was decomposed from."
    },
    "description": {
      "type": "string",
      "pattern": "^at-[0-9a-f]{8}\\.md$",
      "description": "Filename of the markdown description document for this task."
    },
    "blocked_by": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^at-[0-9a-f]{8}$"
      },
      "description": "Task IDs that must be completed before this task can start."
    },
    "blocks": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^at-[0-9a-f]{8}$"
      },
      "description": "Task IDs that cannot start until this task is completed."
    },
    "scope": {
      "type": "object",
      "required": ["files", "modules"],
      "additionalProperties": false,
      "properties": {
        "files": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1,
          "description": "Exhaustive list of files the agent is permitted to modify. ENFORCED by the harness — changes outside scope are rejected."
        },
        "modules": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1,
          "description": "Logical modules this task operates within. Must be a subset of the parent impl doc's modules."
        }
      },
      "description": "Enforced scope boundary."
    },
    "acceptance_criteria": {
      "type": "array",
      "items": { "$ref": "#/definitions/AcceptanceCriterion" },
      "minItems": 1,
      "description": "Criteria that must ALL pass for the task to be considered complete."
    },
    "context_refs": {
      "type": "array",
      "items": { "type": "string" },
      "description": "References to spec sections this task fulfills. Format: spec-XXXXXXXX#section-X.Y"
    }
  },
  "definitions": {
    "AcceptanceCriterion": {
      "oneOf": [
        { "$ref": "#/definitions/TestCriterion" },
        { "$ref": "#/definitions/BuildCriterion" },
        { "$ref": "#/definitions/LintCriterion" },
        { "$ref": "#/definitions/ReviewCriterion" }
      ]
    },
    "TestCriterion": {
      "type": "object",
      "required": ["id", "type", "description", "verify"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^ac-[0-9a-f]{8}$" },
        "type": { "type": "string", "enum": ["test"] },
        "description": { "type": "string" },
        "verify": {
          "type": "string",
          "description": "Shell command to execute. Exit code 0 means pass."
        }
      }
    },
    "BuildCriterion": {
      "type": "object",
      "required": ["id", "type", "description", "verify"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^ac-[0-9a-f]{8}$" },
        "type": { "type": "string", "enum": ["build"] },
        "description": { "type": "string" },
        "verify": {
          "type": "string",
          "description": "Shell command to execute. Exit code 0 means pass."
        }
      }
    },
    "LintCriterion": {
      "type": "object",
      "required": ["id", "type", "description", "verify"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^ac-[0-9a-f]{8}$" },
        "type": { "type": "string", "enum": ["lint"] },
        "description": { "type": "string" },
        "verify": {
          "type": "string",
          "description": "Shell command to execute. Exit code 0 means pass."
        }
      }
    },
    "ReviewCriterion": {
      "type": "object",
      "required": ["id", "type", "description", "rubric"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^ac-[0-9a-f]{8}$" },
        "type": { "type": "string", "enum": ["review"] },
        "description": { "type": "string" },
        "rubric": {
          "type": "string",
          "description": "Evaluation prompt for the LLM-as-judge. Must be specific enough to produce a binary pass/fail verdict with evidence."
        }
      }
    }
  }
}
```

### Acceptance Criteria Types

| Type | Verified By | Required Field | Purpose |
|---|---|---|---|
| `test` | Shell command exit code | `verify` | Unit/integration tests pass |
| `build` | Shell command exit code | `verify` | Code compiles without warnings |
| `lint` | Shell command exit code | `verify` | Static analysis / architectural rules pass |
| `review` | LLM-as-judge | `rubric` | Pattern adherence, code quality, style |

Types `test`, `build`, and `lint` are **machine-verifiable** — the harness runs the `verify` command and checks exit code 0. Type `review` requires an **LLM judgment call** using the `rubric` as the evaluation prompt.

### Dependency Symmetry Invariant

The `blocks` and `blocked_by` fields are redundant by design — both directions are stored for fast local lookup. This creates an invariant that Ring 0 enforces:

**For every pair (A, B): A.blocks contains B if and only if B.blocked_by contains A.**

If task `at-a1b2c3d4` declares `"blocks": ["at-e9f1a3b5"]`, then `at-e9f1a3b5` MUST have `"blocked_by": ["at-a1b2c3d4"]`.

### Task Definition Example

```json
{
  "id": "at-a1b2c3d4",
  "parent": "impl-c9d2f4a1",
  "description": "at-a1b2c3d4.md",
  "blocked_by": ["at-7f3e2a19", "at-b4c8d6e2"],
  "blocks": ["at-e9f1a3b5"],
  "scope": {
    "files": [
      "src/LTOS.Services/LeakageTestService.cs",
      "tests/LTOS.Services.Tests/LeakageTestServiceTests.cs"
    ],
    "modules": ["LTOS.Services"]
  },
  "acceptance_criteria": [
    {
      "id": "ac-d4e5f6a7",
      "type": "test",
      "description": "Unit test for RunTest with valid input passes",
      "verify": "dotnet test LTOS.Services.Tests --filter RunTest_ValidInput_ReturnsSuccess"
    },
    {
      "id": "ac-1a2b3c4d",
      "type": "test",
      "description": "No regressions in service test suite",
      "verify": "dotnet test LTOS.Services.Tests"
    },
    {
      "id": "ac-8e9f0a1b",
      "type": "build",
      "description": "Solution compiles without new warnings",
      "verify": "dotnet build LTOS.sln /warnaserror"
    },
    {
      "id": "ac-2c3d4e5f",
      "type": "lint",
      "description": "No architectural rule violations",
      "verify": "dotnet test LTOS.ArchTests"
    },
    {
      "id": "ac-6a7b8c9d",
      "type": "review",
      "description": "Error handling follows existing Result<T> pattern",
      "rubric": "Check that all error cases return Result.Failure with a descriptive error message instead of throwing exceptions. Compare against existing methods in LeakageTestService. Verdict: PASS if all error paths use Result.Failure, FAIL if any path throws."
    }
  ],
  "context_refs": [
    "spec-e8a2b4c6#section-2.1",
    "spec-e8a2b4c6#section-2.1.4"
  ]
}
```

---

## Artifact 2: Task Description (Markdown)

### Template

File: `tasks/descriptions/{at-id}.md`

Must contain exactly five H2 sections in this exact order.

```markdown
# {at-id}: {title}

## Objective

One or two sentences. What is true about the system after this task
that wasn't true before? This section answers: "If this task is done
correctly, what has changed?"

## Context

What the agent needs to understand about the existing code, the
surrounding architecture, or the business logic to execute this task
correctly.

Reference specific files, classes, methods, and patterns. Front-load
the knowledge that a human developer would have from working in the
codebase. The agent will use this section to orient itself before
making changes.

Include:
- Relevant file paths and class names
- Existing patterns the agent must follow
- Types and interfaces the agent will interact with
- Any conventions (naming, error handling, testing)

## Approach

Step-by-step implementation plan. Each step names a specific file,
class, or method and describes the change. The agent follows this
as a plan, not as a suggestion.

Steps should be concrete enough that the agent is not making
architectural decisions. "Add a method to X that does Y by calling Z"
is good. "Implement error handling" is too vague.

## Constraints

What the agent must NOT do. Each constraint is a single, verifiable
statement. Constraints are checked during review.

Examples:
- Do not modify the public API of {class}.
- Do not introduce new dependencies.
- Do not modify files outside the declared scope.
- Do not use async void.

## References

Links to spec sections, related atomic tasks, and relevant
documentation. Each reference includes a brief note on what it
provides.

- spec-XXXXXXXX#section-X.Y — {what this section defines}
- at-XXXXXXXX — {what this task provides/depends on}
```

### Task Description Example

```markdown
# at-a1b2c3d4: Implement LeakageTestService.RunTest

## Objective

Add the RunTest method to LeakageTestService that executes a single
leakage test cycle and returns a typed Result indicating success or
failure. This enables the test execution workflow defined in spec
section 2.1.

## Context

LeakageTestService lives in src/LTOS.Services/LeakageTestService.cs
and currently has methods for device discovery and connection
management. The service follows a pattern where all public methods
return Result<T> (introduced in at-7f3e2a19) rather than throwing
exceptions.

The test cycle involves calling the SOAP endpoint RunTest on the
device client (ILTOSClient), waiting for completion via polling
GetTestStatus, and returning the final TestResult. ILTOSClient is
injected via constructor and is already available as a private field
_client.

The existing method ConnectToDevice in the same class demonstrates
the error handling pattern: wrap the SOAP call in try/catch,
return Result.Failure on SoapException with the fault string,
return Result.Success with the payload on success.

ServiceOptions is injected via IOptions<ServiceOptions> and contains
the PollingIntervalMs property for configuring poll frequency.

The mapping extension methods ToSoapRequest() and ToTestResult()
(implemented in at-b4c8d6e2) handle conversion between domain
types and SOAP types.

## Approach

1. Add method signature `public async Task<Result<TestResult>> RunTest(TestParameters parameters, CancellationToken cancellationToken = default)` to LeakageTestService.
2. Validate input parameters. Return `Result.Failure("Parameters must not be null")` if null.
3. Call `_client.RunTest(parameters.ToSoapRequest())` inside try/catch following the ConnectToDevice pattern.
4. Poll `_client.GetTestStatus()` in a loop with delay from `_options.Value.PollingIntervalMs` until status is Completed or Failed. Check cancellationToken on each iteration.
5. If cancellationToken is triggered, call `_client.AbortTest()` and return `Result.Failure("Test cancelled by user")`.
6. On Completed, return `Result.Success(_client.GetTestResult().ToTestResult())`.
7. On Failed, return `Result.Failure` with the status error message.
8. Catch SoapException and return `Result.Failure(ex.Message)`.
9. Catch TimeoutException and return `Result.Failure("Device communication timeout")`.

## Constraints

- Do not modify the ILTOSClient interface.
- Do not add new public methods beyond RunTest.
- Do not introduce async void.
- Do not hardcode the polling interval — use ServiceOptions.PollingIntervalMs.
- Do not throw exceptions for expected error conditions.

## References

- spec-e8a2b4c6#section-2.1 — Full requirements for test execution workflow
- spec-e8a2b4c6#section-2.1.4 — Error handling requirements for test execution
- at-7f3e2a19 — Introduces Result<T> type used as return value
- at-b4c8d6e2 — Implements ToSoapRequest/ToTestResult mapping methods
```

---

## Artifact 3: Execution Record (JSON)

### Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ExecutionRecord",
  "type": "object",
  "required": ["task_id", "run", "status", "criteria_results", "started_at"],
  "additionalProperties": false,
  "properties": {
    "task_id": {
      "type": "string",
      "pattern": "^at-[0-9a-f]{8}$",
      "description": "References the atomic task definition."
    },
    "run": {
      "type": "integer",
      "minimum": 1,
      "description": "Run number. Increments with each retry of the same task."
    },
    "status": {
      "type": "string",
      "enum": ["pending", "running", "completed", "failed", "abandoned"],
      "description": "Current status of this execution run."
    },
    "criteria_results": {
      "type": "array",
      "items": { "$ref": "#/definitions/CriterionResult" },
      "description": "Per-criterion pass/fail results."
    },
    "commits": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Git commit SHAs produced during this run."
    },
    "scope_violations": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Files modified outside declared scope. Empty if respected."
    },
    "agent_notes": {
      "type": "string",
      "description": "Filename of the agent's reasoning log markdown."
    },
    "token_usage": {
      "type": "integer",
      "description": "Total tokens consumed during this run."
    },
    "started_at": {
      "type": "string",
      "format": "date-time"
    },
    "finished_at": {
      "type": ["string", "null"],
      "format": "date-time",
      "description": "Null if still in progress."
    }
  },
  "definitions": {
    "CriterionResult": {
      "type": "object",
      "required": ["criterion_id", "verdict"],
      "additionalProperties": false,
      "properties": {
        "criterion_id": {
          "type": "string",
          "pattern": "^ac-[0-9a-f]{8}$"
        },
        "verdict": {
          "type": "string",
          "enum": ["pass", "fail", "skipped"]
        },
        "output": {
          "type": "string",
          "description": "Captured stdout/stderr for machine-verifiable criteria, or LLM verdict text for review criteria."
        }
      }
    }
  }
}
```

### Execution Record Example

```json
{
  "task_id": "at-a1b2c3d4",
  "run": 1,
  "status": "completed",
  "criteria_results": [
    { "criterion_id": "ac-d4e5f6a7", "verdict": "pass", "output": "Test passed in 1.2s" },
    { "criterion_id": "ac-1a2b3c4d", "verdict": "pass", "output": "47 tests passed, 0 failed" },
    { "criterion_id": "ac-8e9f0a1b", "verdict": "pass", "output": "Build succeeded, 0 warnings" },
    { "criterion_id": "ac-2c3d4e5f", "verdict": "pass", "output": "All architectural rules satisfied" },
    { "criterion_id": "ac-6a7b8c9d", "verdict": "pass", "output": "PASS: All error paths use Result.Failure. No exceptions thrown in new code." }
  ],
  "commits": ["a1b2c3d", "e4f5g6h"],
  "scope_violations": [],
  "agent_notes": "exec-at-a1b2c3d4-run1.md",
  "token_usage": 12450,
  "started_at": "2026-03-21T10:00:00Z",
  "finished_at": "2026-03-21T10:04:32Z"
}
```

---

## Validation Rules

### Ring 0 — Structural Validation

**Task Definition:**

| Rule | Check |
|---|---|
| R0-01 | JSON validates against AtomicTaskDefinition schema |
| R0-02 | `id` is unique across all task definitions |
| R0-03 | `parent` references an existing implementation document |
| R0-04 | `description` file exists and is a valid markdown file |
| R0-05 | All IDs in `blocked_by` reference existing task definitions |
| R0-06 | All IDs in `blocks` reference existing task definitions |
| R0-07 | **Dependency symmetry invariant:** for every task B in `blocks`, B.`blocked_by` contains this task's ID, and vice versa |
| R0-08 | Dependency graph is acyclic (no circular dependencies) |
| R0-09 | All `acceptance_criteria` IDs are unique within the task |
| R0-10 | Criteria of type `test`, `build`, `lint` have a `verify` field |
| R0-11 | Criteria of type `review` have a `rubric` field |
| R0-12 | `scope.files` contains at least one entry |
| R0-13 | `context_refs` is non-empty |
| R0-14 | No self-references in `blocked_by` or `blocks` |

**Task Description (Markdown):**

| Rule | Check |
|---|---|
| R0-20 | File starts with H1 matching pattern `# {at-id}: {title}` |
| R0-21 | Contains exactly five H2 sections: Objective, Context, Approach, Constraints, References |
| R0-22 | H2 sections appear in the required order |
| R0-23 | No H2 section is empty |
| R0-24 | H1 task-id matches the JSON definition's `id` |

**Execution Record:**

| Rule | Check |
|---|---|
| R0-30 | JSON validates against ExecutionRecord schema |
| R0-31 | `task_id` references an existing task definition |
| R0-32 | `run` is sequential (no gaps per task_id) |
| R0-33 | All `criterion_id` entries reference criteria in the task definition |
| R0-34 | No duplicate `criterion_id` within `criteria_results` |

### Ring 1 — Semantic Consistency

**R1-01: Coverage completeness**

```
Check: Do the atomic tasks fully cover their parent implementation doc?

Documents provided:
- Parent implementation description: {impl_content}
- All child atomic task descriptions: {task_descriptions}

Question: List every requirement, behavior, and deliverable described
in the parent implementation document. For each, determine whether at
least one atomic task addresses it. Report any item not covered.
```

**R1-02: Contradiction detection**

```
Check: Do any sibling atomic tasks make contradictory assumptions?

Documents provided:
- Sibling atomic task descriptions (same parent): {task_descriptions}

Question: Compare the Context, Approach, and Constraints sections
across all sibling tasks. Find any case where:
(a) two tasks modify the same method or class in incompatible ways,
(b) one task's Approach assumes something that another task's
    Constraints forbid, or
(c) two tasks make different assumptions about the same interface.

Report each contradiction with references to both tasks.
```

**R1-03: Scope coherence**

```
Check: Does the approach stay within the declared file scope?

Documents provided:
- Task definition scope.files: {scope_files}
- Task description Approach section: {approach}

Question: Parse every file, class, or namespace referenced in the
Approach section. Report any reference to a file that is not in the
declared scope.files list.
```

**R1-04: Dependency correctness**

```
Check: Are task dependencies correctly declared?

Documents provided:
- This task's description: {task_content}
- Descriptions of all tasks in blocked_by: {dependency_descriptions}

Question: Find any type, method, interface, or code artifact
referenced in this task's Context or Approach that:
(a) does not exist in the current codebase (as described), AND
(b) is not produced by any task listed in blocked_by.

Report each unresolved dependency.
```

### Ring 2 — Quality Rubric

**R2-01: Actionability**

```
Dimension: Could an agent execute this task without clarification?

Rubric:
- PASS if: The Approach section provides enough detail that an agent
  can implement each step using only the description and the files
  in scope. No ambiguities.
- FAIL if: Any step requires the agent to make a judgment call,
  explore the codebase, or guess at intent.

List any ambiguities found.
```

**R2-02: Scope boundedness**

```
Dimension: Is this task small enough for a single agent session?

Rubric:
- PASS if: The task requires 5 or fewer distinct code changes.
- FAIL if: More than 5 distinct changes needed, suggesting the
  task should be split.

Estimate the number of distinct changes and flag if over 5.
```

**R2-03: Approach specificity**

```
Dimension: Does every step name a concrete file, class, or method?

Rubric:
- PASS if: Every step in the Approach section references at least
  one specific file, class, method, or type.
- FAIL if: Any step is vague or architectural ("implement error
  handling", "add tests").

List any vague steps.
```

**R2-04: Constraint testability**

```
Dimension: Can each constraint be verified?

Rubric:
- PASS if: Each constraint can be checked by a machine (diff
  analysis, grep, test run) or by a targeted LLM code review.
- FAIL if: Any constraint is subjective ("code should be clean")
  or unverifiable.

Assess each constraint individually.
```

**R2-05: Criterion completeness**

```
Dimension: Do acceptance criteria cover all behavioral changes?

Rubric:
- PASS if: Every behavior described in the Approach section has a
  corresponding acceptance criterion.
- FAIL if: Any behavior is untested or unverified.

List any gaps.
```

---

## Generation Prompt: Creating Atomic Tasks from an Implementation Document

### System Prompt

```
You are an atomic task generator for the Document Decomposition System
(DDS). Your job is to decompose a validated implementation document
into a set of ordered atomic tasks.

For each atomic task, produce:
1. A JSON definition conforming to the AtomicTaskDefinition schema.
2. A markdown description conforming to the task description template.

Rules:
- Generate a fresh task ID and fresh acceptance criterion IDs using
  8 random hex chars each.
- Set parent to the implementation document's ID.
- Follow the implementation doc's Decomposition Notes:
  - Use the Suggested Task Boundaries as a starting point.
  - Respect the Ordering Rationale for blocked_by/blocks.
  - Follow the Decomposition Constraints.
- IMPORTANT: Maintain dependency symmetry. If task A blocks task B,
  then A.blocks must contain B's ID AND B.blocked_by must contain
  A's ID.
- scope.files must list EVERY file the agent may modify. Be
  exhaustive. The harness enforces this.
- scope.modules must be a subset of the parent impl doc's modules.
- Every task must have at least one acceptance criterion.
- Include a build criterion (type "build") for every task.
- Include a test criterion (type "test") for tasks that add or
  modify tests.
- Include a review criterion (type "review") for tasks where
  pattern adherence matters. The rubric must be specific enough
  for a binary pass/fail judgment.
- The Approach section in the markdown must be step-by-step with
  concrete file/class/method references. No vague steps.
- The Context section must front-load all knowledge the agent needs.
  The agent should NOT need to explore the codebase.
- context_refs must trace back to spec sections via the parent
  impl doc's spec_sections.
- Aim for 3-8 tasks. Each should be completable in a single agent
  session (≤5 distinct code changes).
- The ordered list of task IDs in the output should reflect the
  intended execution sequence (consistent with the dependency graph).

Output format:
For each atomic task, output:
1. The JSON definition in a ```json code block.
2. The full markdown description starting with the H1 heading.

Separate tasks with a horizontal rule (---).
Output tasks in execution order (respecting dependencies).
```

### User Prompt Template

```
Decompose the following validated implementation document into
atomic tasks.

Implementation JSON:
{impl_json}

Implementation Markdown:
{impl_markdown}

Parent Specification (relevant sections):
{spec_sections_content}

Codebase context (existing files, patterns, types):
{codebase_context}

Build/test commands for this project:
- Build: {build_command}
- Test: {test_command}
- Lint/Arch: {lint_command}
```

---

## File Organization

```
project-root/
└── tasks/
    ├── definitions/
    │   ├── at-7f3e2a19.json
    │   ├── at-b4c8d6e2.json
    │   ├── at-a1b2c3d4.json
    │   └── at-e9f1a3b5.json
    ├── descriptions/
    │   ├── at-7f3e2a19.md
    │   ├── at-b4c8d6e2.md
    │   ├── at-a1b2c3d4.md
    │   └── at-e9f1a3b5.md
    └── executions/
        ├── at-a1b2c3d4-run1.json
        └── at-a1b2c3d4-run1-notes.md
```
