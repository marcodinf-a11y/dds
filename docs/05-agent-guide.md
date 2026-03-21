# Agent Guide — Operating DDS with Claude Code

> Part of the Document Decomposition System (DDS).
> References: [Spec Schema](01-spec-schema.md), [Implementation Doc Schema](02-implementation-doc-schema.md), [Atomic Task Schema](03-atomic-task-schema.md), [Validation Pipeline](04-validation-pipeline.md)

## What This System Does

DDS is a pipeline that takes a human-written specification and progressively decomposes it into implementation documents, then into atomic tasks small enough for a coding agent to execute in a single session. Every document passes through a three-ring validation pipeline before being promoted or decomposed.

```
Specification (human-authored)
  └── Implementation Document (auto-generated, ~1 feature)
        └── Atomic Task (auto-generated, ~1 coding session)
              ├── Task Definition   (JSON, immutable)
              ├── Task Description  (Markdown, immutable)
              └── Execution Record  (JSON, mutable, runtime)
```

This guide tells you how to operate DDS using Claude Code — the CLAUDE.md configuration, skills, hooks, subagents, and workflows.

---

## Claude Code Setup

### Project Structure

```
project-root/
├── CLAUDE.md                          # Root instructions
├── .claude/
│   ├── settings.json                  # Hooks configuration
│   ├── agents/
│   │   ├── dds-validator.md           # Validation subagent
│   │   ├── dds-decomposer.md         # Decomposition subagent
│   │   └── dds-executor.md           # Task execution subagent
│   ├── commands/
│   │   ├── validate.md               # /project:validate
│   │   ├── decompose-spec.md         # /project:decompose-spec
│   │   ├── decompose-impl.md         # /project:decompose-impl
│   │   └── execute-task.md           # /project:execute-task
│   └── skills/
│       └── dds/
│           └── SKILL.md              # DDS domain knowledge
├── schemas/
│   ├── 01-spec-schema.md
│   ├── 02-implementation-doc-schema.md
│   ├── 03-atomic-task-schema.md
│   ├── 04-validation-pipeline.md
│   └── 05-agent-guide.md             # This document
├── specs/
│   ├── definitions/
│   └── descriptions/
├── implementation/
│   ├── definitions/
│   └── descriptions/
├── tasks/
│   ├── definitions/
│   ├── descriptions/
│   └── executions/
├── validation/
│   ├── ring0/
│   ├── ring1/
│   ├── ring2/
│   └── cross-level/
└── pipeline/
    ├── reports/
    └── escalations/
```

### CLAUDE.md — Root Configuration

CLAUDE.md is read by Claude Code at session start. Keep it short and focused on what Claude gets wrong without it. Reference detailed docs via file paths — do not inline them.

```markdown
# DDS Project

## What This Is
Document Decomposition System. Transforms specs into validated,
agent-executable atomic tasks via a three-ring validation pipeline.

## Architecture
For full system docs, see schemas/ directory:
- schemas/01-spec-schema.md — Specification format and validation
- schemas/02-implementation-doc-schema.md — Implementation doc format
- schemas/03-atomic-task-schema.md — Atomic task format
- schemas/04-validation-pipeline.md — Pipeline orchestration and prompts
- schemas/05-agent-guide.md — This operational guide

## Key Rules
- IMPORTANT: All IDs use 8 random hex chars: spec-XXXXXXXX,
  impl-XXXXXXXX, at-XXXXXXXX, ac-XXXXXXXX
- Generate IDs with: openssl rand -hex 4
- JSON definitions and markdown descriptions are always paired
- Dependency symmetry: if A.blocks contains B, then B.blocked_by
  MUST contain A
- Scope is ENFORCED: agents may only modify files in scope.files
- Ring 0 before Ring 1 before Ring 2. Never skip rings.
- Validation failures restart from Ring 0 after fixes

## Build Commands (project-specific — replace with your project's commands)
- Build: dotnet build LTOS.sln /warnaserror
- Test: dotnet test
- Arch tests: dotnet test LTOS.ArchTests
- Single test: dotnet test --filter {TestName}

## File Conventions
- Spec definitions: specs/definitions/spec-XXXXXXXX.json
- Spec descriptions: specs/descriptions/spec-XXXXXXXX.md
- Impl definitions: implementation/definitions/impl-XXXXXXXX.json
- Impl descriptions: implementation/descriptions/impl-XXXXXXXX.md
- Task definitions: tasks/definitions/at-XXXXXXXX.json
- Task descriptions: tasks/descriptions/at-XXXXXXXX.md
- Execution records: tasks/executions/at-XXXXXXXX-runN.json

## Context Management
- When working on a task, read ONLY the task description and the
  files in scope. Do not explore the broader codebase.
- When decomposing, read the parent document and the schema doc
  for the target level.
- /compact when context exceeds 50%. Preserve: current document IDs,
  validation status, and unresolved issues.
```

