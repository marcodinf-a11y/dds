# Specification Schema

> Part of the Document Decomposition System (DDS).
> Referenced by: [Validation Pipeline](validation-pipeline.md), [Agent Guide](agent-guide.md)

## Overview

A specification is the root document in the DDS hierarchy. It is primarily human-authored (with chatbot assistance) and serves as the source of truth from which all downstream documents are derived.

```
Specification  ← this level
  └── Implementation Document
        └── Atomic Task
```

A specification consists of two artifacts:

- **Specification Definition** (JSON) — structural metadata, relationships, status
- **Specification Description** (Markdown) — prose narrative organized into functional requirements

---

## ID Format

All specification IDs use the pattern `spec-[0-9a-f]{8}` — an 8-character random hex string prefixed with `spec-`.

Generate with: `openssl rand -hex 4` → e.g., `e8a2b4c6` → `spec-e8a2b4c6`

No central counter. No coordination between agents. Collision probability is negligible (1 in 4 billion).

---

## Artifact 1: Specification Definition (JSON)

### Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SpecificationDefinition",
  "type": "object",
  "required": ["id", "title", "description", "status", "version"],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^spec-[0-9a-f]{8}$",
      "description": "Unique identifier. Generated as 8 random hex characters with 'spec-' prefix."
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable title of the specification."
    },
    "description": {
      "type": "string",
      "pattern": "^spec-[0-9a-f]{8}\\.md$",
      "description": "Filename of the markdown specification document."
    },
    "implementation_docs": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^impl-[0-9a-f]{8}$"
      },
      "description": "Implementation documents derived from this spec. Empty when status is 'draft' or 'validated'. Populated when status is 'decomposed'."
    },
    "related_specs": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^spec-[0-9a-f]{8}$"
      },
      "description": "Other specifications that share terminology, cross-cutting concerns, or interface boundaries with this spec."
    },
    "status": {
      "type": "string",
      "enum": ["draft", "validated", "decomposed"],
      "description": "Lifecycle status."
    },
    "version": {
      "type": "integer",
      "minimum": 1,
      "description": "Incremented on each substantive revision. When version changes, all downstream implementation documents are invalidated and must be re-validated."
    }
  }
}
```

### Status Lifecycle

```
draft ──── Ring 0+1+2 pass ────► validated ──── decomposition done ────► decomposed
  ▲                                  │                                       │
  └──── validation fails ────────────┘                                       │
  └──── downstream issues ───────────────────────────────────────────────────┘
```

- **draft** — Authored but not yet validated. May have structural or semantic issues.
- **validated** — Passed all three validation rings. Ready for decomposition into implementation documents.
- **decomposed** — Implementation documents have been generated and themselves validated. The `implementation_docs` array is populated.

Backward transitions are permitted. A `decomposed` spec reverts to `draft` when its version increments.

### Example

```json
{
  "id": "spec-e8a2b4c6",
  "title": "Leakage Test Execution",
  "description": "spec-e8a2b4c6.md",
  "implementation_docs": ["impl-c9d2f4a1", "impl-a3b7e1f9"],
  "related_specs": ["spec-f1a9c3d7"],
  "status": "decomposed",
  "version": 2
}
```

---

## Artifact 2: Specification Description (Markdown)

### Template

The specification description is a markdown file named `{spec-id}.md`. It must contain exactly the following six H2 sections in order.

```markdown
# {spec-id}: {title}

## Overview

High-level description of what this specification covers. Written for
someone with no prior context. What system or subsystem is being
specified? What problem does it solve? Who are the users?

Two to four paragraphs. Establish the domain, the business need, and
the scope of what this specification addresses.

## Functional Requirements

The behaviors the system must exhibit. Organized by functional area
using H3 subheadings. Each requirement is a numbered entry using the
FR-XX identifier format.

### {Functional Area 1}

- **FR-01:** {requirement text}
- **FR-02:** {requirement text}

### {Functional Area 2}

- **FR-03:** {requirement text}
- **FR-04:** {requirement text}

Requirements must be:
- **Atomic:** One testable behavior per entry. No "and"/"or" joining
  distinct behaviors.
- **Unambiguous:** Use consistent terminology from the Glossary.
- **Testable:** A developer could write a pass/fail test from the
  requirement text alone.
