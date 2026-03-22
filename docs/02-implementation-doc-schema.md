# Implementation Document Schema

> Part of the Document Decomposition System (DDS).
> Referenced by: [Validation Pipeline](validation-pipeline.md), [Agent Guide](agent-guide.md)

## Overview

An implementation document describes a coherent unit of functionality to be built. It is derived from one or more specification sections and decomposes into a set of ordered atomic tasks.

```
Specification
  └── Implementation Document  ← this level
        └── Atomic Task
```

An implementation document answers: "What needs to be built, and what are the boundaries?" It does NOT prescribe step-by-step implementation details — that responsibility belongs to the atomic tasks below.

An implementation document consists of two artifacts:

- **Implementation Definition** (JSON) — structural metadata, relationships, status
- **Implementation Description** (Markdown) — prose narrative used by the decomposition agent to produce atomic tasks

---

## ID Format

Pattern: `impl-[0-9a-f]{8}` — 8 random hex characters prefixed with `impl-`.

Generate with: `openssl rand -hex 4` → e.g., `c9d2f4a1` → `impl-c9d2f4a1`

---

## Artifact 1: Implementation Definition (JSON)

### Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ImplementationDefinition",
  "type": "object",
  "required": ["id", "spec_sections", "description", "modules", "status"],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^impl-[0-9a-f]{8}$",
      "description": "Unique identifier. Generated as 8 random hex characters with 'impl-' prefix."
    },
    "spec_sections": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "description": "Spec sections this implementation document addresses. Format: spec-XXXXXXXX#heading-slug (standard markdown heading anchor, e.g., spec-e8a2b4c6#test-execution). An implementation doc can draw from multiple spec sections and even multiple specs."
    },
    "description": {
      "type": "string",
      "pattern": "^impl-[0-9a-f]{8}\\.md$",
      "description": "Filename of the markdown description document."
    },
    "atomic_tasks": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^at-[0-9a-f]{8}$"
      },
      "description": "Ordered list of atomic task IDs this document decomposes into. Order reflects intended execution sequence. Empty when status is 'draft' or 'validated'. Populated when status is 'decomposed'."
    },
    "modules": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "description": "Logical modules this implementation operates within. All child atomic tasks must have their scope.modules be a subset of this list."
    },
    "dependencies": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^impl-[0-9a-f]{8}$"
      },
      "description": "Other implementation documents that must be completed before this one can begin. These represent cross-feature prerequisites, not task-level ordering."
    },
    "status": {
      "type": "string",
      "enum": ["draft", "validated", "decomposed"],
      "description": "Lifecycle status. Same semantics as specifications."
    }
  }
}
```

### Status Lifecycle

```
draft ──── Ring 0+1+2 pass ────► validated ──── decomposition + validation ────► decomposed
  ▲                                  │                                              │
  └──── validation failure ──────────┘                                              │
  └──── decomposition issues ───────────────────────────────────────────────────────┘
```

- **draft** — Authored but not yet validated. May have structural or semantic issues.
- **validated** — Passed all three validation rings. Ready for decomposition into atomic tasks.
- **decomposed** — Atomic tasks have been generated and themselves validated. The `atomic_tasks` array is populated.

Backward transitions are permitted. A `decomposed` document that fails re-validation (e.g., after a spec change) reverts to `draft`.

### Example

```json
{
  "id": "impl-c9d2f4a1",
  "spec_sections": [
    "spec-e8a2b4c6#test-execution",
    "spec-e8a2b4c6#error-handling"
  ],
  "description": "impl-c9d2f4a1.md",
  "atomic_tasks": [
    "at-7f3e2a19",
    "at-b4c8d6e2",
    "at-a1b2c3d4",
    "at-e9f1a3b5"
  ],
  "modules": ["LTOS.Services"],
  "dependencies": ["impl-a3b7e1f9"],
  "status": "decomposed"
}
```

---

## Artifact 2: Implementation Description (Markdown)

### Template

The implementation description is a markdown file named `{impl-id}.md`. It must contain exactly the following seven H2 sections in order. The Decomposition Notes section has three required H3 subsections.

```markdown
# {impl-id}: {title}