### CLAUDE.md Best Practices

Based on current Claude Code guidance (March 2026):

**Keep it concise.** Claude Code's system prompt already contains ~50 instructions. Every line you add dilutes attention. Aim for under 100 lines. If Claude ignores a rule, the file is probably too long — prune other rules first.

**Document what Claude gets wrong, not what it gets right.** If Claude naturally follows a pattern, don't waste a line saying to follow it. Reserve instructions for corrections.

**Use pointers, not copies.** Reference `schemas/01-spec-schema.md` instead of inlining the schema. This keeps CLAUDE.md lean and avoids stale content.

**Never send an LLM to do a linter's job.** Use hooks for deterministic checks (formatting, scope enforcement). Reserve CLAUDE.md for judgment calls.

**Treat CLAUDE.md like code.** Review it when things go wrong. Prune regularly. Test changes by observing behavior shifts.

**Use emphasis for critical rules.** Prefix with "IMPORTANT:" for rules that must not be violated. Claude Code responds to this signal.

---

## Skills

Skills provide domain knowledge that Claude loads on demand. Place DDS knowledge in a skill so it doesn't bloat every session.

### .claude/skills/dds/SKILL.md

```markdown
---
name: dds
description: "Document Decomposition System knowledge. Use when
  working with specs, implementation docs, atomic tasks, or the
  validation pipeline. Covers schemas, validation rules, generation
  prompts, and pipeline orchestration."
user-invocable: true
---

# DDS Skill

When working with DDS documents, read the relevant schema before
creating or modifying any document:

- Creating/editing a spec → read schemas/01-spec-schema.md
- Creating/editing an impl doc → read schemas/02-implementation-doc-schema.md
- Creating/editing an atomic task → read schemas/03-atomic-task-schema.md
- Running validation → read schemas/04-validation-pipeline.md
- General operations → read schemas/05-agent-guide.md

## Quick Reference

### ID Generation
openssl rand -hex 4

### Document Pairs
Every document has a JSON definition + markdown description.
JSON goes in definitions/. Markdown goes in descriptions/.

### Validation Order
Ring 0 (structural) → Ring 1 (semantic) → Ring 2 (quality)
Never skip. Always restart from Ring 0 after fixes.

### Dependency Symmetry
If A.blocks contains B, then B.blocked_by MUST contain A.
Always maintain both directions when creating or editing tasks.

### Status Transitions
draft → validated → decomposed
Backward transitions allowed on validation failure.

### Acceptance Criteria Types
test/build/lint → verify field (shell command, exit 0 = pass)
review → rubric field (LLM judge prompt)
```

---

## Hooks

Hooks are deterministic — they fire every time, unlike CLAUDE.md instructions which are advisory (~80% adherence). Use hooks for rules that must never be violated.

### .claude/settings.json

Both hooks call a single Python script (`validation/hooks/dds_hook.py`) with a mode argument. This avoids fragile shell one-liners, handles path normalization correctly, and uses proper JSON parsing instead of grep.

