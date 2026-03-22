# DDS — Document Decomposition System

A structured pipeline that transforms human-written specifications into validated, agent-executable atomic tasks. DDS progressively decomposes documents through three levels — specifications, implementation documents, and atomic tasks — with a three-ring validation pipeline ensuring quality at every stage.

## How It Works

```
Specification (human-authored)
  └── Implementation Document (auto-generated, ~1 feature)
        └── Atomic Task (auto-generated, ~1 coding session)
```

1. **Write a Specification** — Describe what needs to be built using the structured spec template (overview, functional requirements, NFRs, constraints, glossary, decomposition guidance).
2. **Validate** — The spec passes through three validation rings: structural (deterministic), semantic consistency (LLM-based), and quality rubric (LLM-based).
3. **Decompose into Implementation Documents** — Each impl doc covers a coherent feature boundary, with requirements traced back to the spec.
4. **Decompose into Atomic Tasks** — Each task is small enough for a coding agent to execute in a single session, with enforced file scope, dependency ordering, and acceptance criteria.
5. **Execute** — Agents pick up atomic tasks and implement them, with results tracked in execution records.

## Validation Pipeline

Every document passes through three rings before promotion:

| Ring | Type | Purpose |
|------|------|---------|
| **Ring 0** | Deterministic | JSON schema validation, markdown structure, dependency graph checks |
| **Ring 1** | LLM-based | Terminology consistency, requirement coverage, cross-document coherence |
| **Ring 2** | LLM-based | Decomposability, precision, completeness, actionability rubrics |

A refinement loop automatically fixes issues and re-validates. Documents that can't be resolved are escalated for human review.

## Document Hierarchy

### Specifications
The root document. Human-authored with chatbot assistance. Contains functional requirements, non-functional requirements, system constraints, a glossary, and decomposition guidance.

### Implementation Documents
Derived from specifications. Each describes a coherent unit of functionality with traced requirements, design decisions, explicit out-of-scope boundaries, and decomposition notes for the next level.

### Atomic Tasks
The leaf level. Each task includes:
- **Scope** — Exhaustive list of files the agent may modify (enforced by hooks)
- **Acceptance Criteria** — Machine-verifiable (`test`, `build`, `lint`) and LLM-judged (`review`) criteria
- **Dependency Graph** — `blocked_by`/`blocks` with enforced symmetry
- **Execution Records** — Runtime tracking of status, commits, and criterion results

## Project Structure

```
dds/
├── docs/                        # System documentation
│   ├── 01-spec-schema.md        # Specification format and validation rules
│   ├── 02-implementation-doc-schema.md  # Implementation doc format
│   ├── 03-atomic-task-schema.md # Atomic task format
│   ├── 04-validation-pipeline.md # Pipeline orchestration
│   └── 05-agent-guide.md       # Operational guide for Claude Code
├── src/                         # Pipeline implementation
│   ├── cli/                     # CLI entry points
│   ├── llm/                     # LLM invocation (claude-cli, fix, ring1/2 runners)
│   ├── parsers/                 # Markdown and graph utilities
│   ├── pipeline/                # Orchestrator, refinement loop, convergence, escalation
│   ├── schemas/                 # JSON schemas for all artifact types
│   ├── types/                   # TypeScript type definitions
│   └── validators/              # Ring 0/1/2 validators per level + cross-level
├── tests/                       # Unit tests and fixtures
├── specs/                       # Specification artifacts
│   ├── definitions/             # JSON definitions
│   └── descriptions/            # Markdown descriptions
├── implementation/              # Implementation document artifacts
│   ├── definitions/
│   └── descriptions/
├── tasks/                       # Atomic task artifacts
│   ├── definitions/
│   ├── descriptions/
│   └── executions/              # Runtime execution records
└── pipeline/
    ├── config.json              # Pipeline configuration (optional)
    ├── reports/                 # Pipeline run summaries
    └── escalations/             # Unresolved issue reports
```

## ID Format

All IDs use 8 random hex characters with a type prefix. No central counter, no coordination needed.

