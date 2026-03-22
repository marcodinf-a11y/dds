/**
 * Ring 2 quality rubric prompt templates for specification documents.
 *
 * Each function builds a fully-formed prompt string for LLM-based validation.
 * Functions are pure — no LLM calls, no I/O.
 */

/**
 * R2-S01: Decomposition readiness.
 * Evaluates whether the spec has enough detail to be decomposed into
 * implementation documents without deferring key decisions.
 */
export function buildR2S01Prompt(specMarkdown: string): string {
  return `You are a specification quality reviewer. Evaluate the following specification document for decomposition readiness.

Assess whether the spec provides enough detail to be decomposed into implementation documents. A spec is ready for decomposition if it defines clear component boundaries, specifies interfaces between components, and does not defer key technical or design decisions to the implementation phase.

<spec-content>
${specMarkdown}
</spec-content>

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R2-S01",
  "dimension": "decomposition-readiness",
  "verdict": "pass" or "fail",
  "evidence": "specific observations supporting the verdict",
  "summary": "one-sentence summary of the assessment"
}

Set verdict to "pass" if the spec has enough detail for implementation document decomposition — clear boundaries, defined interfaces, no deferred key decisions. Set verdict to "fail" if key decisions are deferred, boundaries are unclear, or there is insufficient detail for decomposition.`;
}

/**
 * R2-S02: Requirement precision.
 * Evaluates whether all requirements are specific and testable,
 * not vague or ambiguous.
 */
export function buildR2S02Prompt(specMarkdown: string): string {
  return `You are a specification quality reviewer. Evaluate the following specification document for requirement precision.

Assess whether every requirement (FR-XX and NFR-XX) in the spec is specific enough to implement without ambiguity and testable enough to verify. Look for vague language ("should be fast", "user-friendly"), missing quantitative thresholds, undefined edge cases, or requirements that could be interpreted in multiple ways.

<spec-content>
${specMarkdown}
</spec-content>

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R2-S02",
  "dimension": "requirement-precision",
  "verdict": "pass" or "fail",
  "evidence": "specific observations supporting the verdict",
  "summary": "one-sentence summary of the assessment"
}

Set verdict to "pass" if all requirements are specific and testable with no ambiguity. Set verdict to "fail" if any requirement is vague, untestable, or open to multiple interpretations.`;
}

/**
 * R2-S03: Completeness.
 * Evaluates whether the spec covers all aspects of the feature it describes,
 * with no obvious gaps.
 */
export function buildR2S03Prompt(specMarkdown: string): string {
  return `You are a specification quality reviewer. Evaluate the following specification document for completeness.

Assess whether the spec covers all aspects of the feature it describes. Look for missing areas: error handling not addressed, edge cases not considered, integration points not defined, security or performance aspects omitted where relevant, or entire user workflows with gaps.

<spec-content>
${specMarkdown}
</spec-content>

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R2-S03",
  "dimension": "completeness",
  "verdict": "pass" or "fail",
  "evidence": "specific observations supporting the verdict",
  "summary": "one-sentence summary of the assessment"
}

Set verdict to "pass" if no obvious gaps are found and the spec covers the feature comprehensively. Set verdict to "fail" if missing areas are identified, and describe them in the evidence field.`;
}
