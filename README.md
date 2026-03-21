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
├── validation/                  # Validation infrastructure
│   ├── ring0/                   # Structural validators
│   ├── ring1/                   # Semantic check prompts
│   ├── ring2/                   # Quality rubrics
│   └── cross-level/             # Cross-document invariant checkers
└── pipeline/
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

## Usage with Claude Code

DDS is designed to operate with Claude Code using subagents, slash commands, and hooks:

- **`/project:validate <path>`** — Run the three-ring validation pipeline on a document
- **`/project:decompose-spec <path>`** — Decompose a validated spec into implementation documents
- **`/project:decompose-impl <path>`** — Decompose a validated impl doc into atomic tasks
- **`/project:execute-task <path>`** — Execute an atomic task

See [docs/05-agent-guide.md](docs/05-agent-guide.md) for full setup instructions including CLAUDE.md configuration, hooks, subagents, and skills.

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