- **Complete:** Cover happy paths, error paths, and edge cases.

## Non-Functional Requirements

Performance, reliability, security, and other quality attributes.

- **NFR-01:** {requirement text with measurable threshold}

Non-functional requirements must include concrete thresholds or
criteria, not vague aspirations ("must be fast", "should be secure").

## System Constraints

Technical boundaries that are not negotiable. Platform constraints,
protocol requirements, compatibility mandates, regulatory requirements.
These constrain all implementation decisions downstream.

Each constraint should state what is constrained and why (e.g.,
regulatory, hardware limitation, legacy compatibility).

## Glossary

Domain-specific terms used in this specification. Each entry gives
the term and its definition as used in this context.

- **{Term}:** {definition}

All terms that could be ambiguous or domain-specific must appear here.
The specification, implementation documents, and atomic tasks must all
use these terms consistently.

## Decomposition Guidance

High-level guidance for splitting this specification into
implementation documents. This section is consumed by the agent that
performs the spec-to-implementation decomposition.

Suggest natural boundaries along module, feature, or layer lines.
Identify which functional areas are independent enough to be separate
implementation documents and which are tightly coupled and should be
grouped.

For each suggested boundary, indicate:
- Which functional requirement groups it covers
- Which modules or projects it maps to
- Dependencies on other suggested boundaries
```

### Example

```markdown
# spec-e8a2b4c6: Leakage Test Execution

## Overview

This specification defines the leakage test execution subsystem of
the LTOS (Leakage Test Operating System) management application. The
subsystem is responsible for executing individual leakage tests on
connected measurement devices, monitoring test progress, handling
errors, and returning structured test results.

The primary users are the test execution engine (automated) and the
operator interface (manual trigger). The subsystem communicates with
physical measurement devices via a SOAP API provided by the device
firmware.

This specification covers single-test execution only. Batch test
execution, result persistence, and reporting are covered by separate
specifications.

## Functional Requirements

### Test Execution

- **FR-01:** The system shall execute a leakage test by sending a
  RunTest command to the connected device via SOAP with the provided
  test parameters.
- **FR-02:** The system shall poll the device for test status at a
  configurable interval until the test reaches a terminal state
  (Completed or Failed).
- **FR-03:** The system shall return a typed result indicating
  success with the test measurement data, or failure with an error
  description.

### Cancellation

- **FR-04:** The system shall support cancellation of an in-progress
  test via CancellationToken.
- **FR-05:** Upon cancellation, the system shall send an AbortTest
  command to the device and return a cancellation result.

### Error Handling

- **FR-06:** The system shall handle SOAP faults during test
  execution by returning a failure result with the fault message,
  without throwing exceptions to the caller.
- **FR-07:** The system shall handle device communication timeouts
  by returning a failure result with a timeout-specific message.
- **FR-08:** The system shall handle unexpected device states (e.g.,
  device disconnected mid-test) by returning a failure result with
  a descriptive message.

## Non-Functional Requirements

- **NFR-01:** Test status polling shall not consume more than 1% CPU
  on the host system during a single test execution.
- **NFR-02:** The time between test completion on the device and
  result availability to the caller shall not exceed 2x the polling
  interval.
- **NFR-03:** The system shall support concurrent test execution on
  up to 4 devices simultaneously without cross-contamination of
  results.

## System Constraints

- The device SOAP API is defined by the device firmware and cannot
  be modified. Operations: RunTest, GetTestStatus, GetTestResult,
  AbortTest.
- The target platform is .NET 8 on embedded Linux (TorizonOS).
- All inter-module communication must use the Result<T> pattern
  established in LTOS.Core — no exceptions for expected error
  conditions.
- The polling approach is mandated by the SOAP API; the device does
  not support push notifications or callbacks.

## Glossary

- **Test Cycle:** A single execution of a leakage test, from
  initiation through result retrieval.
- **Test Parameters:** Configuration values sent to the device,
  including test type, pressure setpoint, fill time, and measurement
  time.
- **Terminal State:** A test status that indicates the test has
  finished: either Completed (success) or Failed (device-reported
  failure).
- **Result<T>:** A discriminated union type in LTOS.Core that wraps
  either a success value of type T or a failure message string.
