/**
 * Ring 2 — Quality Rubric prompt templates for atomic task validation.
 *
 * Each function builds a complete prompt string for one Ring 2 check (R2-T01
 * through R2-T05). The pipeline engine prepends the shared Ring 2 system
 * prompt, invokes the LLM, and parses the structured JSON result.
 */

/**
 * R2-T01: Actionability — could an agent execute this task without
 * clarification?
 */
export function buildActionabilityPrompt(taskDescription: string): string {
  return `Dimension: Could an agent execute this task without clarification?

Rubric:
- PASS if: The Approach section provides enough detail that an agent
  can implement each step using only the description and the files
  in scope. No ambiguities.
- FAIL if: Any step requires the agent to make a judgment call,
  explore the codebase, or guess at intent.

List any ambiguities found.

Document:
${taskDescription}`;
}

/**
 * R2-T02: Scope boundedness — is this task small enough for a single
 * agent session?
 */
export function buildScopeBoundednessPrompt(
  taskDescription: string,
): string {
  return `Dimension: Is this task small enough for a single agent session?

Rubric:
- PASS if: The task requires 5 or fewer distinct code changes.
- FAIL if: More than 5 distinct changes needed, suggesting the
  task should be split.

Estimate the number of distinct changes and flag if over 5.

Document:
${taskDescription}`;
}

/**
 * R2-T03: Approach specificity — does every step name a concrete
 * file, class, or method?
 */
export function buildApproachSpecificityPrompt(approach: string): string {
  return `Dimension: Does every step name a concrete file, class, or method?

Rubric:
- PASS if: Every step in the Approach section references at least
  one specific file, class, method, or type.
- FAIL if: Any step is vague or architectural ("implement error
  handling", "add tests").

List any vague steps.

Document:
${approach}`;
}

/**
 * R2-T04: Constraint testability — can each constraint be verified?
 */
export function buildConstraintTestabilityPrompt(
  constraints: string,
): string {
  return `Dimension: Can each constraint be verified?

Rubric:
- PASS if: Each constraint can be checked by a machine (diff
  analysis, grep, test run) or by a targeted LLM code review.
- FAIL if: Any constraint is subjective ("code should be clean")
  or unverifiable.

Assess each constraint individually.

Document:
${constraints}`;
}

/**
 * R2-T05: Criterion completeness — do acceptance criteria cover all
 * behavioral changes?
 */
export function buildCriterionCompletenessPrompt(
  approach: string,
  criteria: string,
): string {
  return `Dimension: Do acceptance criteria cover all behavioral changes?

Rubric:
- PASS if: Every behavior described in the Approach section has a
  corresponding acceptance criterion.
- FAIL if: Any behavior is untested or unverified.

List any gaps.

Approach:
${approach}

Acceptance criteria:
${criteria}`;
}
