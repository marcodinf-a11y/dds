/**
 * Ring 2 — Quality Rubric prompt templates for implementation document
 * validation.
 *
 * Each function builds a complete prompt string for one Ring 2 check (R2-I10
 * through R2-I15). The pipeline engine prepends the shared Ring 2 system
 * prompt, invokes the LLM, and parses the structured JSON result.
 *
 * All functions follow the signature:
 *   (documentContent: string, additionalContext?: string) => string
 *
 * Each prompt instructs the LLM to return JSON with
 * { check, dimension, verdict, evidence, summary } fields.
 */

function formatResponseInstruction(ruleId: string, dimension: string): string {
  return `Respond with valid JSON matching this schema:
{
  "check": "${ruleId}",
  "dimension": "${dimension}",
  "verdict": "pass" | "fail",
  "evidence": [
    {
      "reference": "string — section or element assessed",
      "finding": "string — what you observed",
      "assessment": "pass" | "fail"
    }
  ],
  "summary": "string — one-sentence overall assessment"
}`;
}

/**
 * R2-I10: Decomposability — can this implementation document be broken
 * into 3-8 atomic tasks?
 */
export function buildDecomposabilityPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Dimension: Can this implementation document be broken into 3-8 atomic tasks?

Document:
${documentContent}
${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

Rubric:
- PASS if: The Suggested Task Boundaries section identifies 3-8
  distinct, coherent units of work with clear file boundaries.
- FAIL if: Fewer than 3 suggests the doc is too granular and should
  be an atomic task or merged with a sibling. More than 8 suggests
  it should be split into multiple implementation docs.

Estimate the likely task count and flag if outside the 3-8 range.

${formatResponseInstruction('R2-I10', 'Decomposability')}`;
}

/**
 * R2-I11: Requirement testability — is each REQ-XX entry concrete enough
 * to write an acceptance criterion for?
 */
export function buildRequirementTestabilityPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Dimension: Is each REQ-XX entry concrete enough to write an acceptance criterion for?

Document:
${documentContent}
${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

Rubric:
- For each REQ-XX, assess whether you could write a specific test
  or check that produces a binary pass/fail result.
- PASS if: All requirements specify observable behavior with clear
  conditions.
- FAIL if: Any requirement is vague ("handle errors appropriately"),
  unmeasurable, or would require subjective judgment to verify.

Assess each requirement individually.

${formatResponseInstruction('R2-I11', 'Requirement testability')}`;
}

/**
 * R2-I12: Background sufficiency — does the Background section provide
 * enough context for a decomposition agent to determine file boundaries
 * and module structure without exploring the codebase?
 */
export function buildBackgroundSufficiencyPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Dimension: Does the Background section provide enough context for a decomposition agent to determine file boundaries and module structure without exploring the codebase?

Document:
${documentContent}
${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

Rubric:
- PASS if: Background names specific files, classes, namespaces,
  and patterns. A decomposition agent could determine scope.files
  for each task without reading the actual source code.
- FAIL if: Background uses vague references ("the service layer",
  "existing patterns") without naming concrete files and classes.

List any areas where an agent would need to guess or explore.

${formatResponseInstruction('R2-I12', 'Background sufficiency')}`;
}

/**
 * R2-I13: Design decision completeness — are there architectural choices
 * implied by the Requirements that are NOT explicitly stated in Design
 * Decisions?
 */
export function buildDesignDecisionCompletenessPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Dimension: Are there architectural choices implied by the Requirements that are NOT explicitly stated in Design Decisions?

Document:
${documentContent}
${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

Rubric:
- PASS if: Every choice that would affect how atomic tasks are
  implemented is explicitly decided.
- FAIL if: A decomposition agent would need to make architectural
  decisions on its own (e.g., which pattern to use for error handling,
  whether to use async/await, how to structure the polling loop).

List any implicit decisions the decomposition agent would face.

${formatResponseInstruction('R2-I13', 'Design decision completeness')}`;
}

/**
 * R2-I14: Boundary clarity — are the boundaries of this implementation
 * document clear enough that two different people would agree on what
 * is and is not included?
 */
export function buildBoundaryPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Dimension: Are the boundaries of this implementation document clear enough that two different people would agree on what is and is not included?

Document:
${documentContent}
${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

Rubric:
- PASS if: Requirements and Out of Scope together create an
  unambiguous boundary.
- FAIL if: Any behavior could reasonably be argued to be either
  in scope or out of scope.

List any ambiguous boundary items.

${formatResponseInstruction('R2-I14', 'Boundary clarity')}`;
}

/**
 * R2-I15: Decomposition notes quality — are the Decomposition Notes
 * specific and actionable?
 */
export function buildDecompositionNotesQualityPrompt(
  documentContent: string,
  additionalContext?: string,
): string {
  return `Dimension: Are the Decomposition Notes specific and actionable?

Document:
${documentContent}
${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

Rubric:
- PASS if: Suggested Task Boundaries cover all REQ-XX entries,
  Ordering Rationale is specific about which tasks depend on which
  and why, and Decomposition Constraints are concrete and verifiable.
- FAIL if: Task boundaries are vague, ordering rationale is generic,
  or constraints are aspirational rather than enforceable.

Assess each subsection separately.

${formatResponseInstruction('R2-I15', 'Decomposition notes quality')}`;
}
