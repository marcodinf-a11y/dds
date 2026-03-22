/**
 * Ring 1 — Semantic Consistency prompt templates for implementation document
 * validation.
 *
 * Each function builds a complete prompt string for one Ring 1 check (R1-I10
 * through R1-I15). The pipeline engine prepends the shared Ring 1 system
 * prompt, invokes the LLM, and parses the structured JSON result.
 *
 * All functions follow the signature:
 *   (documentContent: string, additionalContext?: string) => string
 *
 * Each prompt asks exactly one question and instructs the LLM to return JSON
 * with { check, verdict, issues } fields.
 */

function formatResponseInstruction(ruleId: string): string {
  return `Respond with valid JSON matching this schema:
{
  "check": "${ruleId}",
  "verdict": "pass" | "fail",
  "issues": [
    {
      "reference": "string — section, ID, or line where the issue occurs",
      "description": "string — what specifically is wrong"
    }
  ]
}

If no issues are found, return an empty issues array with verdict "pass".`;
}

/**
 * R1-I10: Spec coverage — does the implementation document cover all
 * requirements from its referenced spec sections?
 *
 * additionalContext: spec section contents referenced by this impl doc.
 */
export function buildSpecCoveragePrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Check: Does the implementation document cover all requirements from its referenced spec sections?

Documents provided:
- Spec sections:
${additionalContext ?? '(none provided)'}

- Implementation description:
${documentContent}

Question: For each FR-XX or NFR-XX in the provided spec sections, determine whether it is:
(a) addressed by a REQ-XX in the implementation document's Requirements section, or
(b) explicitly excluded in the Out of Scope section.

Report any spec requirement that is neither addressed nor excluded.

${formatResponseInstruction('R1-I10')}`;
}

/**
 * R1-I11: Out of scope consistency — are all spec items accounted for,
 * either in Requirements or Out of Scope?
 *
 * additionalContext: spec section contents referenced by this impl doc.
 */
export function buildOutOfScopeConsistencyPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Check: Are all spec items accounted for — either in Requirements or Out of Scope?

Documents provided:
- Spec sections:
${additionalContext ?? '(none provided)'}

- Implementation description:
${documentContent}

Question: Find any requirement or behavior from the spec sections that appears in neither the Requirements section nor the Out of Scope section. These are silently dropped items.

Report each silently dropped item as an issue.

${formatResponseInstruction('R1-I11')}`;
}

/**
 * R1-I12: Design decision coherence — do design decisions align with
 * established patterns described in the Background section?
 *
 * additionalContext: optional extra context (e.g., codebase patterns).
 */
export function buildDesignDecisionCoherencePrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Check: Do design decisions align with established patterns?

Documents provided:
- Implementation description:
${documentContent}
${additionalContext ? `\n- Additional context:\n${additionalContext}` : ''}

Question: For each design decision in the Design Decisions section, check whether it contradicts any pattern, convention, or architectural approach described in the Background section. Report contradictions.

${formatResponseInstruction('R1-I12')}`;
}

/**
 * R1-I13: Dependency completeness — are all prerequisites listed as
 * dependencies?
 *
 * additionalContext: optional extra context (e.g., known impl doc IDs).
 */
export function buildDependencyCompletenessPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Check: Are all prerequisites listed as dependencies?

Documents provided:
- Implementation description:
${documentContent}
${additionalContext ? `\n- Additional context:\n${additionalContext}` : ''}

Question: Find any external system, library, type, interface, or other implementation document mentioned in Background or implied by Requirements that is not listed in the Dependencies section. Report each missing dependency.

${formatResponseInstruction('R1-I13')}`;
}

/**
 * R1-I14: Decomposition coverage — do the atomic tasks fully cover the
 * implementation requirements?
 *
 * NOTE: This check applies only when the implementation document's status
 * is "decomposed". If the document is in "draft" or "validated" status,
 * this check should be skipped by the pipeline engine.
 *
 * additionalContext: concatenated atomic task descriptions for this impl doc.
 */
export function buildDecompositionCoveragePrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Check: Do the atomic tasks fully cover the implementation requirements?

NOTE: This check applies only when the implementation document's status is "decomposed". If the document has not been decomposed into atomic tasks, skip this check.

Documents provided:
- Implementation description:
${documentContent}

- Atomic task descriptions:
${additionalContext ?? '(none provided — this check may not apply if the document is not yet decomposed)'}

Question: For each REQ-XX in the implementation document, determine whether at least one atomic task addresses it. Report any requirement not covered by any task.

${formatResponseInstruction('R1-I14')}`;
}

/**
 * R1-I15: Cross-implementation contradiction — does this impl doc
 * contradict sibling impl docs?
 *
 * additionalContext: design decisions from sibling implementation documents
 * (those sharing at least one spec_sections entry).
 */
export function buildCrossImplementationContradictionPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Check: Are design decisions consistent across sibling implementation docs?

Documents provided:
- This document's Design Decisions (extracted from the implementation description below):
${documentContent}

- Sibling documents' Design Decisions:
${additionalContext ?? '(no sibling documents provided)'}

Question: Find any design decision in this document that contradicts a design decision in a sibling implementation document (one that shares at least one spec_sections entry). Report each contradiction with references to both documents.

${formatResponseInstruction('R1-I15')}`;
}
