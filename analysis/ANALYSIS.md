# DDS Self-Compliance Analysis

> **Date:** 2026-03-22
> **Question:** Should the 5 DDS reference documents in `original_documents/` be transformed to follow the DDS structure they themselves define?
> **Method:** 7-agent analysis team (structural, semantic, feasibility, 2 devil's advocates, alternatives, final synthesis)
> **Conclusion (revised):** Full DDS transformation IS warranted. Fix 5 defects first, then bootstrap. See Part 9.

---

## Context for a Zero-Context Agent

The **Document Decomposition System (DDS)** is defined by 5 documents in `original_documents/`:

| File | Purpose |
|---|---|
| `01-spec-schema.md` | Defines the Specification level (JSON schema, Markdown template, validation rules) |
| `02-implementation-doc-schema.md` | Defines the Implementation Document level |
| `03-atomic-task-schema.md` | Defines the Atomic Task level |
| `04-validation-pipeline.md` | Defines the validation machinery (3 rings, refinement loop, escalation, orchestration) |
| `05-agent-guide.md` | Operational guide for running DDS with Claude Code |

DDS is a pipeline: **Specification** (human-authored) -> **Implementation Document** (auto-generated) -> **Atomic Task** (agent-executable). Each level has paired JSON definition + Markdown description artifacts, validated through 3 rings (Ring 0: structural, Ring 1: semantic, Ring 2: quality).

The core question: these 5 documents describe DDS but do NOT follow DDS structure. Should they?

---

## Part 1: Structural Compliance — How Far Off Are They?

Every document fails nearly all Ring 0 rules when assessed against any DDS artifact type.

| Document | Best-Fit Artifact Type | Ring 0 Pass Rate | Key Failures |
|---|---|---|---|
| 01-spec-schema.md | Specification | ~1/14 | No JSON definition, no FR-XX, missing 5 of 6 required H2 sections |
| 02-implementation-doc-schema.md | Implementation Document | ~1/20 | No JSON definition, missing all 7 required H2 sections |
| 03-atomic-task-schema.md | Atomic Task | ~1/19 | No JSON definition, missing all 5 required H2 sections |
| 04-validation-pipeline.md | Specification | ~1/14 | No JSON definition, no FR-XX, missing 5 of 6 required H2 sections |
| 05-agent-guide.md | Implementation Document | ~1/20 | No JSON definition, missing all 7 required H2 sections |

**Systemic gaps:**
- No document has a companion JSON definition file
- No document uses `{id}: {title}` H1 format
- No document has FR-XX, NFR-XX, or REQ-XX identifiers
- No document has a Glossary section
- All use domain-specific H2 headings (Validation Rules, Generation Prompt, File Organization, etc.) instead of DDS-mandated sections

---

## Part 2: Arguments FOR Transformation

### The credibility argument
If DDS claims structured documents are better, but its own documents are unstructured, it undermines the system's premise. "Would you trust a code formatter whose source is unformatted?"

### Concrete quality issues DDS would catch
- **Untestable statements:** "Must be fast," "should handle errors gracefully" equivalents exist in prose form (e.g., convergence threshold is "tunable" with no mechanism specified)
- **Duplicated invariants:** CL-S01-S04 appear in both doc 01 and doc 04. CL-T01-T05 appear in both doc 02 and doc 04. No consistency enforcement.
- **Missing error paths:** What if Ring 0 fix introduces a new Ring 0 failure? What if `on_spec_change()` is called on a spec with no impl docs yet?
- **No automatic cross-document consistency checking**

### Agent consumption
DDS was designed for agent consumption. The current freeform structure forces agents to parse ad-hoc formats. DDS structure would give agents predictable section locations.

### These documents ARE specifications
They contain JSON schemas, enumerated rules with IDs, algorithmic pseudocode, and cross-document invariants. They define what agents must do. That is a specification.

---

## Part 3: Arguments AGAINST Transformation

### Purpose mismatch
DDS is designed for decomposing *software features* into *coding tasks*. These documents are *process documentation* — their "output" is correct agent/human behavior, not deployed code. There is no `scope.files` for understanding an Overview section. There is no `verify` shell command for comprehension.

### Content doesn't fit any DDS section
Critical content has no home in the DDS template:
- Generation prompts (system + user prompt templates)
- Full JSON schemas (60+ line formal definitions)
- Algorithmic pseudocode (`refine()`, `converged()`, `run_pipeline()`)
- Troubleshooting guide
- Design rationale
- Hook configurations
- Worked examples (the LTOS leakage test system)

### Self-reference complication
The DDS spec would define validation rules. The validation pipeline would validate the DDS spec using those same rules. The document is both the object validated and the authority defining validation. This is benign in theory (like a compiler bootstrapping itself) but adds friction.

### Double maintenance burden
Every prose change risks incrementing the spec version, which cascades: all downstream impl docs revert to `draft`, all atomic tasks become stale. A typo fix triggers a full pipeline re-run across all self-referential artifacts.

### Readability destruction
The documents' current organization follows the logic of their subject matter. DDS structure reorganizes by template convention. The refinement loop algorithm would be fragmented across FR entries, losing its explanatory flow.

---

## Part 4: The Final Devil's Advocate Synthesis

### What all agents missed

**The audience question.** Three consumers exist:
1. The human author (current structure is optimal — they wrote it this way)
2. Claude Code instances (the formal parts — schemas, rules, prompts — are already structured; prose is context-setting loaded selectively via skills)
3. Hypothetical future contributors (this is a single-author project per git history; optimizing for hypothetical collaborators is premature)

**The version control blind spot.** These documents live in git. Git already provides change tracking, diff-based review, and blame. DDS's `version` field and downstream invalidation duplicates what git branches and CI do for code.

**The actual bug count.** The real finding is not a structural deficiency — it is **5 concrete defects** in the documents that all the structural debate obscured.

### The real question
Not "should we restructure?" but **"are these documents good enough to build a working system from, and if not, what specifically needs fixing?"**

---

## Part 5: Concrete Defects Found

These are actionable bugs, not structural complaints.

### Defect 1: CL-T03 equality constraint may be impossible to satisfy
**Location:** `02-implementation-doc-schema.md` (CL-T03) and `04-validation-pipeline.md` (CL-T03)
**Problem:** CL-T03 states the union of all `scope.modules` across an impl doc's atomic tasks must **equal** the impl doc's `modules`. But an impl doc might declare a module (e.g., `LTOS.Core`) as an organizational/dependency target without any task directly modifying files in it. The equality constraint would fail. R0-51 already enforces subset (each task's modules must be a subset of parent's modules). The reverse — every parent module covered by at least one task — is the useful check, but **strict equality is too strong**.
**Severity:** High — would cause false validation failures.
**Fix:** Change "equals" to "every module in the impl doc's `modules` list appears in at least one child task's `scope.modules`" (coverage, not equality).

### Defect 2: Convergence detection variable scope bug
**Location:** `04-validation-pipeline.md`, `refine()` function (~lines 126-161)
**Problem:** `previous_issues` is a single variable shared across Ring 1 and Ring 2 failure paths. If iteration N fails Ring 2 (setting `previous_issues` to Ring 2 issues), then the fix introduces a Ring 1 failure in iteration N+1, the convergence check compares Ring 1 issues against Ring 2 issues from the previous iteration. These have different rule IDs and references, so overlap will be ~0%, effectively disabling convergence detection across ring transitions.
**Severity:** Medium — could cause premature escalation or missed convergence.
**Fix:** Scope `previous_issues` per ring, or reset it when the failing ring changes between iterations.

### Defect 3: Re-decomposition discards all existing work
**Location:** `04-validation-pipeline.md`, `on_spec_change()` (~lines 399-412)
**Problem:** `on_spec_change()` calls `run_pipeline(spec_id)`, which calls `generate_impl_docs(spec)` — generating entirely new impl docs. All existing atomic tasks and execution records become orphaned. The generation prompt in doc 02 has a parameter `"Existing implementation documents (if re-decomposing)"` suggesting incremental re-decomposition was intended, but the pipeline orchestration ignores it.
**Severity:** High — a minor spec edit discards completed implementation work with no warning.
**Fix:** Either (a) document that re-decomposition is destructive and requires explicit confirmation, or (b) pass existing impl docs to the generation prompt and implement a merge/diff mechanism.

### Defect 4: "Stale" status doesn't exist in any schema
**Location:** `04-validation-pipeline.md`, line ~408 (`mark_stale(task_id)`)
**Problem:** `mark_stale()` is called in `on_spec_change()` but "stale" is not a valid status in any schema. Execution record statuses are: pending, running, completed, failed, abandoned. Task definitions have no status field at all (they are immutable once validated).
**Severity:** Medium — pseudocode references a nonexistent state.
**Fix:** Either add a "stale" mechanism (e.g., a flag on execution records, or a separate staleness tracker), or replace `mark_stale()` with setting execution status to a defined value like "abandoned."

### Defect 5: Inconsistent rule numbering across documents
**Location:** All three schema documents
**Problem:** Spec rules use `R0-S01` prefix. Impl rules use bare integers starting at `R0-40`. Task rules use bare integers starting at `R0-01`. Same pattern in Ring 1 (R1-S01 vs R1-10 vs R1-01) and Ring 2. Cross-referencing is error-prone: "R0-01" is ambiguous — is it a spec rule or a task rule?
**Severity:** Low — confusing but not broken.
**Fix:** Adopt consistent prefixes: `R0-S` (spec), `R0-I` (impl), `R0-T` (task). Or use non-overlapping ranges with a documented allocation scheme.

---

## Part 6: Terminology and Consistency Issues

These are not bugs but would benefit from attention:

| Issue | Documents | Description |
|---|---|---|
| "Decomposition Guidance" vs "Decomposition Notes" | 01, 02 | Different names for analogous sections at spec vs impl level — never explained |
| "Validated" overloaded | 01, 02, 03, 04 | Refers to both the status enum value AND the activity of validation |
| `#section-X.Y` format | 01, 02, 03 | Used in `spec_sections` references but the mapping from section numbers to H2/H3 headings is never defined |
| "Artifact" ambiguity | 01, 03, 04 | Means JSON+Markdown pair (01, 03) or any DDS document (04) |
| "Harness" undefined | 03, 05 | Used as "the runtime enforcement system" but never defined |
| "Pending" execution status | 03 | Defined in schema but no documented actor ever sets it |
| "Abandoned" execution status | 03 | Defined in schema but no trigger documented |
| "80% adherence" claim | 05 | CLAUDE.md instruction adherence rate stated without source |
| "1-4 impl docs" range | 05 | Constraint exists only in agent guide, not in any validation rule |

---

## Part 7: Middle-Ground Options Evaluated

| Option | Effort | Value | Recommendation |
|---|---|---|---|
| **A: Shared glossary** | Low | Medium — formalizes 12+ terms; helps agents loading individual docs | Do it if DDS grows beyond single-author use |
| **B: Cross-references** | Medium | Medium — but first consolidate duplicated invariants from 01/02 into 04 only | Conditional |
| **C: Run DDS validation as diagnostic** | Low | Low — category errors dominate; useful as a one-time exercise (done here) | Already done |
| **D: Number requirement-like statements** | High | Medium — enables checklists but existing rule IDs (R0-XX, CL-XX) already serve this purpose | Skip |
| **E: Full DDS transformation** | Very High | Low — wrong decomposition grain, double maintenance, content doesn't fit template | No |

---

## Part 8: Recommendation

### Do now (priority order):
1. **Fix Defect 1** (CL-T03 equality → coverage)
2. **Fix Defect 3** (re-decomposition behavior — document or implement incremental)
3. **Fix Defect 2** (convergence variable scope)
4. **Fix Defect 4** ("stale" status)
5. **Fix Defect 5** (rule numbering — low priority)

### Do if DDS grows:
- Add a shared `00-glossary.md`
- Consolidate cross-level invariants to live only in `04-validation-pipeline.md` (remove duplicates from 01, 02)
- Document the `#section-X.Y` reference format algorithm

### ~~Do not do~~ (original recommendation, now revised):
- ~~Full DDS transformation (wrong grain, high cost, low benefit)~~
- ~~Add FR-XX identifiers (existing rule IDs already serve this purpose)~~
- ~~Build a traceability chain (documents are small enough to read in full)~~
- ~~Create a DDS meta-spec (premature unless DDS becomes a team project)~~

> **These recommendations were based on assumptions that turned out to be wrong.** See Part 9 for the revised recommendation based on answered questions.

---

## Appendix A: Open Questions — Answered

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | Is DDS being implemented as software? | **Yes, with AI.** | Defects 1-5 are blocking bugs, not theoretical. |
| 2 | How many people will use DDS? | **Multi-team (developers + AI).** | Glossary, cross-references, and structural consistency become high-value. |
| 3 | Will DDS be applied to itself? | **Yes — self-validation is the ultimate test.** | The documents MUST pass their own Ring 0. Full transformation is required. |
| 4 | What is `#section-X.Y`? | **Suboptimal. Use standard markdown heading references instead.** | New defect: all `spec_sections` reference formats in docs 01-03 need updating. |
| 5 | Is 0.7 threshold configurable? | **Yes, it should be.** | A pipeline configuration mechanism must be specified in doc 04. |

---

## Part 9: Revised Recommendation (Post-Answers)

The original recommendation ("fix 5 bugs, skip restructuring") was correct under the assumption that DDS was a single-author reference system. **All three critical assumptions were wrong:**

- DDS **is** being implemented as software → defects are blocking
- DDS **is** multi-team → glossary and consistency enforcement are essential
- DDS **will** validate itself → the documents must pass Ring 0

This flips the analysis. The final devil's advocate (Agent 7) argued that the documents are "good enough" and restructuring is not worth the cost. That argument relied on the documents remaining reference material. **If DDS must validate its own documentation, the documents must be DDS-compliant. There is no middle ground.**

### The Bootstrap Problem

DDS cannot validate documents until it exists. DDS cannot exist until its specification passes DDS validation. This is the classic compiler bootstrap:

1. **Phase 0 (manual):** Fix the 5 defects + 2 new defects (section references, configurable threshold) in the current documents. These are the "pre-bootstrap" source of truth.
2. **Phase 1 (transform):** Create DDS-compliant artifacts from the fixed documents — a root spec, implementation docs, and eventually atomic tasks. This is done manually (or AI-assisted) without DDS validation, since the validator doesn't exist yet.
3. **Phase 2 (implement):** Use the DDS-compliant artifacts to implement the DDS pipeline itself (Ring 0 validators, refinement loop, etc.).
4. **Phase 3 (self-validate):** Run the implemented pipeline against the DDS-compliant artifacts. Fix any failures. This is the "compiler compiling itself" moment.
5. **Phase 4 (retire originals):** The DDS-compliant artifacts become the authoritative source. The original documents in `original_documents/` are archived.

### Revised Action Plan

#### Immediate: Fix 7 defects in current documents

| # | Defect | Location | Fix |
|---|---|---|---|
| 1 | CL-T03 equality → coverage | 02, 04 | Change "equals" to "covers" (every parent module in ≥1 child task) |
| 2 | Convergence variable scope | 04 `refine()` | Scope `previous_issues` per ring or reset on ring change |
| 3 | Re-decomposition discards work | 04 `on_spec_change()` | Pass existing impl docs to generation; document destructive default |
| 4 | "Stale" status undefined | 04 `mark_stale()` | Define mechanism or replace with valid status transition |
| 5 | Rule numbering inconsistent | 01, 02, 03 | Adopt consistent prefixes: R0-S, R0-I, R0-T (and R1-S, R1-I, R1-T; R2-S, R2-I, R2-T) |
| 6 | `#section-X.Y` format | 01, 02, 03 | Replace with standard markdown heading references |
| 7 | Convergence threshold not configurable | 04 | Add pipeline configuration mechanism (e.g., `pipeline-config.json` schema) |

#### Next: Create root DDS specification

A single DDS-compliant spec covering the entire system. Draft outline from Agent 3's analysis:

- **FR-01 through FR-10** covering document structure, validation pipeline, decomposition, and cross-level invariants
- **NFR-01 through NFR-04** covering Ring 0 performance, iteration limits, convergence threshold, token budget
- **System Constraints** covering Claude Code dependency, `openssl` requirement, JSON Schema draft-07, structured LLM output
- **Glossary** defining 15+ terms (Specification, Implementation Document, Atomic Task, Ring, Refinement Loop, Convergence Plateau, Decomposition, Dependency Symmetry, Escalation, Scope, Harness, Artifact, Functional Area, Cross-Level Invariant, Promotion)
- **Decomposition Guidance** suggesting 4 implementation documents:
  1. Document Schemas and Templates (all 3 levels)
  2. Validation Rules and Checks (Ring 0/1/2 rules per level + cross-level invariants)
  3. Pipeline Orchestration (refinement loop, convergence, escalation, orchestration)
  4. Claude Code Integration (hooks, subagents, commands, workflows)

#### Then: Decompose into implementation documents, then atomic tasks

Follow the standard DDS pipeline, manually at first, then using the pipeline as it becomes available.

#### Content that needs special handling during transformation

| Content Type | Current Location | DDS Home | Notes |
|---|---|---|---|
| JSON schemas | 01, 02, 03 | Background section of impl docs | Reference as formal definitions; embed or link |
| Generation prompts | 01, 02, 03 | Decomposition Constraints in parent impl doc OR dedicated atomic task | These are operational artifacts the system uses |
| Pseudocode algorithms | 04 | Approach section of atomic tasks | The algorithm IS the implementation spec |
| Worked examples (LTOS) | 01, 02, 03 | Appendix or separate reference doc | Not a DDS section; keep as supplementary material |
| Troubleshooting | 05 | Operational runbook (outside DDS hierarchy) | Not a specification artifact |
| Design rationale | 05 | Design Decisions section of impl docs | Natural fit |
| Hook configurations | 05 | Atomic task scope or impl doc Background | Implementation detail |

---

## Appendix B: Questions Round 2 — Answered

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | Language/stack? | User asked for recommendation. See Part 10. | TypeScript/Node.js recommended. |
| 2 | Preserve originals? | **Yes, preserve as-is.** | Originals stay in `original_documents/`. Fixed docs go to `docs/`. |
| 3 | Priority order? | **Fix defects first, then transform.** | Bootstrap Phase 0 confirmed. |
| 4 | Timeline? | **No pressure. Be thorough.** | Enables careful transformation without shortcuts. |
| 5 | Pipeline config? | User asked for recommendation. See Part 11. | Standalone `pipeline/config.json`. |
| 6 | LTOS examples? | **Supplementary material, can be deleted if they disturb.** | Keep in `examples/` or drop during transformation. |
| 7 | Skill update? | User asked for recommendation. See Part 11. | Single skill, restructured routing table. |

---

## Part 10: Language Recommendation — TypeScript/Node.js

### Why TypeScript

DDS is fundamentally a **JSON Schema validation + LLM orchestration** system. The language choice is driven by two load-bearing operations:

1. **Ring 0**: JSON Schema Draft-07 validation on every document write (via hooks)
2. **Ring 1/2**: LLM calls via `claude` CLI with structured JSON output

| Criterion | TypeScript/Node.js | Python |
|---|---|---|
| JSON Schema validation | `ajv` v8 — best-in-class, fully Draft-07 compliant | `jsonschema` — adequate but known compliance gaps on `oneOf`, `additionalProperties` |
| Markdown parsing | `remark`/`unified` — full AST; or simple line scanner | `mistune` / line scanner — adequate |
| LLM backend | `claude` CLI via `child_process` — no SDK needed | `claude` CLI via `subprocess` — no SDK needed |
| Cross-platform (Linux + Windows) | Frictionless. No venv, no PATH issues. `npm install` + `node` | Low-medium friction. venv management, Python version on Windows |
| AI-assisted development | Excellent. Claude Code's own language. Highest fidelity generation | Excellent. Dominant AI/LLM ecosystem language |
| Static typing for schemas | Very strong. JSON schemas map 1:1 to TypeScript interfaces | Adequate via TypedDict/dataclasses + mypy |
| Multi-team accessibility | High for web/full-stack teams | High for AI/ML teams |

**The tiebreaker:** DDS's JSON schemas (`SpecificationDefinition`, `ImplementationDefinition`, `AtomicTaskDefinition`) map directly to TypeScript interfaces. The compiler catches schema/code mismatches at build time. For a self-validating system, this type safety is a significant advantage over Python's runtime-only checking.

### Ruled Out

- **Rust**: No official Anthropic SDK. High AI-assistance friction (borrow checker, lifetimes).
- **Go**: No official Anthropic SDK. Less rich markdown/LLM tooling.
- **C#/.NET**: No official Anthropic SDK. Heavier setup.

### Specific Library Stack

| Purpose | Library |
|---|---|
| JSON Schema validation | `ajv` v8 + `ajv-formats` |
| Markdown heading extraction | `remark` + `remark-parse` (or line scanner for Ring 0 performance) |
| LLM backend | `claude` CLI via `child_process.execSync` / `spawn` |
| CLI framework | `commander` or plain `process.argv` |
| File I/O | Node.js built-in `fs/promises` |
| Configuration | JSON file + TypeScript `satisfies` operator |
| Testing | `vitest` |
| Type-checking | `tsc --strict` |

### Hook Commands After Migration

The existing `python3 validation/ring0/check_task_definition.py` commands in doc 05 become:
```bash
npx tsx src/cli/validate-task.ts "$FILE"
```

---

## Part 11: Configuration and Skill Approaches

### Pipeline Configuration: Standalone `pipeline/config.json`

**Why standalone, not embedded in doc 04:**
- Doc 04 is normative reference documentation (algorithms, system prompts)
- Embedding mutable operational values in it would require editing a schema document to change a threshold
- Configuration is tooling infrastructure, not a product specification

**Why JSON, not YAML/TOML:**
- Consistent with every other structured file in DDS (all definitions are JSON)
- No additional parser dependency

**Location:** `pipeline/config.json`
**Schema:** `schemas/pipeline-config-schema.json`

**Proposed schema:**

```json
{
  "refinement": {
    "max_iterations": 5,
    "convergence_threshold": 0.7
  },
  "claude_cli": {
    "command": "claude",
    "output_format": "json",
    "max_turns": 3,
    "delay_between_calls_ms": 2000,
    "retry_after_threshold_seconds": 60,
    "max_retries_on_short_429": 3,
    "backoff_multiplier": 2
  },
  "timeouts": {
    "ring1_check_seconds": 60,
    "ring2_check_seconds": 90,
    "fix_call_seconds": 120
  },
  "escalation": {
    "directory": "pipeline/escalations",
    "notify_on_escalation": false
  },
  "incremental": {
    "enabled": true,
    "stale_threshold_hours": 24
  }
}
```

**Design principle:** All fields are optional. Omission means use the default. The pipeline code reads the file and falls back to compiled-in defaults. The file need not exist for the pipeline to run.

**Documentation:** A new "Configuration" section in doc 04 pointing to `pipeline/config.json` and the schema.

### DDS Skill: Single Skill, Updated Routing

**Why single skill (not multiple):**
- One `description` field covers all DDS operations
- Avoids users needing to remember `/dds-validate` vs `/dds-decompose` vs `/dds-execute`

**Why the skill is NOT a DDS artifact:**
- It is tooling infrastructure, not a product requirement
- Lives at `.claude/skills/dds/SKILL.md` unconditionally

**Key changes from current:**

| Original | Updated | Reason |
|---|---|---|
| Points to `schemas/` | Points to `docs/` | Directory renamed post-transformation |
| No artifact directory listing | Explicit `specs/`, `implementation/`, `tasks/` paths | Agents need to know where project docs live |
| No mention of old docs | Explicit "do not use `original_documents/`" | Prevents agents reading superseded material |
| No pipeline config | Points to `pipeline/config.json` | New artifact |

**The skill remains a routing document** — it tells agents what to read, not a copy of what they'll read. This prevents stale-copy problems.

---

## Appendix C: Questions Round 3 — Answered

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | Agree with TypeScript? | **Yes.** | Confirmed. |
| 2 | Project structure? | **Source at repo root.** | `src/`, `package.json`, `tsconfig.json` at root. |
| 3 | Fixed docs location? | **`docs/` agreed.** | Originals archived, fixed versions in `docs/`. |
| 4 | One spec or two? | User proposed 5 specs (one per doc). See Part 12. | 2 specs recommended. |
| 5 | Testing strategy? | Dedicated test suite. See Part 13. | Unit tests + self-validation combination. |
| 6 | API tier? | **NOT using Anthropic API. Using Claude Code as runtime.** | Fundamental architecture change. See Part 14. |

---

## Part 12: Spec Granularity — 2 Specs, Not 5

### The user's proposal: 5 specs (one per original document)

The reasoning — agents only load what they need — is sound in principle but fails for DDS because of tight coupling between the schema documents (01-03) and the validation pipeline (04).

### Why 5 specs doesn't work

**Loading analysis:** Nearly every DDS operation requires loading the pipeline doc alongside the relevant schema doc:

| Operation | Must load |
|---|---|
| Create a spec | Spec Schema (01) |
| Validate a spec | Spec Schema (01) + Validation Pipeline (04) |
| Decompose spec → impl | Impl Doc Schema (02) + Validation Pipeline (04) |
| Validate an impl doc | Impl Doc Schema (02) + Validation Pipeline (04) |
| Decompose impl → tasks | Atomic Task Schema (03) + Validation Pipeline (04) |
| Execute a task | Atomic Task Schema (03) + Agent Guide (05) |
| Run full pipeline | All 5 |

The promise — "agents only load one spec" — breaks immediately. The Validation Pipeline (04) must accompany nearly every operation.

**The `related_specs` graph becomes near-complete:**
- Spec Schema relates to: Impl Doc Schema, Validation Pipeline
- Impl Doc Schema relates to: Spec Schema, Atomic Task Schema, Validation Pipeline
- Atomic Task Schema relates to: Impl Doc Schema, Validation Pipeline
- Validation Pipeline relates to: all three schema specs
- Agent Guide relates to: all four others

When everything is related to everything, `related_specs` loses navigational value and R1-S03 (cross-spec consistency) must check nearly all pairs on every change — combinatorial cost.

**Glossary management:** 5 specs each need a Glossary section (required by the template). Either you duplicate 15+ term definitions across 5 glossaries (drift risk), or you create a 6th glossary-only spec (bureaucratic overhead).

**Decomposition thinness:** Some specs (especially Spec Schema) would decompose into only 1-2 impl docs — barely above the minimum.

### Why 2 specs is the right answer

**The real architectural boundary is at doc 05.** Docs 01-04 form the DDS core system: schemas, validation rules, and orchestration. Doc 05 is the Claude Code integration layer — it's the only document that is tool-specific.

| Spec | Contents | Impl Docs |
|---|---|---|
| **Core DDS System** (docs 01-04) | Document schemas, validation rules, pipeline orchestration | 4 impl docs: (1) Spec Schema, (2) Impl Doc Schema, (3) Atomic Task Schema, (4) Validation Pipeline |
| **Claude Code Integration** (doc 05) | Hooks, subagents, commands, workflows, CLAUDE.md | 2-3 impl docs: (1) Hooks & Scope Enforcement, (2) Subagents & Commands, (3) Workflows & Context Management |

**Benefits:**
- `related_specs` has exactly 1 edge (Core ↔ Integration). Minimal cross-spec validation.
- One glossary in Core DDS covers all DDS terminology. Integration adds only Claude Code-specific terms.
- Core DDS decomposes into 4 impl docs (right at the recommended upper bound).
- The split mirrors a real interface: "the system" vs "the Claude Code implementation of the system."
- Agent loading maps cleanly: DDS document work → Core spec. Claude Code setup → Integration spec.

### Alternative considered: 3 specs

(1) Document Structure (01-03), (2) Validation Pipeline (04), (3) Agent Integration (05). This is defensible but the Document Structure spec would be very large (~80 rules, 3 schemas, 3 templates, 3 generation prompts). And the tight coupling between schemas and pipeline means agents still load both specs for any validation operation.

---

## Part 13: Testing Strategy

### The honest assessment

The user is right for Ring 0: a dedicated unit test suite is the best quality guarantee. The user is partially right for Ring 1/2: dedicated tests provide smoke coverage, but cannot guarantee LLM judgment quality.

**The real answer: exhaustive Ring 0 unit tests + self-validation as integration gate.**

### What gets unit tested (Ring 0 — deterministic TypeScript)

Every Ring 0 rule across all three document levels (~30 rules + 9 cross-level invariants) gets unit tests with `vitest`. Each rule needs at minimum:
- One valid passing fixture
- One fixture per distinct failure mode
- Edge cases for algorithmic rules (cycles, symmetry, boundary conditions)

**Estimated fixture count:** ~120-150 small synthetic JSON/Markdown files.

**Key algorithmic tests:**
- R0-07 (dependency symmetry): valid symmetric, missing reverse, extra reverse, transitive chains, partial asymmetry
- R0-08 (cycle detection): linear chain, self-loop, 2-node cycle, 3-node cycle, diamond (valid), disconnected components
- Convergence detection: null previous (first call), 100% overlap, 70% boundary, 69% (just below), empty current, completely different issues

### What cannot be unit tested (Ring 1/2 — LLM-based)

Ring 1/2 validators are Claude Code subagents. Output varies between runs. Traditional assertion-based tests are impossible.

**Three approaches for Ring 1/2:**

1. **Smoke tests with obviously-bad documents** (primary): Synthetic documents with severe, unambiguous defects that any LLM should catch. Assert only that verdict = "fail", not specific wording. Low flakiness.

2. **Structural output validation**: Assert that subagent JSON output parses correctly and matches the Ring 1/2 output schema. Deterministic regardless of LLM behavior.

3. **Self-validation as integration gate**: Run the full pipeline against the DDS documents themselves. This tests the happy path (well-formed docs → all rings pass). It does NOT test failure paths, edge cases, or regressions.

### What self-validation cannot do

- Only tests one point in the input space (the DDS docs themselves)
- Never exercises failure paths (fix_semantic, fix_quality are never called on well-formed docs)
- Cannot detect Ring 0 regressions unless the DDS docs happen to trigger the broken rule
- Conflates tool correctness with test data correctness

### Test structure

```
tests/
├── unit/                               # Ring 0 — vitest, fast, CI on every push
│   ├── ring0/
│   │   ├── spec-validator.test.ts
│   │   ├── impl-validator.test.ts
│   │   ├── task-validator.test.ts
│   │   └── cross-level.test.ts
│   └── convergence.test.ts
├── fixtures/                           # ~120-150 synthetic documents
│   ├── specs/
│   ├── impl-docs/
│   ├── tasks/
│   └── cross-level-graphs/
├── smoke/                              # Ring 1/2 — slow, on-demand/nightly
│   ├── ring1-obvious-gaps.test.ts
│   └── ring2-vague-approach.test.ts
└── golden/                             # Ring 1/2 reference examples (manual review)
    └── README.md
```

**Commands:**
```bash
npm test              # Ring 0 unit tests (every push)
npm run test:smoke    # Ring 1/2 smoke tests (nightly/on-demand)
npm run test:self     # Self-validation (pre-release/schema changes)
npm run test:all      # Everything
```

---

## Part 14: Architecture — TypeScript Orchestrator + `claude` CLI

> **Corrected from earlier version.** The initial analysis (from Agent team) proposed a radical redesign where Claude Code subagents owned the refinement loop. After discussion, the user clarified: Claude Code serves as a **drop-in LLM backend** via the `claude` CLI, not as the orchestrator. The original doc 04 architecture stays intact.

### The architecture (close to doc 04's original design)

```
TypeScript program (orchestrator)
  ├── Ring 0: direct TypeScript (ajv, markdown parser, graph algorithms)
  ├── Ring 1/2: shells out to `claude` CLI with prompt templates
  ├── Fix functions: shells out to `claude` CLI with fix prompts
  ├── Refinement loop: TypeScript `while` loop (deterministic control)
  ├── Convergence detection: TypeScript set math
  └── Pipeline orchestration: TypeScript `run_pipeline()` function
```

### How TypeScript calls `claude` CLI for LLM operations

```typescript
import { execSync } from 'child_process';

function runRing1Check(ruleId: string, prompt: string): Ring1Result {
  const result = execSync(
    `claude -p ${JSON.stringify(prompt)} --output-format json --json-schema '${ring1Schema}'`,
    { encoding: 'utf-8', timeout: 60_000 }
  );
  return JSON.parse(result) as Ring1Result;
}
```

Key `claude` CLI flags:
- `--output-format json` — structured JSON output with metadata
- `--json-schema '{...}'` — enforces output conforms to a JSON schema (replaces API's `response_format`)
- `--max-turns N` — limits agent turns per call
- `-p` — non-interactive print mode (bills through subscription, not API)

The TypeScript program additionally validates returned JSON with `ajv` as a safety net.

**Rate limit handling:**
- `claude -p` may return 429 when rate-limited
- RPM/burst limits (retry-after ≤ 60s): retry with exponential backoff, up to 3 times
- 5-hour window limits (retry-after > 60s): abort pipeline immediately, report to user
- Configurable delay between calls (default 2000ms) to avoid burst limits

**Agent SDK (`@anthropic-ai/claude-agent-sdk`) is NOT used** — it requires an Anthropic API key with pay-per-token billing. The `claude -p` CLI uses the Pro/Max subscription.

### Two execution modes

| Mode | Entry Point | Use Case |
|---|---|---|
| **Programmatic** | `npx tsx src/cli/run-pipeline.ts <spec-id>` | Full pipeline run, CI, scripted workflows |
| **Interactive** | `/project:run-pipeline` slash command → subagents | Human-driven workflow in Claude Code session |

Both modes share the same Ring 0 validators, prompt templates, and `claude` CLI integration. The interactive mode uses subagents for context isolation (as doc 05 describes). The programmatic mode is a TypeScript program that does the same thing without subagents.

### What TypeScript implements

**Everything.** TypeScript is the full implementation:

| Component | Implementation |
|---|---|
| Ring 0 validators | Direct TypeScript (ajv + markdown parser + graph algorithms) |
| Ring 1/2 validators | TypeScript calls `claude` CLI with prompt templates from docs |
| Fix functions | TypeScript calls `claude` CLI with fix prompts from doc 04 |
| Refinement loop | TypeScript `while` loop — `previous_issues` is a program variable |
| Convergence detection | TypeScript set intersection math |
| Pipeline orchestration | TypeScript `runPipeline()`, `onSpecChange()` functions |
| Report generation | TypeScript writes JSON reports |
| Scope enforcement | TypeScript CLI invoked by PreToolUse hook |
| Cross-level invariants | Direct TypeScript (deterministic checks) |

### What Claude Code provides

**Two things only:**

1. **The LLM backend** — `claude` CLI is the interface to Claude's reasoning
2. **The interactive UX** — subagents and slash commands for human-driven workflows (doc 05)

### Complete file structure

```
project-root/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── .claude/
│   ├── settings.json                            # Hooks → TypeScript CLIs
│   ├── agents/
│   │   ├── dds-validator.md                     # Interactive validation
│   │   ├── dds-decomposer.md                    # Interactive decomposition
│   │   └── dds-executor.md                      # Task execution
│   ├── commands/
│   │   ├── validate.md                          # /project:validate
│   │   ├── run-pipeline.md                      # /project:run-pipeline
│   │   ├── revalidate.md                        # /project:revalidate
│   │   ├── decompose-spec.md
│   │   ├── decompose-impl.md
│   │   └── execute-task.md
│   └── skills/
│       └── dds/
│           └── SKILL.md
│
├── src/
│   ├── cli/                                     # Entry points
│   │   ├── validate-spec.ts                     # Ring 0 for specs
│   │   ├── validate-impl.ts                     # Ring 0 for impl docs
│   │   ├── validate-task.ts                     # Ring 0 for tasks
│   │   ├── validate-cross.ts                    # Cross-level invariants
│   │   ├── run-pipeline.ts                      # Full pipeline orchestration
│   │   ├── refine.ts                            # Single-document refinement loop
│   │   ├── scope-guard.ts                       # Hook: scope enforcement
│   │   └── report.ts                            # Pipeline report generation
│   ├── validators/
│   │   ├── spec/ring0.ts
│   │   ├── impl/ring0.ts
│   │   ├── task/ring0.ts
│   │   └── cross-level/
│   │       ├── spec-impl.ts
│   │       ├── impl-task.ts
│   │       └── full-stack.ts
│   ├── llm/
│   │   ├── claude-cli.ts                        # Wrapper: invoke `claude` CLI
│   │   ├── ring1.ts                             # Ring 1 check runner
│   │   ├── ring2.ts                             # Ring 2 check runner
│   │   └── fix.ts                               # fix_structural, fix_semantic, fix_quality
│   ├── pipeline/
│   │   ├── refine.ts                            # Refinement loop logic
│   │   ├── convergence.ts                       # Convergence detection
│   │   ├── orchestrate.ts                       # run_pipeline(), on_spec_change()
│   │   └── escalation.ts                        # Escalation report generation
│   ├── parsers/
│   │   ├── markdown.ts                          # Heading extractor
│   │   └── graph.ts                             # DFS cycle detection
│   ├── schemas/
│   │   ├── spec.schema.json
│   │   ├── impl.schema.json
│   │   ├── task.schema.json
│   │   └── pipeline-config.schema.json
│   └── types/
│       ├── definitions.ts                       # SpecDefinition, ImplDefinition, TaskDefinition
│       └── results.ts                           # Ring0Result, Ring1Result, Ring2Result
│
├── tests/
│   ├── unit/                                    # Fast, deterministic, every push
│   │   ├── ring0/
│   │   │   ├── spec-validator.test.ts
│   │   │   ├── impl-validator.test.ts
│   │   │   ├── task-validator.test.ts
│   │   │   └── cross-level.test.ts
│   │   ├── convergence.test.ts
│   │   └── pipeline-logic.test.ts               # Orchestration with mocked `claude` CLI
│   ├── fixtures/                                # ~120-150 synthetic documents
│   │   ├── specs/
│   │   ├── impl-docs/
│   │   ├── tasks/
│   │   └── cross-level-graphs/
│   ├── smoke/                                   # Ring 1/2 via real `claude` CLI (on-demand)
│   │   ├── ring1-obvious-gaps.test.ts
│   │   └── ring2-vague-approach.test.ts
│   └── golden/                                  # Reference examples (manual review)
│
├── original_documents/                          # Preserved as-is (archived)
├── docs/                                        # Defect-fixed versions
│   ├── 01-spec-schema.md
│   ├── 02-implementation-doc-schema.md
│   ├── 03-atomic-task-schema.md
│   ├── 04-validation-pipeline.md
│   └── 05-agent-guide.md
│
├── specs/                                       # DDS-compliant artifacts
│   ├── definitions/
│   └── descriptions/
├── implementation/
│   ├── definitions/
│   └── descriptions/
├── tasks/
│   ├── definitions/
│   ├── descriptions/
│   └── executions/
└── pipeline/
    ├── config.json                              # Tunable parameters
    ├── reports/
    ├── escalations/
    └── validation-cache/                        # Ring 1/2 JSON outputs per iteration
```

### Key design details

**`src/llm/claude-cli.ts`** — thin wrapper around `child_process.execSync`:
- Accepts a prompt string, returns parsed JSON
- Handles timeouts, malformed output, and retries
- Validates returned JSON against expected schemas
- Configurable via `pipeline/config.json` (`claude_cli.command`, `claude_cli.max_turns`)

**Refinement loop** — `src/pipeline/refine.ts`:
- Implements doc 04's `refine()` pseudocode almost verbatim
- `previous_issues` is a TypeScript variable (no cache files needed — it's a program, not a subagent)
- Calls Ring 0 directly (TypeScript functions), Ring 1/2 via `claude-cli.ts`
- Returns `{ promoted: true }` or `{ escalated: true, report: EscalationReport }`

**Hooks:**
- **PostToolUse**: `npx tsx src/cli/validate-spec.ts "$FILE"` (Ring 0 only, milliseconds)
- **PreToolUse**: `npx tsx src/cli/scope-guard.ts "$FILE"` (scope enforcement)
- Full pipeline: explicit command only (`npx tsx src/cli/run-pipeline.ts <spec-id>`)

### Impact summary

| Component | Doc 04 original | Implementation |
|---|---|---|
| Ring 0 | "Implemented as code" | TypeScript functions (ajv + parsers) |
| Ring 1/2 | "LLM-based checks" | TypeScript calls `claude -p` with prompt templates |
| Fix functions | "LLM for fixes" | TypeScript calls `claude -p` with fix prompts |
| Refinement loop | `refine()` pseudocode | TypeScript `while` loop — near-identical |
| `previous_issues` | Variable in pseudocode | TypeScript variable |
| Convergence | `converged()` function | TypeScript function — identical logic |
| `run_pipeline()` | Pseudocode function | TypeScript function — near-identical |
| `on_spec_change()` | Pseudocode function | TypeScript function — near-identical |
| Structured output | Implied by prompts | `claude --output-format json` + ajv validation |

**The architecture stays remarkably close to doc 04's original design.** The only real change is the LLM backend: `claude` CLI instead of direct API calls.

### Naming conventions (confirmed)

| Element | Convention | Example |
|---|---|---|
| Files | kebab-case | `validate-spec.ts`, `cross-level.test.ts` |
| Directories | kebab-case | `src/validators/`, `tests/fixtures/` |
| Interfaces/Types | PascalCase | `Ring0Result`, `SpecDefinition` |
| Functions | camelCase | `validateSpec()`, `checkConvergence()` |
| Constants | UPPER_SNAKE_CASE | `MAX_ITERATIONS`, `CONVERGENCE_THRESHOLD` |
| Enum members | PascalCase | `DocumentLevel.Spec`, `Verdict.Pass` |
| Test files | `*.test.ts` suffix | `spec-validator.test.ts` |

---

## Appendix D: Questions Round 4 — Answered

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | Claude Code experience? | **Yes, team has experience.** | No extra onboarding needed. |
| 2 | /compact handling? | **Avoid it. Artifacts small enough for context window. Limit turns.** | Moot — TypeScript orchestrates, not subagents. |
| 3 | 2 specs or 5? | **2 specs confirmed.** | Core DDS + Claude Code Integration. |
| 4 | Hooks trigger full pipeline? | **No. Ring 0 only via hooks. Full pipeline on explicit command.** | PostToolUse = Ring 0. `/project:validate` = full 3-ring. |
| 5 | Naming conventions? | **Confirmed.** kebab-case files, PascalCase types, camelCase functions. |

---

## Appendix E: All Confirmed Decisions Summary

| Decision | Choice | Part |
|---|---|---|
| Transform DDS docs to DDS structure? | **Yes, full transformation via bootstrap** | Part 9 |
| Language/stack | **TypeScript/Node.js** | Part 10 |
| LLM backend | **`claude` CLI (not Anthropic API)** | Part 14 |
| Architecture | **TypeScript orchestrator + `claude` CLI for LLM calls** | Part 14 |
| Spec granularity | **2 specs: Core DDS System + Claude Code Integration** | Part 12 |
| Pipeline config | **Standalone `pipeline/config.json`** | Part 11 |
| Hooks | **Ring 0 only. Full pipeline on explicit command.** | Appendix D |
| Testing | **Ring 0 unit tests + smoke tests + self-validation** | Part 13 |
| Naming conventions | **kebab-case files, PascalCase types, camelCase functions** | Part 14 |
| Original documents | **Preserved as-is in `original_documents/`** | Appendix B |
| Fixed documents | **`docs/` directory** | Appendix B |
| LTOS examples | **Supplementary material, can be dropped** | Appendix B |
| DDS skill | **Single skill, routing table updated** | Part 11 |
| Priority | **Fix 7 defects first, then transform** | Appendix B |

---

## Appendix F: Questions Round 5 — Answered

| # | Question | Answer | Impact |
|---|---|---|---|
| 1 | `claude` CLI installed? | **Yes, latest as of 2026-03-22.** | All flags verified available. |
| 2 | CI environment? | **No CI yet, future work.** | Tests run locally only for now. |
| 3 | Monorepo? | **Yes, single repo.** | File structure confirmed. |
| 4 | Ready for Phase 0? | **Yes.** | Proceeding. |
| 5 | Subscription tier? | **Max 20x currently, but solution must work on any tier.** | Rate limit handling is essential. |
| 6 | 429 retry strategy? | **Short 429 (≤60s): retry. Long 429 (>60s): abort.** | Config updated. |
| 7 | Agent SDK? | **Off the table — requires API key billing.** | `claude -p` is the only LLM backend. |
| 8 | Batching Ring 1 checks? | **Future optimization. V1 uses separate calls for fresh-context quality.** | Accept higher call count for better quality. |
| 9 | Pipeline run time? | **10-30 minutes acceptable.** | No need to optimize for speed. |

---

## Appendix G: All Confirmed Decisions (Final)

| Decision | Choice | Part |
|---|---|---|
| Transform DDS docs to DDS structure? | **Yes, full transformation via bootstrap** | Part 9 |
| Language/stack | **TypeScript/Node.js** | Part 10 |
| LLM backend | **`claude -p` CLI (subscription billing, not API)** | Part 14 |
| Agent SDK | **Not used (requires API key)** | Part 14 |
| Architecture | **TypeScript orchestrator + `claude -p` for LLM calls** | Part 14 |
| Spec granularity | **2 specs: Core DDS System + Claude Code Integration** | Part 12 |
| Pipeline config | **Standalone `pipeline/config.json`** | Part 11 |
| Rate limit handling | **Short 429: retry 3x with backoff. Long 429: abort.** | Part 14 |
| Hooks | **Ring 0 only (PostToolUse). Full pipeline on explicit command.** | Appendix D |
| Testing | **Ring 0 unit tests + smoke tests + self-validation** | Part 13 |
| Naming conventions | **kebab-case files, PascalCase types, camelCase functions** | Part 14 |
| Original documents | **Preserved as-is in `original_documents/`** | Appendix B |
| Fixed documents | **Copied to `docs/` with fixes applied** | Appendix B |
| LTOS examples | **Supplementary material, can be dropped** | Appendix B |
| DDS skill | **Single skill, routing table updated** | Part 11 |
| Priority | **Fix 7 defects first, then transform** | Appendix B |
| Batching | **V1: separate calls (fresh context = higher quality). Future: batch.** | Appendix F |
| Monorepo | **Yes, everything in one repo** | Appendix F |
| CI | **Future work, not yet** | Appendix F |