**Prerequisites:** Python 3.8+ must be available in `PATH`.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 validation/hooks/dds_hook.py pre \"$CLAUDE_FILE\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 validation/hooks/dds_hook.py post \"$CLAUDE_FILE\""
          }
        ]
      }
    ]
  }
}
```

**PreToolUse (pre mode):** Enforces scope boundaries. When an agent tries to edit a file, the hook normalizes the path, searches task definitions for an active task referencing the file, and checks `scope.files` membership using exact list matching (not substring grep). Exit code 2 blocks the operation. Files in `tasks/executions/` and `pipeline/` are allowed unconditionally.

**PostToolUse (post mode):** Runs Ring 0 JSON schema validation automatically whenever a definition file is written or edited. Routes to the appropriate validator (`check_spec.py`, `check_impl.py`, or `check_task.py`) based on the file path. Non-definition files are ignored.

**Script architecture:**

```
validation/
├── hooks/
│   └── dds_hook.py           # Unified hook entry point
│                              # Handles: path normalization, routing,
│                              # scope checking, error formatting
└── ring0/
    ├── check_spec.py         # Ring 0 spec validator (imported by hook)
    ├── check_impl.py         # Ring 0 impl validator
    └── check_task.py         # Ring 0 task validator
```

The hook script handles all shared concerns (path normalization, JSON parsing, routing). The Ring 0 validators are separate modules containing the actual validation logic (JSON schema checks, markdown structure, dependency graphs).

---

## Subagents

Subagents get their own context window and tool access. Use them for focused tasks that benefit from isolation — validation, decomposition, and task execution.

### .claude/agents/dds-validator.md

```markdown
---
name: dds-validator
description: "Validates DDS documents through the three-ring
  pipeline. Use proactively when any DDS document is created or
  modified."
tools:
  - Bash
  - Read
  - Write
skills:
  - dds
---

You are the DDS validation agent. Your job is to run the three-ring
validation pipeline on DDS documents.

## Process
1. Read the relevant schema document from schemas/.
2. Run Ring 0 (structural) checks. If any fail, report them and
   stop — do not proceed to Ring 1.
3. Run Ring 1 (semantic) checks using the prompts from the schema.
   If any fail, report them and stop.
4. Run Ring 2 (quality) checks using the rubrics from the schema.
   Report all results.

## Output
For each ring, output a JSON result following the schemas defined
in 04-validation-pipeline.md. Summarize pass/fail status at the end.

## Rules
- Never skip a ring. Ring 0 must pass before Ring 1. Ring 1 before
  Ring 2.
- For Ring 1 and Ring 2, follow the exact prompt templates from
  the schema documents. Do not improvise validation criteria.
- Be strict. "Probably fine" is FAIL.
```

### .claude/agents/dds-decomposer.md

```markdown
---
name: dds-decomposer
description: "Decomposes DDS documents into child documents. Use
  when decomposing a validated spec into impl docs, or a validated
  impl doc into atomic tasks."
tools:
  - Bash
  - Read
  - Write
skills:
  - dds
---

You are the DDS decomposition agent. Your job is to break parent
documents into child documents following the generation prompts in
the schema documents.

## Process
1. Verify the parent document has status "validated".
2. Read the parent document (JSON + markdown).
3. Read the relevant schema for the target level.
4. Use the generation prompt from the schema to produce child
   documents.
5. Write each child document pair (JSON + markdown) to the
   correct directories.
6. Update the parent document's JSON to reference the new children.
7. Update the parent's status to "decomposed".

## Spec → Implementation Docs
- Read schemas/02-implementation-doc-schema.md for the generation
  prompt.
- Follow the spec's Decomposition Guidance section.
- Produce 1-4 impl docs. Each covers a coherent feature boundary.

## Implementation Doc → Atomic Tasks
- Read schemas/03-atomic-task-schema.md for the generation prompt.
- Follow the impl doc's Task Decomposition Notes section.
- IMPORTANT: Maintain dependency symmetry in blocks/blocked_by.
- Produce 3-8 atomic tasks.
- List tasks in execution order in the impl doc's atomic_tasks
  array.

