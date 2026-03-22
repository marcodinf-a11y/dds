import type { TaskDefinition, ImplDefinition } from '../../types/definitions.js';

export interface TaskGenerationParams {
  implJson: string;
  implMarkdown: string;
  specSectionsContent: string;
  codebaseContext: string;
  buildCommand: string;
  testCommand: string;
  lintCommand: string;
}

export function buildTaskGenerationSystemPrompt(): string {
  return `You are an atomic task generator for the Document Decomposition System
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
1. The JSON definition in a \`\`\`json code block.
2. The full markdown description starting with the H1 heading.

Separate tasks with a horizontal rule (---).
Output tasks in execution order (respecting dependencies).`;
}

export function buildTaskGenerationUserPrompt(params: TaskGenerationParams): string {
  return `Decompose the following validated implementation document into
atomic tasks.

Implementation JSON:
${params.implJson}

Implementation Markdown:
${params.implMarkdown}

Parent Specification (relevant sections):
${params.specSectionsContent}

Codebase context (existing files, patterns, types):
${params.codebaseContext}

Build/test commands for this project:
- Build: ${params.buildCommand}
- Test: ${params.testCommand}
- Lint/Arch: ${params.lintCommand}`;
}
