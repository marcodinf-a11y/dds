/**
 * Ring 1 semantic check prompt templates for specification documents.
 *
 * Each function builds a fully-formed prompt string for LLM-based validation.
 * Functions are pure — no LLM calls, no I/O.
 */

/**
 * R1-S01: Internal terminology consistency.
 * Checks that terms are used consistently throughout the spec —
 * same concept uses same words, different concepts use different words.
 */
export function buildR1S01Prompt(specMarkdown: string): string {
  return `You are a specification reviewer. Analyze the following specification document for internal terminology consistency.

Scan the document for terms that are used inconsistently: the same concept referred to by different words, or the same word used to mean different things. Focus on domain terms, component names, and technical vocabulary.

<spec-content>
${specMarkdown}
</spec-content>

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R1-S01",
  "verdict": "pass" or "fail",
  "issues": ["description of each inconsistency found"]
}

Set verdict to "pass" if all terminology is used consistently throughout the document. Set verdict to "fail" if any inconsistencies are found, and list each one in the issues array. If there are no issues, set issues to an empty array.`;
}

/**
 * R1-S02: Requirement atomicity.
 * Checks that each FR-XX and NFR-XX defines exactly one testable requirement,
 * not compound requirements.
 */
export function buildR1S02Prompt(specMarkdown: string): string {
  return `You are a specification reviewer. Analyze the following specification document for requirement atomicity.

Examine each functional requirement (FR-XX) and non-functional requirement (NFR-XX) in the document. Each requirement should define exactly one testable behavior or constraint. Flag any requirement that is compound (contains "and" joining two distinct behaviors), vague, or not independently testable.

<spec-content>
${specMarkdown}
</spec-content>

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R1-S02",
  "verdict": "pass" or "fail",
  "issues": ["description of each non-atomic requirement found"]
}

Set verdict to "pass" if every FR-XX and NFR-XX defines exactly one testable requirement. Set verdict to "fail" if any requirement is compound, vague, or not independently testable, and list each one in the issues array. If there are no issues, set issues to an empty array.`;
}

/**
 * R1-S03: Cross-spec consistency.
 * Checks for contradictions between this spec and related specs.
 * If no related specs are provided, produces an automatic pass.
 */
export function buildR1S03Prompt(specMarkdown: string, relatedSpecMarkdowns: string[]): string {
  if (relatedSpecMarkdowns.length === 0) {
    return `You are a specification reviewer. No related specifications were provided for cross-spec consistency checking.

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R1-S03",
  "verdict": "pass",
  "issues": []
}`;
  }

  const relatedSections = relatedSpecMarkdowns
    .map((content, index) => `<related-spec-${index + 1}>\n${content}\n</related-spec-${index + 1}>`)
    .join("\n\n");

  return `You are a specification reviewer. Analyze the following specification document for consistency with related specifications.

Compare the primary spec against all related specs. Look for contradictions: conflicting definitions, incompatible interfaces, mutually exclusive behaviors, or inconsistent assumptions about shared concepts.

<spec-content>
${specMarkdown}
</spec-content>

${relatedSections}

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R1-S03",
  "verdict": "pass" or "fail",
  "issues": ["description of each contradiction found"]
}

Set verdict to "pass" if no contradictions are found between the primary spec and any related spec. Set verdict to "fail" if any contradictions exist, and list each one in the issues array. If there are no issues, set issues to an empty array.`;
}

/**
 * R1-S04: Decomposition guidance coverage.
 * Checks that the Decomposition Guidance section addresses all functional areas
 * defined as H3 headings under Functional Requirements.
 */
export function buildR1S04Prompt(specMarkdown: string): string {
  return `You are a specification reviewer. Analyze the following specification document to verify that its Decomposition Guidance section covers all functional areas.

First, identify all functional areas by listing every H3 heading (###) found under the Functional Requirements section. Then, check the Decomposition Guidance section to confirm each functional area is addressed — either explicitly mentioned or clearly covered by a described implementation document boundary.

<spec-content>
${specMarkdown}
</spec-content>

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R1-S04",
  "verdict": "pass" or "fail",
  "issues": ["description of each functional area not covered by decomposition guidance"]
}

Set verdict to "pass" if every functional area from the Functional Requirements section is addressed in the Decomposition Guidance. Set verdict to "fail" if any functional area is missing from the guidance, and list each one in the issues array. If there are no issues, set issues to an empty array.`;
}