| Type | Pattern | Example |
|------|---------|---------|
| Specification | `spec-[0-9a-f]{8}` | `spec-e8a2b4c6` |
| Implementation Doc | `impl-[0-9a-f]{8}` | `impl-c9d2f4a1` |
| Atomic Task | `at-[0-9a-f]{8}` | `at-a1b2c3d4` |
| Acceptance Criterion | `ac-[0-9a-f]{8}` | `ac-d4e5f6a7` |

Generate with: `openssl rand -hex 4`

## Getting Started

```bash
npm install
```

### Run the Full Pipeline

Validate a spec, decompose it into impl docs, decompose those into atomic tasks, and run cross-level checks — all in one command:

```bash
npx tsx src/cli/run-pipeline.ts <spec-id>
```

Example: `npx tsx src/cli/run-pipeline.ts spec-fa3a90b8`

The pipeline runs four phases sequentially and halts at the first escalation:
1. Validate the root spec (Ring 0 → Ring 1 → Ring 2, with auto-fix)
2. Decompose spec into impl docs, validate each
3. Decompose impl docs into atomic tasks, validate each, check cross-task invariants
4. Run all cross-level invariants (CL-S, CL-T, CL-F)

Exit code 0 = all phases passed. Exit code 1 = escalation (see `pipeline/escalations/`).

### Validate Individual Documents

```bash
# Validate a spec (Ring 0 structural checks)
npx tsx src/cli/validate-spec.ts <spec-id>

# Validate an implementation document
npx tsx src/cli/validate-impl.ts <impl-id>

# Validate an atomic task
npx tsx src/cli/validate-task.ts <task-id>

# Run cross-level invariants for a spec and all its descendants
npx tsx src/cli/validate-cross.ts <spec-id>
```

Each validator loads the JSON definition from `{type}/definitions/{id}.json` and the markdown description from `{type}/descriptions/{id}.md`, runs Ring 0 checks, and exits 0 (pass) or 1 (fail) with a JSON report on stdout.

### Refine a Document

Run the full validation + auto-fix loop on a single document:

```bash
npx tsx src/cli/refine.ts <document-path> <level>
```

Where `<level>` is `spec`, `impl`, or `task`. The refinement loop runs Ring 0 → Ring 1 → Ring 2, auto-fixes failures, and retries until the document passes or convergence is detected (same issues repeating). Escalation reports are written to `pipeline/escalations/`.

### Scope Guard

Check whether a file path is within an atomic task's declared scope:

```bash
npx tsx src/cli/scope-guard.ts <file-path> <task-id>
```

Exit code 0 = allowed, 1 = blocked. Intended for use in pre-commit hooks to enforce file scope during task execution.

## Configuration

Pipeline behavior is controlled by `pipeline/config.json`. All fields are optional — omit any to use defaults.

```json
{
  "refinement": {
    "max_iterations": 5,
    "convergence_threshold": 0.7
  },
  "timeouts": {
    "ring1_check_seconds": 60,
    "ring2_check_seconds": 90,
    "fix_call_seconds": 120
  },
  "claude_cli": {
    "max_retries_on_short_429": 3,
    "backoff_multiplier": 2,
    "delay_between_calls_ms": 2000
  }
}
```

Schema: [`src/schemas/pipeline-config.schema.json`](src/schemas/pipeline-config.schema.json)

## Prerequisites

- **Node.js** (v18+)
- **Claude CLI** (`claude`) — required for Ring 1/2 checks, fix functions, and decomposition. Ring 0 validation works without it.

## Usage with Claude Code

DDS is designed to also operate with Claude Code using subagents, slash commands, and hooks. See [docs/05-agent-guide.md](docs/05-agent-guide.md) for setup instructions including CLAUDE.md configuration, hooks, subagents, and skills.

## Documentation

| Document | Description |
|----------|-------------|
| [Specification Schema](docs/01-spec-schema.md) | Spec format, validation rules, and generation prompt |
| [Implementation Doc Schema](docs/02-implementation-doc-schema.md) | Impl doc format, validation rules, and generation prompt |
| [Atomic Task Schema](docs/03-atomic-task-schema.md) | Task format, acceptance criteria types, execution records |
| [Validation Pipeline](docs/04-validation-pipeline.md) | Refinement loop, convergence detection, escalation handling |
| [Agent Guide](docs/05-agent-guide.md) | Claude Code setup, subagents, hooks, and workflows |

## License

[MIT](LICENSE)