## Rules
- Generate all IDs with: openssl rand -hex 4
- NEVER decompose a document that is not in "validated" status.
- After decomposition, the validator subagent should run on all
  new documents before considering the decomposition complete.
```

### .claude/agents/dds-executor.md

```markdown
---
name: dds-executor
description: "Executes atomic tasks by implementing the code
  changes described in the task description. Use when a validated
  atomic task is ready for implementation."
tools:
  - Bash
  - Read
  - Write
  - Edit
skills:
  - dds
---

You are the DDS task execution agent. Your job is to implement the
code changes described in an atomic task.

## Process
1. Load the task definition (JSON) and description (markdown).
2. Verify all blocked_by tasks have completed execution records.
3. Create a new execution record with status "running".
4. Read the task description's Context section to orient yourself.
5. Follow the Approach section step by step.
6. After implementation, run each acceptance criterion:
   - test/build/lint: execute the verify command.
   - review: self-assess against the rubric.
7. Update the execution record with results.

## Rules
- ONLY modify files listed in scope.files. The hook enforces this,
  but check proactively.
- Follow the Approach section as a plan. Do not deviate unless a
  step is impossible (document why in agent_notes).
- Respect every Execution Constraint listed in the task description.
- If a verify command fails, analyze the output, fix the code, and
  re-run. Do not mark a criterion as "pass" unless the command
  actually exits 0.
- If you cannot pass all criteria after 3 attempts, set status to
  "failed" and document the issue in agent_notes.
- Commit after each logical change. Reference the task ID in the
  commit message: "at-XXXXXXXX: {description}".
```

---

## Slash Commands

Custom commands provide quick access to DDS workflows.

### .claude/commands/validate.md

```markdown
Validate the DDS document at the path provided in $ARGUMENTS.

1. Determine the document level (spec/implementation/atomic_task)
   from the file path.
2. Use the @dds-validator agent to run the full three-ring
   validation pipeline.
3. Report results inline.

If no path is given, validate ALL documents with status "draft" or
"validated".
```

### .claude/commands/decompose-spec.md

```markdown
Decompose the specification at $ARGUMENTS into implementation
documents.

1. Verify the spec has status "validated". If not, run validation
   first using @dds-validator.
2. Use the @dds-decomposer agent to generate implementation
   documents.
3. Run @dds-validator on each new impl doc.
4. Report results.
```

### .claude/commands/decompose-impl.md

```markdown
Decompose the implementation document at $ARGUMENTS into atomic
tasks.

1. Verify the impl doc has status "validated". If not, run
   validation first.
2. Use the @dds-decomposer agent to generate atomic tasks.
3. Run @dds-validator on each new task.
4. Report results.
```

### .claude/commands/execute-task.md

```markdown
Execute the atomic task at $ARGUMENTS.

1. Load the task definition and verify blocked_by tasks are done.
2. Use the @dds-executor agent to implement the task.
3. Report execution results.
```

---

## Operational Workflows

### Workflow 1: Creating a New Spec (Interactive)

This is the only workflow that requires human involvement throughout.

1. Start a Claude Code session.
2. Describe what you want to build. Be as detailed or rough as you like.
3. Claude will interview you to fill gaps, using the spec template structure.
4. When you're satisfied, Claude writes the JSON definition and markdown description.
5. Run `/project:validate specs/definitions/spec-XXXXXXXX.json` to check.
6. Iterate until validation passes.

**Tip:** Start with a rough description and let Claude ask clarifying questions. The spec template's six sections (Overview, Functional Requirements, NFRs, System Constraints, Glossary, Decomposition Guidance) provide the interview structure.

### Workflow 2: Full Pipeline (Automated)

Once a spec is validated, the rest can run autonomously.

```
# Step 1: Decompose spec into impl docs
/project:decompose-spec specs/definitions/spec-XXXXXXXX.json

