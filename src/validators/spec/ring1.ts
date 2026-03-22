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
  "verdict": "pass" | "fail",
  "issues": [
    {
      "reference": "string — section, ID, or line where the issue occurs",
      "description": "string — what specifically is wrong"
    }
  ]
}

If no issues are found, return an empty issues array with verdict "pass".
Set verdict to "fail" if any inconsistencies are found, and list each one in the issues array as an object with reference and description.`;
}

/**
 * R1-S02: Requirement atomicity.
 * Checks that each FR-XX and NFR-XX defines exactly one testable requirement,
 * not compound requirements.
 */
export function buildR1S02Prompt(specMarkdown: string): string {
  return `You are a specification reviewer. Analyze the following specification document for requirement atomicity.

Examine each functional requirement (FR-XX) and non-functional requirement (NFR-XX) in the document. Each requirement should define exactly one testable behavior or constraint.

**What IS atomic (do NOT flag these):**
- A requirement that enumerates values of a single concept (e.g., "status shall be one of: draft, validated, decomposed" — this is one enum, not three requirements)
- A requirement that lists ordered sections or hierarchy levels (e.g., "shall contain these H2 sections in order: A, B, C" — this is one structural rule)
- A requirement that defines a field together with its semantics (e.g., "shall include a verify field containing a shell command that passes on exit code 0" — field and behavior are inseparable)
- A requirement with a clarifying clause that restates or elaborates the main rule without adding an independently testable behavior

**What is NOT atomic (flag these):**
- A requirement that joins two independently testable behaviors with "and" where each could be implemented and verified separately
- A requirement that describes two unrelated side effects of the same trigger that could reasonably be split

<spec-content>
${specMarkdown}
</spec-content>

Respond with ONLY a JSON object in this exact structure (no markdown fencing, no extra text):
{
  "check": "R1-S02",
  "verdict": "pass" | "fail",
  "issues": [
    {
      "reference": "string — the FR-XX or NFR-XX identifier",
      "description": "string — what specifically makes it non-atomic, citing the two independent behaviors"
    }
  ]
}

If no issues are found, return an empty issues array with verdict "pass".
Set verdict to "fail" only if a requirement contains genuinely independent behaviors that should be separate requirements.`;
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
  "verdict": "pass" | "fail",
  "issues": [
    {
      "reference": "string — section, ID, or line where the issue occurs",
      "description": "string — what specifically is wrong"
    }
  ]
}

If no issues are found, return an empty issues array with verdict "pass".
Set verdict to "fail" if any contradictions exist, and list each one in the issues array as an object with reference and description.`;
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
  "verdict": "pass" | "fail",
  "issues": [
    {
      "reference": "string — section, ID, or line where the issue occurs",
      "description": "string — what specifically is wrong"
    }
  ]
}

If no issues are found, return an empty issues array with verdict "pass".
Set verdict to "fail" if any functional area is missing from the guidance, and list each one in the issues array as an object with reference and description.`;
}
