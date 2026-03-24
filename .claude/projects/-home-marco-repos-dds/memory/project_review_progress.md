---
name: DDS pipeline status and next steps
description: Current state of the DDS pipeline implementation, end-to-end testing, and what needs to happen next
type: project
---

## Current State (2026-03-24)

The DDS pipeline is **fully implemented, reviewed, and integration-fixed**. It runs end-to-end but hits quality rubric issues during self-validation.

### What's Done
- All 28 atomic tasks implemented and merged
- Per-task review: 28/28 passed (2 needed one fix iteration)
- Integration review: all 7 errors and 19 warnings fixed
- Pipeline runs end-to-end: spec → impl docs → atomic tasks with 3-ring validation + auto-fix
- 42 test files, 1260 tests passing, TypeScript compiles clean

### Pipeline E2E Test Results
Running `npx tsx src/cli/run-pipeline.ts spec-fa3a90b8`:
- **Phase 1 (spec validation):** PASSES first try — all Ring 0/1/2 checks pass
- **Phase 2 (decompose to impl docs):** Generates 5 impl docs. Most pass after 2-5 iterations. **Impl doc 2/5 (`impl-b7c3e9f5`) gets stuck on R2-I13** (design decision completeness) and escalates after 10 iterations.
- **Phase 3 (decompose to tasks):** Not reached yet due to Phase 2 escalation

### The Blocking Issue: R2-I13

**R2-I13** checks "design decision completeness" — whether the impl doc's Design Decisions section covers all architectural choices implied by its Requirements. The prompt (`src/validators/impl/ring2.ts` line 118, function `buildDesignDecisionCompletenessPrompt`) is too strict:

```
FAIL if: A decomposition agent would need to make architectural decisions on its own
```

This causes two problems:
1. **False positives:** It flags task-level implementation details (async patterns, polling strategies) that belong in atomic tasks, not impl docs
2. **Fix oscillation:** The quality fix adds more DDs to satisfy R2-I13, but this introduces R1-I13 (dependency completeness) or R1-I12 (design coherence) failures, which the semantic fix then reverts, creating a cycle

The escalation report (`pipeline/escalations/impl-b7c3e9f5-*.json`) shows 12 unresolved R2-I13 issues flagging nearly every DD.

Additionally, DD-03 in the generated impl doc references a `spec_id` field that doesn't exist in `ImplDefinition` (the actual field is `spec_sections`). This is a real bug in the generated content.

### What Needs to Happen Next

**Option A (recommended): Fix both the rubric and the real issues**
1. Soften R2-I13's rubric in `src/validators/impl/ring2.ts` (line 118-137) to distinguish:
   - Architectural decisions (which MUST be in Design Decisions) — e.g., data formats, error handling strategy, module boundaries
   - Task-level implementation details (which SHOULD be left to atomic tasks) — e.g., specific async patterns, loop structures, variable naming
2. Clean up generated impl docs or re-run the pipeline after the rubric fix

**Option B: Accept escalation, manually review**
- Read the generated impl docs in `implementation/descriptions/`
- Fix real issues (like `spec_id` → `spec_sections` in DD-03)
- Re-submit to the pipeline

### After Phase 2 Passes
- Phase 3 will decompose impl docs into atomic tasks and validate each
- Phase 4 will run cross-level invariants (CL-S, CL-T, CL-F)
- If the full pipeline completes, spec-fa3a90b8 achieves self-validation (Analysis Phase 3)

### Key Files
- Pipeline config: `pipeline/config.json` (max_iterations: 10, timeouts: 1800s, max_turns: 300)
- Spec: `specs/definitions/spec-fa3a90b8.json` + `specs/descriptions/spec-fa3a90b8.md`
- Generated impl docs: `implementation/definitions/impl-*.json` + `implementation/descriptions/impl-*.md`
- R2-I13 prompt: `src/validators/impl/ring2.ts` line 118 (`buildDesignDecisionCompletenessPrompt`)
- Escalation reports: `pipeline/escalations/`
- Pipeline reports: `pipeline/reports/`
- CLI entry: `npx tsx src/cli/run-pipeline.ts spec-fa3a90b8`

### Prior Bug Fixes Applied During E2E Testing
- `src/pipeline/orchestrate.ts`: Fixed paths to use `definitions/` and `descriptions/` subdirs
- `src/pipeline/refine.ts`: Fixed JSON path derivation, built real validation context from disk scans, excluded self from existingImplIds, read real task JSON instead of stub
- `src/validators/spec/ring0.ts`: Fixed R0-S13 to check FR/NFR uniqueness within defining sections only
- `src/llm/claude-cli.ts`: Fixed response parsing (`structured_output` field for `--json-schema`), error handling for non-success subtypes, configurable `max_turns` and `use_tools`
- `src/validators/spec/ring1.ts`: Refined R1-S02 atomicity prompt to reduce false positives (went from 17 flagged to 0)
- Added `ajv-formats` to all Ajv instances to suppress date-time warnings

**Why:** Self-validation (running DDS against its own spec) is the ultimate test per analysis/ANALYSIS.md Phase 3.

**How to apply:** Fix R2-I13 rubric, clean artifacts, re-run pipeline.