# Step 2: Decompose each impl doc into tasks
/project:decompose-impl implementation/definitions/impl-XXXXXXXX.json

# Step 3: Execute tasks in order
/project:execute-task tasks/definitions/at-XXXXXXXX.json
```

For fully autonomous execution, chain the commands or use a script.

### Workflow 3: Re-validation After Spec Change

When a spec changes:

1. Edit the spec markdown.
2. Increment the version in the JSON definition.
3. Run `/project:validate` — this will detect the version change and flag downstream docs as stale.
4. Re-run decomposition if needed.

---

## Context Management

Context window management is the primary failure mode in long Claude Code sessions. DDS is designed to support clean context boundaries.

**Use /compact aggressively.** After completing a phase (validation, decomposition, execution), compact context. Preserve: current document IDs, validation status, and pending work.

**One task per session.** For task execution, start a fresh session (or use a subagent) per atomic task. This prevents context from the previous task bleeding into the current one.

**Subagents as context isolation.** The validator, decomposer, and executor subagents each get their own context window. This prevents a validation failure's error output from polluting the decomposition context.

**Read schema docs on demand.** Do not pre-load all five schema documents at session start. Read only the one relevant to the current operation. The DDS skill handles this routing.

**Use /clear between phases.** When switching from decomposition to validation to execution, clear context and re-orient.

---

## Troubleshooting

### "Ring 1 keeps finding the same issues"

The refinement loop has converged. This usually means the fixer prompt is not specific enough for the issue, or the issue requires human judgment. Check the escalation report for the unresolved issues. Common causes:

- **Vague spec requirements** — The fixer can't make them precise because it doesn't know the domain well enough. Fix: edit the spec manually with domain knowledge.
- **Missing codebase context** — Background sections reference files that don't exist yet. Fix: add a note about which files will be created.
- **Rubric too strict** — A Ring 2 check fails on something that's acceptable. Fix: adjust the rubric prompt or accept the document with a manual override.

### "Dependency symmetry keeps failing"

When creating multiple tasks, it's easy to forget one direction. After generating all tasks, run a dedicated symmetry check:

```bash
python3 validation/ring0/check_dependency_symmetry.py tasks/definitions/
```

### "Scope violation blocked my edit"

The PreToolUse hook blocked a file edit because the file isn't in the active task's scope.files. Options:

1. Check if you're working on the right task.
2. If the file genuinely needs to be in scope, update the task definition's scope.files.
3. If it's a shared file (e.g., a project file), consider whether it belongs in a different task's scope.

### "Token usage is very high during validation"

Ring 1 and Ring 2 each make multiple LLM calls. For a spec with 4 impl docs and 20 atomic tasks, a full pipeline run can exceed 100K tokens. Strategies:

- Use incremental validation (only re-validate changed docs).
- Run Ring 0 first and fix all structural issues before spending tokens on LLM checks.
- For Ring 1 cross-document checks, batch sibling documents into fewer calls.

---

## Design Rationale

### Why Separate Subagents Instead of One

Each DDS operation (validate, decompose, execute) has different context needs. A validator needs the schema and the document. A decomposer needs the parent document and target schema. An executor needs the task description and codebase files. Mixing these in one context window wastes tokens and increases the chance of cross-contamination.

### Why Hooks for Scope Enforcement

CLAUDE.md instructions are advisory (~80% adherence). A scope violation that goes undetected could waste an entire execution run. The PreToolUse hook catches it 100% of the time with exit code 2, which Claude Code respects unconditionally.

### Why Skills Instead of Inlining in CLAUDE.md

DDS schema knowledge is only needed during DDS operations. Inlining it in CLAUDE.md would add 200+ lines that Claude reads every session, including sessions where DDS is irrelevant. Skills load on demand, keeping non-DDS sessions lean.

### Why Slash Commands Wrap Subagent Invocations

Commands provide a discoverable entry point (`/project:validate`) that delegates to the right subagent with the right context. Without commands, users would need to remember subagent names and manually set up context.