- **SOAP Fault:** An error response from the device SOAP API,
  containing a fault code and fault string.
- **Polling Interval:** The time between consecutive GetTestStatus
  calls, configurable via ServiceOptions.

## Decomposition Guidance

This specification should decompose into two implementation
documents along the following boundaries:

1. **Core Service Implementation** (FR-01 through FR-05, NFR-01,
   NFR-02) — Covers the LeakageTestService class in LTOS.Services,
   including the RunTest method, polling loop, cancellation support,
   and all SOAP interactions. Maps to the LTOS.Services module.
   Depends on the Result<T> type from LTOS.Core.

2. **Error Handling and Resilience** (FR-06 through FR-08, NFR-03)
   — Covers error classification, timeout handling, device
   disconnect detection, and concurrent execution isolation. Maps
   to LTOS.Services with possible shared types in LTOS.Core.
   Depends on boundary 1 for the base service structure.

Alternative: combine both into a single implementation document if
the error handling logic is tightly interleaved with the execution
flow rather than separable. The decomposition agent should assess
coupling before splitting.
```

---

## Validation Rules

### Ring 0 — Structural Validation

Deterministic checks. No LLM. Milliseconds.

| Rule | Check |
|---|---|
| R0-S01 | JSON validates against SpecificationDefinition schema |
| R0-S02 | `id` is unique across all specification definitions |
| R0-S03 | `description` file exists and is a valid markdown file |
| R0-S04 | All entries in `implementation_docs` reference existing implementation definitions |
| R0-S05 | All entries in `related_specs` reference existing specification definitions |
| R0-S06 | No self-reference in `related_specs` |
| R0-S07 | If `status` is `draft` or `validated`, `implementation_docs` must be empty |
| R0-S08 | If `status` is `decomposed`, `implementation_docs` must be non-empty |
| R0-S09 | Markdown starts with H1 matching pattern `# {spec-id}: {title}` |
| R0-S10 | Markdown contains required H2 sections in order: Overview, Functional Requirements, Non-Functional Requirements, System Constraints, Glossary, Decomposition Guidance |
| R0-S11 | No H2 section is empty |
| R0-S12 | Functional Requirements section contains at least one FR-XX entry |
| R0-S13 | All FR-XX and NFR-XX identifiers are unique within the document |
| R0-S14 | H1 spec-id matches the JSON definition's `id` |

### Ring 1 — Semantic Consistency

LLM-based checks with narrow prompts and structured JSON output.

**R1-S01: Internal terminology consistency**

```
Check: Does the specification use all Glossary terms consistently?

Documents provided:
- Specification markdown: {spec_content}

Question: For each term defined in the Glossary, find any instance in
the Functional Requirements or Non-Functional Requirements where:
(a) the term is used with a different meaning than its Glossary
    definition, or
(b) a synonym or alternate phrasing is used instead of the defined
    term.

Report each inconsistency as an issue.
```

**R1-S02: Requirement atomicity**

```
Check: Is each functional requirement a single testable behavior?

Documents provided:
- Specification markdown: {spec_content}

Question: For each FR-XX entry, determine whether it describes exactly
one testable behavior. Flag any requirement that:
(a) contains "and" or "or" joining two distinct behaviors,
(b) describes a workflow with multiple steps that should be separate
    requirements, or
(c) is too vague to write a single pass/fail test for.

Report each compound or vague requirement as an issue.
```

**R1-S03: Cross-spec consistency** (only when `related_specs` is non-empty)

```
Check: Are shared concepts consistent across related specifications?

Documents provided:
- This specification: {spec_content}
- Related specification(s): {related_spec_contents}

Question: Find any cases where:
(a) the same term is defined differently in the Glossaries of
    related specs,
(b) requirements in this spec contradict requirements in a related
    spec, or
(c) system constraints in this spec conflict with constraints in a
    related spec.

Report each inconsistency as an issue.
```

**R1-S04: Decomposition guidance coverage**

```
Check: Does the Decomposition Guidance address all functional areas?

Documents provided:
- Specification markdown: {spec_content}

Question: List every H3 subheading under Functional Requirements.
Then check whether the Decomposition Guidance section mentions or
accounts for each functional area. Report any functional area that
is not addressed by the decomposition guidance.
```