## Objective

What capability does the system gain when this implementation is
complete? One to three sentences. This should be understandable by
someone who has not read the spec — it is the "elevator pitch" for
this unit of work.

## Background

Architectural context that a decomposition agent needs to produce
good atomic tasks. Describe the relevant parts of the existing
codebase: key classes, established patterns, conventions, and how
this new functionality fits into the current architecture.

Reference specific namespaces, projects, and files. The decomposition
agent will use this section to determine file scope and module
boundaries for each atomic task.

This section should provide enough context that the decomposition
agent does not need to explore the codebase. Front-load every piece
of knowledge a human developer would have from working in this area.

## Requirements

The specific behaviors being implemented, traced to spec sections.
Each requirement should be a concrete, testable statement. Use the
format:

- **REQ-XX:** {requirement text} (from spec-XXXXXXXX#heading-slug)

Requirements must be exhaustive relative to the referenced spec
sections. Every behavior described in those spec sections must appear
here as a requirement, either directly or by explicit exclusion in
the Out of Scope section.

## Design Decisions

Key technical choices made at this level that constrain the atomic
tasks below. These are decisions the decomposition agent must NOT
re-make. Each decision should state:
- What was decided
- Why (rationale)
- What alternatives were rejected and why

This section prevents the decomposition agent from making
architectural decisions that should be made at this level.

## Out of Scope

Explicit boundaries. What this implementation document does NOT
cover, even if the spec sections reference it. Each exclusion should
state:
- What is excluded
- Why (deferred to another impl doc, not yet specified, not needed
  for MVP, etc.)
- Where it will be handled (if known)

Everything in the referenced spec sections must appear either in
Requirements or in Out of Scope. Nothing may be silently dropped.

## Dependencies

Other implementation documents or external prerequisites that must
be in place before this implementation can begin. For each
dependency, state what it provides that this implementation needs.

- impl-XXXXXXXX — {what it provides}
- External: {description of external prerequisite}

## Decomposition Notes

Guidance for the agent that will break this implementation into
atomic tasks.

### Suggested Task Boundaries

A list of logical units this implementation should be split into.
Each entry names a coherent piece of work and the files it would
touch. This is a starting point, not a rigid prescription — the
decomposition agent may adjust boundaries based on its analysis.

- {task name} — {files involved} — {brief description}

### Ordering Rationale

Explain why certain pieces must come before others. Call out:
- Type dependencies (Result<T> must exist before methods return it)
- Interface dependencies (mapping methods must exist before the
  service calls them)
- Test dependencies (what must be implemented before tests can
  exercise it)
- Any other sequencing constraints

### Decomposition Constraints

Rules the decomposition agent must follow when creating atomic tasks:
- Maximum number of files per task
- Patterns that must not be split across tasks
- Where test code should live (same task or separate)
- Naming conventions for task descriptions
```

### Example

```markdown
# impl-c9d2f4a1: Leakage Test Execution Service

## Objective

Add the ability to execute a single leakage test cycle through the
LeakageTestService, including invoking the test on the device via
SOAP, polling for completion, and returning a typed result. This
enables the core test execution workflow that the UI and automation
layers will build upon.

## Background

The LTOS.Services project contains service classes that wrap
ILTOSClient (the SOAP client interface) and expose domain-level
operations. LeakageTestService already exists in
src/LTOS.Services/LeakageTestService.cs with methods for device
discovery (DiscoverDevices) and connection management
(ConnectToDevice, DisconnectFromDevice).

All service methods follow a consistent pattern: accept a typed
parameter object, call one or more SOAP operations on _client
(an injected ILTOSClient), handle SOAP faults via try/catch, and
return a Result<T> wrapping either the success payload or a failure
message. The Result<T> type was introduced in a prior implementation
(impl-a3b7e1f9) and lives in LTOS.Core.

Unit tests live in tests/LTOS.Services.Tests/ and use xUnit with
Moq to mock ILTOSClient. The test setup pattern creates a
MockRepository, configures ILTOSClient method returns, and injects
the mock into the service via constructor.

ServiceOptions is an options class injected via IOptions<ServiceOptions>
that holds configurable parameters like polling intervals and timeouts.

## Requirements

- **REQ-01:** The system shall execute a leakage test by calling the SOAP RunTest endpoint with the provided test parameters. (from spec-e8a2b4c6#test-execution)
- **REQ-02:** The system shall poll the device for test status at a configurable interval until the test completes or fails. (from spec-e8a2b4c6#test-execution)
- **REQ-03:** The system shall return a typed Result<TestResult> indicating success with the test data, or failure with an error message. (from spec-e8a2b4c6#test-execution)
- **REQ-04:** The system shall support cancellation of an in-progress test via CancellationToken. (from spec-e8a2b4c6#test-execution)
- **REQ-05:** The system shall handle SOAP faults during test execution by returning Result.Failure with the fault message, without throwing exceptions. (from spec-e8a2b4c6#error-handling)
- **REQ-06:** The system shall handle device communication timeouts by returning Result.Failure with a timeout-specific message. (from spec-e8a2b4c6#error-handling)

## Design Decisions

- **Result<T> over exceptions:** All error paths return Result.Failure rather than throwing. This was established in impl-a3b7e1f9 and must be continued for consistency. Exceptions are reserved for truly unexpected failures (e.g., null reference bugs), not for expected error conditions like SOAP faults or timeouts. *Alternative rejected:* exception-based error handling — inconsistent with existing service pattern.
- **Polling over callbacks:** The device SOAP API does not support push notifications. GetTestStatus is polled in a loop. The polling interval is configurable via ServiceOptions to allow tuning per-device and in tests. *Alternative rejected:* event-based callbacks — not supported by device API.
- **Single-method public API:** Only RunTest is added as a public method. Internal helpers (polling loop, status mapping) are private. This keeps the service's public surface minimal. *Alternative rejected:* exposing StartTest/WaitForResult as separate public methods — unnecessarily complex for callers.

## Out of Scope

- **Batch test execution** (running multiple tests in sequence) — deferred to a separate implementation doc, as the spec treats it as a distinct workflow (spec-e8a2b4c6#batch-test-execution).
- **Test result persistence** — storing results to a database or file is handled by the result export module, not the execution service.
- **UI integration** — the ViewModel that calls RunTest is a separate implementation doc.

## Dependencies

- impl-a3b7e1f9 — Provides the Result<T> type in LTOS.Core and establishes the error handling pattern used by all service methods.
- External: ILTOSClient SOAP interface must be defined with RunTest, GetTestStatus, GetTestResult, and AbortTest operations.

## Decomposition Notes

### Suggested Task Boundaries

- SOAP request/response mapping — src/LTOS.Services/Mapping/TestMappingExtensions.cs — ToSoapRequest() and ToTestResult() extension methods for converting between domain types and SOAP types
- RunTest service method — src/LTOS.Services/LeakageTestService.cs — The main public method with polling loop, cancellation support, and error handling
- Unit tests for mapping — tests/LTOS.Services.Tests/Mapping/TestMappingExtensionsTests.cs — Tests for all mapping conversions
- Unit tests for RunTest — tests/LTOS.Services.Tests/LeakageTestServiceTests.cs — Tests for success, failure, timeout, and cancellation paths

### Ordering Rationale

The mapping methods must exist before RunTest can be implemented,
because RunTest calls ToSoapRequest and ToTestResult. Tests for
mapping should come before the RunTest tests, because if mapping
is broken the RunTest tests will fail for the wrong reasons.

Dependency chain: Mapping methods → Mapping tests → RunTest → RunTest tests

### Decomposition Constraints

- Each atomic task should touch no more than 3 files (production code + its test file + possibly a shared type file).
- Mapping methods and service logic must be separate tasks — they touch different files and have different testing strategies.
- Test code for mapping methods should be in the same task as the mapping methods (small scope).
- Test code for RunTest should be a separate task (large scope with many test cases).
```

---

## Validation Rules

### Ring 0 — Structural Validation

Deterministic checks. No LLM. Milliseconds.

**Implementation Definition:**

| Rule | Check |
|---|---|
| R0-I40 | JSON validates against ImplementationDefinition schema |
| R0-I41 | `id` is unique across all implementation definitions |
| R0-I42 | `description` file exists and is a valid markdown file |
| R0-I43 | All entries in `spec_sections` follow the format `spec-XXXXXXXX#heading-slug` where heading-slug is a valid markdown heading anchor (lowercase, hyphens, no special chars) |
| R0-I44 | All entries in `atomic_tasks` reference existing atomic task definitions |
| R0-I45 | All entries in `dependencies` reference existing implementation definitions |
| R0-I46 | No self-references in `dependencies` |
| R0-I47 | Dependency graph across implementation documents is acyclic |
| R0-I48 | If `status` is `draft` or `validated`, `atomic_tasks` must be empty |
| R0-I49 | If `status` is `decomposed`, `atomic_tasks` must be non-empty |
| R0-I50 | **Parent consistency invariant:** every task in `atomic_tasks` has its `parent` field set to this document's `id` |
| R0-I51 | **Module containment invariant:** every task in `atomic_tasks` has `scope.modules` that is a subset of this document's `modules` |

**Implementation Description (Markdown):**

| Rule | Check |
|---|---|
| R0-I60 | File starts with H1 heading matching pattern `# {impl-id}: {title}` |
| R0-I61 | Contains exactly seven H2 sections: Objective, Background, Requirements, Design Decisions, Out of Scope, Dependencies, Decomposition Notes |
| R0-I62 | H2 sections appear in the required order |
| R0-I63 | No H2 section is empty |
| R0-I64 | H1 impl-id matches the JSON definition's `id` |
| R0-I65 | Decomposition Notes contains the required H3 subsections: Suggested Task Boundaries, Ordering Rationale, Decomposition Constraints |
| R0-I66 | Requirements section contains at least one REQ-XX entry |
| R0-I67 | Each REQ-XX entry includes a spec section reference |

### Ring 1 — Semantic Consistency

LLM-based checks with narrow prompts and structured JSON output.

**R1-I10: Spec coverage**

```
Check: Does the implementation document cover all requirements from
its referenced spec sections?

Documents provided:
- Spec sections: {spec_section_contents}
- Implementation description: {impl_content}

Question: For each FR-XX or NFR-XX in the provided spec sections,
determine whether it is:
(a) addressed by a REQ-XX in the implementation document's
    Requirements section, or
(b) explicitly excluded in the Out of Scope section.

Report any spec requirement that is neither addressed nor excluded.
```

**R1-I11: Out of scope consistency**

```
Check: Are all spec items accounted for — either in Requirements or
Out of Scope?

Documents provided:
- Spec sections: {spec_section_contents}
- Implementation Requirements section: {impl_requirements}
- Implementation Out of Scope section: {impl_out_of_scope}

Question: Find any requirement or behavior from the spec sections
that appears in neither the Requirements section nor the Out of Scope
section. These are silently dropped items.

Report each silently dropped item as an issue.
```

**R1-I12: Design decision coherence**

```
Check: Do design decisions align with established patterns?

Documents provided:
- Implementation Design Decisions: {design_decisions}
- Implementation Background: {background}

Question: For each design decision, check whether it contradicts
any pattern, convention, or architectural approach described in the
Background section. Report contradictions.
```

**R1-I13: Dependency completeness**

```
Check: Are all prerequisites listed as dependencies?

Documents provided:
- Implementation Background: {background}
- Implementation Requirements: {requirements}
- Implementation Dependencies: {dependencies}

Question: Find any external system, library, type, interface, or
other implementation document mentioned in Background or implied by
Requirements that is not listed in the Dependencies section. Report
each missing dependency.
```

**R1-I14: Decomposition coverage** (only when status is `decomposed`)

```
Check: Do the atomic tasks fully cover the implementation requirements?

Documents provided:
- Implementation Requirements: {requirements}
- Atomic task descriptions: {task_descriptions}

Question: For each REQ-XX in the implementation document, determine
whether at least one atomic task addresses it. Report any requirement
not covered by any task.
```

**R1-I15: Cross-implementation contradiction**

```
Check: Are design decisions consistent across sibling implementation
docs?

Documents provided:
- This document's Design Decisions: {this_design_decisions}
- Sibling documents' Design Decisions: {sibling_design_decisions}

Question: Find any design decision in this document that contradicts
a design decision in a sibling implementation document (one that
shares at least one spec_sections entry). Report each contradiction
with references to both documents.
```

### Ring 2 — Quality Rubric

LLM-based rubric scoring. Pass/fail verdicts with evidence.

**R2-I10: Decomposability**

```
Dimension: Can this implementation document be broken into 3-8 atomic
tasks?

Document: {impl_content}

Rubric:
- PASS if: The Suggested Task Boundaries section identifies 3-8
  distinct, coherent units of work with clear file boundaries.
- FAIL if: Fewer than 3 suggests the doc is too granular and should
  be an atomic task or merged with a sibling. More than 8 suggests
  it should be split into multiple implementation docs.

Estimate the likely task count and flag if outside the 3-8 range.
```

**R2-I11: Requirement testability**

```
Dimension: Is each REQ-XX entry concrete enough to write an
acceptance criterion for?

Document: {impl_content}

Rubric:
- For each REQ-XX, assess whether you could write a specific test
  or check that produces a binary pass/fail result.
- PASS if: All requirements specify observable behavior with clear
  conditions.
- FAIL if: Any requirement is vague ("handle errors appropriately"),
  unmeasurable, or would require subjective judgment to verify.

Assess each requirement individually.
```

**R2-I12: Background sufficiency**

```
Dimension: Does the Background section provide enough context for a
decomposition agent to determine file boundaries and module structure
without exploring the codebase?

Document: {impl_content}

Rubric:
- PASS if: Background names specific files, classes, namespaces,
  and patterns. A decomposition agent could determine scope.files
  for each task without reading the actual source code.
- FAIL if: Background uses vague references ("the service layer",
  "existing patterns") without naming concrete files and classes.

List any areas where an agent would need to guess or explore.
```

**R2-I13: Design decision completeness**

```
Dimension: Are there architectural choices implied by the Requirements
that are NOT explicitly stated in Design Decisions?

Document: {impl_content}

Rubric:
- PASS if: Every choice that would affect how atomic tasks are
  implemented is explicitly decided.
- FAIL if: A decomposition agent would need to make architectural
  decisions on its own (e.g., which pattern to use for error handling,
  whether to use async/await, how to structure the polling loop).

List any implicit decisions the decomposition agent would face.
```

**R2-I14: Boundary clarity**

```
Dimension: Are the boundaries of this implementation document clear
enough that two different people would agree on what is and is not
included?

Document: {impl_content}

Rubric:
- PASS if: Requirements and Out of Scope together create an
  unambiguous boundary.
- FAIL if: Any behavior could reasonably be argued to be either
  in scope or out of scope.

List any ambiguous boundary items.
```

**R2-I15: Decomposition notes quality**

```
Dimension: Are the Decomposition Notes specific and actionable?

Document: {impl_content}

Rubric:
- PASS if: Suggested Task Boundaries cover all REQ-XX entries,
  Ordering Rationale is specific about which tasks depend on which
  and why, and Decomposition Constraints are concrete and verifiable.
- FAIL if: Task boundaries are vague, ordering rationale is generic,
  or constraints are aspirational rather than enforceable.

Assess each subsection separately.
```

---

## Generation Prompt: Creating Implementation Documents from a Specification

Use this prompt when decomposing a validated specification into implementation documents.

### System Prompt

```
You are an implementation document generator for the Document
Decomposition System (DDS). Your job is to decompose a validated
specification into one or more implementation documents.

For each implementation document, you must produce:
1. A JSON definition file conforming to the ImplementationDefinition
   schema.
2. A markdown description file conforming to the implementation
   document template.

Rules:
- Generate a fresh impl ID for each document using 8 random hex chars.
- Set status to "draft".
- Leave atomic_tasks as an empty array.
- The spec_sections field must reference specific sections of the
  parent spec using the format spec-XXXXXXXX#heading-slug.
- The modules field must list the logical modules this implementation
  touches.
- The markdown MUST contain exactly seven H2 sections in this order:
  Objective, Background, Requirements, Design Decisions, Out of Scope,
  Dependencies, Decomposition Notes.
- Decomposition Notes MUST contain three H3 subsections: Suggested
  Task Boundaries, Ordering Rationale, Decomposition Constraints.
- Every REQ-XX must trace to a specific spec FR-XX or NFR-XX with
  the format "(from spec-XXXXXXXX#heading-slug)".
- Every spec requirement in the referenced sections must appear
  either in Requirements or in Out of Scope. NOTHING may be silently
  dropped.
- Design Decisions must cover every architectural choice that would
  constrain the atomic tasks. State what was decided, why, and what
  was rejected.
- The Background section must reference specific files, classes,
  namespaces, and patterns. Be concrete enough that a downstream
  agent can determine file scopes without codebase exploration.
- If the spec's Decomposition Guidance suggests boundaries, follow
  them unless you have a concrete reason to deviate (state the reason).
- Aim for 3-8 suggested task boundaries per implementation document.
  If you need more, consider splitting into multiple implementation
  documents.

Output format:
For each implementation document, output:
1. The JSON definition in a ```json code block.
2. The full markdown description starting with the H1 heading.

Separate multiple implementation documents with a horizontal rule
(---).
```

### User Prompt Template

```
Decompose the following validated specification into implementation
documents.

Specification JSON:
{spec_json}

Specification Markdown:
{spec_markdown}

Existing implementation documents (if re-decomposing):
{existing_impl_docs_or_none}

Codebase context (key files and patterns):
{codebase_context_or_none}
```

---

## Cross-Level Invariants (Implementation Document ↔ Atomic Task)

| Rule | Check |
|---|---|
| CL-T01 | Every atomic task's `parent` field references an impl doc that lists that task in its `atomic_tasks` array (bidirectional consistency) |
| CL-T02 | Every impl doc with `status: decomposed` has at least one atomic task |
| CL-T03 | Every module in the impl doc's `modules` list appears in at least one child task's `scope.modules`, and every child task's `scope.modules` is a subset of the impl doc's `modules` (full coverage without boundary violations) |
| CL-T04 | The union of all `context_refs` across an impl doc's atomic tasks covers all entries in the impl doc's `spec_sections` (full traceability) |
| CL-T05 | Dependency ordering between impl docs is consistent with the `blocked_by`/`blocks` graph of their atomic tasks |

---

## File Organization

```
project-root/
└── implementation/
    ├── definitions/
    │   ├── impl-c9d2f4a1.json
    │   └── impl-a3b7e1f9.json
    └── descriptions/
        ├── impl-c9d2f4a1.md
        └── impl-a3b7e1f9.md
```
