/**
 * Ring 1 — Semantic Consistency prompt templates for atomic task validation.
 *
 * Each function builds a complete prompt string for one Ring 1 check (R1-T01
 * through R1-T04). The pipeline engine prepends the shared Ring 1 system
 * prompt, invokes the LLM, and parses the structured JSON result.
 */

/**
 * R1-T01: Coverage completeness — do the atomic tasks fully cover their
 * parent implementation doc?
 */
export function buildCoverageCompletenessPrompt(
  implContent: string,
  taskDescriptions: string[],
): string {
  const joined = taskDescriptions
    .map((d, i) => `--- Task ${i + 1} ---\n${d}`)
    .join('\n\n');

  return `Check: Do the atomic tasks fully cover their parent implementation doc?

Documents provided:
- Parent implementation description:
${implContent}

- All child atomic task descriptions:
${joined}

Question: List every requirement, behavior, and deliverable described
in the parent implementation document. For each, determine whether at
least one atomic task addresses it. Report any item not covered.`;
}

/**
 * R1-T02: Contradiction detection — do any sibling atomic tasks make
 * contradictory assumptions?
 */
export function buildContradictionDetectionPrompt(
  taskDescriptions: string[],
): string {
  const joined = taskDescriptions
    .map((d, i) => `--- Task ${i + 1} ---\n${d}`)
    .join('\n\n');

  return `Check: Do any sibling atomic tasks make contradictory assumptions?

Documents provided:
- Sibling atomic task descriptions (same parent):
${joined}

Question: Compare the Context, Approach, and Constraints sections
across all sibling tasks. Find any case where:
(a) two tasks modify the same method or class in incompatible ways,
(b) one task's Approach assumes something that another task's
    Constraints forbid, or
(c) two tasks make different assumptions about the same interface.

Report each contradiction with references to both tasks.`;
}

/**
 * R1-T03: Scope coherence — does the approach stay within the declared
 * file scope?
 */
export function buildScopeCoherencePrompt(
  scopeFiles: string[],
  approach: string,
): string {
  const filesList = scopeFiles.map((f) => `- ${f}`).join('\n');

  return `Check: Does the approach stay within the declared file scope?

Documents provided:
- Task definition scope.files:
${filesList}

- Task description Approach section:
${approach}

Question: Parse every file, class, or namespace referenced in the
Approach section. Report any reference to a file that is not in the
declared scope.files list.`;
}

/**
 * R1-T04: Dependency correctness — are task dependencies correctly
 * declared?
 */
export function buildDependencyCorrectnessPrompt(
  taskContent: string,
  dependencyDescriptions: string[],
): string {
  const joined = dependencyDescriptions
    .map((d, i) => `--- Dependency ${i + 1} ---\n${d}`)
    .join('\n\n');

  return `Check: Are task dependencies correctly declared?

Documents provided:
- This task's description:
${taskContent}

- Descriptions of all tasks in blocked_by:
${joined}

Question: Find any type, method, interface, or code artifact
referenced in this task's Context or Approach that:
(a) does not exist in the current codebase (as described), AND
(b) is not produced by any task listed in blocked_by.

Report each unresolved dependency.`;
}