### Ring 2 — Quality Rubric

LLM-based rubric scoring. Pass/fail verdicts with evidence.

**R2-S01: Decomposition readiness**

```
Dimension: Is this specification structured well enough for automated
decomposition into implementation documents?

Document: {spec_content}

Rubric:
- PASS if: Functional requirements are grouped into clear functional
  areas via H3 headings, each area is cohesive and separable, and
  the Decomposition Guidance gives specific boundary suggestions
  with module mappings and dependency notes.
- FAIL if: Requirements are in a flat list without grouping,
  functional areas overlap significantly, or Decomposition Guidance
  is generic ("split by feature") without naming specific boundaries.
```

**R2-S02: Requirement precision**

```
Dimension: Are the requirements precise enough to produce testable
acceptance criteria downstream?

Document: {spec_content}

Rubric:
- For each FR-XX and NFR-XX, assess whether a developer could write
  a pass/fail test from the requirement text alone.
- PASS if: All requirements specify observable behavior, measurable
  thresholds (for NFRs), and unambiguous conditions.
- FAIL if: Any requirement uses vague language ("should handle errors
  gracefully", "must be fast", "should be user-friendly") without
  defining what that means concretely.

Assess each requirement individually and report per-requirement
findings.
```

**R2-S03: Completeness**

```
Dimension: Does the specification cover enough ground to build from?

Document: {spec_content}

Rubric:
- PASS if: The spec addresses the happy path, all identified error
  conditions, edge cases, and boundary behaviors for each functional
  area.
- FAIL if: Any functional area only describes the happy path, or if
  error handling is mentioned generically without specifying which
  errors and what happens for each.

For each functional area (H3 heading), assess whether error paths
and edge cases are covered.
```

---

## Generation Prompt: Creating a Specification

Use this prompt when generating a specification from a human's description or requirements notes. The prompt produces both the JSON definition and the markdown description.

### System Prompt

```
You are a specification author for the Document Decomposition System
(DDS). Your job is to produce a complete, validated specification
from the provided input material.

You must produce two artifacts:
1. A JSON definition file conforming to the SpecificationDefinition
   schema.
2. A markdown description file conforming to the specification
   template.

Rules:
- Generate a fresh spec ID using 8 random hex characters.
- Set status to "draft" and version to 1.
- Leave implementation_docs and related_specs as empty arrays.
- The markdown MUST contain exactly six H2 sections in this order:
  Overview, Functional Requirements, Non-Functional Requirements,
  System Constraints, Glossary, Decomposition Guidance.
- Every functional requirement must be atomic (one testable behavior),
  unambiguous, and use terms from the Glossary.
- Group functional requirements under H3 headings by functional area.
- Use the identifier formats FR-XX for functional requirements and
  NFR-XX for non-functional requirements. Number sequentially.
- The Glossary must define every domain-specific term used in the
  requirements.
- The Decomposition Guidance must suggest concrete implementation
  document boundaries with module mappings and dependency notes.
- Do NOT invent requirements beyond what the input material implies.
  If the input is incomplete, note gaps explicitly in the Overview
  and ask the user to fill them.

Output format:
First output the JSON definition in a ```json code block.
Then output the full markdown description starting with the H1
heading.
```

### User Prompt Template

```
Create a DDS specification from the following input material.

Input:
{user_provided_description_or_notes}

Additional context (if any):
- Project: {project_name}
- Target platform: {platform}
- Related specifications: {related_spec_ids_or_none}
```

---

## Cross-Level Invariants (Spec ↔ Implementation Document)

| Rule | Check |
|---|---|
| CL-S01 | Every impl doc's `spec_sections` entries reference a spec whose `implementation_docs` list contains that impl doc's ID (bidirectional consistency) |
| CL-S02 | Every spec with `status: decomposed` has at least one implementation document |
| CL-S03 | The union of all `spec_sections` across a spec's implementation docs covers every functional area (H3 heading) in the spec |
| CL-S04 | When a spec's `version` increments, all downstream impl docs revert to `draft` status |

---

## File Organization

```
project-root/
└── specs/
    ├── definitions/
    │   └── spec-e8a2b4c6.json
    └── descriptions/
        └── spec-e8a2b4c6.md
```
