import { callClaude, ResolvedConfig } from './claude-cli.js';
import { Ring0RuleResult, Ring1CheckResult, Ring2CheckResult } from '../types/results.js';

// ---------------------------------------------------------------------------
// Fix Prompt Templates (inline, level-agnostic)
// ---------------------------------------------------------------------------

const STRUCTURAL_FIX_SYSTEM_PROMPT = `You are a document structure fixer. The following document has
structural validation failures. Fix ONLY the structural issues
listed below. Do not change content, meaning, or wording beyond
what is necessary to fix the structure.

Rules:
- If a required section is missing, add it with a placeholder
  "[TODO: Fill in {section name}]".
- If sections are in the wrong order, reorder them.
- If the H1 heading doesn't match the expected pattern, fix it.
- If JSON schema validation fails, fix the JSON to conform.
- Do not invent content. Use placeholders where content is needed.

Output the complete revised document.`;

const SEMANTIC_FIX_SYSTEM_PROMPT = `You are a document editor. The following document failed a semantic
consistency check. Fix ONLY the specific issues listed. Do not make
any other changes. Preserve all existing content that was not flagged.

Rules:
- For coverage gaps: add the missing content in the appropriate
  section.
- For contradictions: resolve by aligning with the parent document
  (spec for impl docs, impl doc for atomic tasks).
- For silently dropped items: add them either to Requirements or
  Out of Scope with a note explaining which.
- For scope violations: either adjust the Approach to stay in scope
  or note that the scope definition may need updating (flag for
  human review).

Output the complete revised document.`;

const QUALITY_FIX_SYSTEM_PROMPT = `You are a document editor. The following document failed a quality
check. Fix ONLY the aspects flagged in the evidence below. Do not
make any other changes. Preserve all existing content that was not
flagged.

Rules:
- Make the minimum changes necessary to pass the rubric.
- For vague requirements: make them specific and testable.
- For missing coverage: add the missing error paths or edge cases.
- For insufficient context: add specific file/class/method
  references.
- For vague approach steps: make them concrete with file and method
  names.

Output the complete revised document.`;

// JSON schema for a plain revised-document response from Claude
const REVISED_DOCUMENT_SCHEMA = {
  type: 'object',
  required: ['revised_document'],
  additionalProperties: false,
  properties: {
    revised_document: {
      type: 'string',
      description: 'The complete revised document content.',
    },
  },
};

interface RevisedDocumentResponse {
  revised_document: string;
}

// ---------------------------------------------------------------------------
// Fix Functions
// ---------------------------------------------------------------------------

/**
 * Attempt to fix Ring 0 (structural) validation failures.
 *
 * For each failing rule, attempts a deterministic fix when possible
 * (e.g., trivially missing fields). Falls back to LLM for non-trivial
 * structural issues.
 */
export function fixStructural(
  documentContent: string,
  issues: Ring0RuleResult[],
  documentPath: string,
  config: ResolvedConfig,
): string {
  const failingIssues = issues.filter((i) => !i.passed);

  if (failingIssues.length === 0) {
    return documentContent;
  }

  // Attempt deterministic fixes for simple cases
  let content = documentContent;
  const unresolvedIssues: Ring0RuleResult[] = [];

  for (const issue of failingIssues) {
    const deterministicResult = attemptDeterministicFix(content, issue);
    if (deterministicResult !== null) {
      content = deterministicResult;
    } else {
      unresolvedIssues.push(issue);
    }
  }

  // If all issues were resolved deterministically, return
  if (unresolvedIssues.length === 0) {
    return content;
  }

  // Fall back to LLM for remaining structural issues
  const failuresDescription = unresolvedIssues
    .map((i) => `- [${i.rule}]: ${i.message ?? 'No details'}`)
    .join('\n');

  const prompt = `${STRUCTURAL_FIX_SYSTEM_PROMPT}

Document (file: ${documentPath}):
---
${content}
---

Structural failures:
${failuresDescription}

Return your answer as JSON with a single key "revised_document" containing the complete fixed document.`;

  const response = callClaude<RevisedDocumentResponse>(
    prompt,
    REVISED_DOCUMENT_SCHEMA,
    config,
    config.timeouts.fix_call_seconds,
  );

  return response.revised_document;
}

/**
 * Attempt to fix Ring 1 (semantic) validation failures.
 *
 * Includes the parent document content for alignment context so the
 * LLM can resolve contradictions and coverage gaps by reference.
 */
export function fixSemantic(
  documentContent: string,
  issues: Ring1CheckResult[],
  parentContent: string,
  config: ResolvedConfig,
): string {
  const failingIssues = issues.filter((i) => i.verdict === 'fail');

  if (failingIssues.length === 0) {
    return documentContent;
  }

  const issuesDescription = failingIssues
    .map((i) => {
      const issueList =
        i.issues.length > 0 ? i.issues.map((d) => `    - ${d}`).join('\n') : '    (no details)';
      return `- [${i.check}] verdict=${i.verdict}\n${issueList}`;
    })
    .join('\n');

  const prompt = `${SEMANTIC_FIX_SYSTEM_PROMPT}

Document:
---
${documentContent}
---

Parent document (for alignment reference):
---
${parentContent}
---

Issues to fix:
${issuesDescription}

Return your answer as JSON with a single key "revised_document" containing the complete fixed document.`;

  const response = callClaude<RevisedDocumentResponse>(
    prompt,
    REVISED_DOCUMENT_SCHEMA,
    config,
    config.timeouts.fix_call_seconds,
  );

  return response.revised_document;
}

/**
 * Attempt to fix Ring 2 (quality) validation failures.
 *
 * Requests minimum changes sufficient to pass each failing rubric
 * dimension.
 */
export function fixQuality(
  documentContent: string,
  issues: Ring2CheckResult[],
  config: ResolvedConfig,
): string {
  const failingIssues = issues.filter((i) => i.verdict === 'fail');

  if (failingIssues.length === 0) {
    return documentContent;
  }

  const issuesDescription = failingIssues
    .map(
      (i) =>
        `- [${i.check}] dimension="${i.dimension}" verdict=${i.verdict}\n    evidence: ${i.evidence}\n    summary: ${i.summary}`,
    )
    .join('\n');

  const prompt = `${QUALITY_FIX_SYSTEM_PROMPT}

Document:
---
${documentContent}
---

Quality failures:
${issuesDescription}

Return your answer as JSON with a single key "revised_document" containing the complete fixed document.`;

  const response = callClaude<RevisedDocumentResponse>(
    prompt,
    REVISED_DOCUMENT_SCHEMA,
    config,
    config.timeouts.fix_call_seconds,
  );

  return response.revised_document;
}

// ---------------------------------------------------------------------------
// Deterministic Fix Helpers
// ---------------------------------------------------------------------------

/**
 * Attempt a deterministic (non-LLM) fix for a single Ring 0 rule failure.
 * Returns the fixed document content, or null if the issue requires LLM help.
 */
function attemptDeterministicFix(
  content: string,
  issue: Ring0RuleResult,
): string | null {
  const rule = issue.rule;
  const message = issue.message ?? '';

  // Try to fix missing JSON fields by parsing and adding them
  if (isJsonDocument(content) && isJsonSchemaIssue(rule, message)) {
    return attemptJsonFieldFix(content, message);
  }

  // Try to fix markdown section ordering or missing sections
  if (isMarkdownDocument(content) && isMarkdownStructureIssue(rule, message)) {
    return attemptMarkdownSectionFix(content, message);
  }

  // Cannot fix deterministically
  return null;
}

function isJsonDocument(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isMarkdownDocument(content: string): boolean {
  return content.trim().startsWith('#');
}

function isJsonSchemaIssue(rule: string, message: string): boolean {
  const jsonRules = ['R0-S01', 'R0-I40', 'R0-T01'];
  return (
    jsonRules.includes(rule) ||
    message.toLowerCase().includes('required') ||
    message.toLowerCase().includes('schema')
  );
}

function isMarkdownStructureIssue(rule: string, message: string): boolean {
  const mdRules = [
    'R0-S10', 'R0-S11', 'R0-S12', 'R0-S13', 'R0-S14',
    'R0-I60', 'R0-I61', 'R0-I62', 'R0-I63', 'R0-I64',
    'R0-T20', 'R0-T21', 'R0-T22', 'R0-T23', 'R0-T24',
  ];
  return (
    mdRules.includes(rule) ||
    message.toLowerCase().includes('section') ||
    message.toLowerCase().includes('heading')
  );
}

/**
 * Attempt to add missing required fields to a JSON document.
 * Returns the fixed JSON string, or null if the fix is non-trivial.
 */
function attemptJsonFieldFix(content: string, message: string): string | null {
  try {
    const obj = JSON.parse(content);
    if (typeof obj !== 'object' || obj === null) return null;

    // Extract field name from messages like "must have required property 'xyz'"
    const match = message.match(/required property '(\w+)'/);
    if (!match) return null;

    const field = match[1];
    if (field in obj) return null; // Field exists, issue is something else

    // Add placeholder values for known field types
    const placeholders: Record<string, unknown> = {
      blocked_by: [],
      blocks: [],
      context_refs: [],
      scope: { files: [], modules: [] },
    };

    if (field in placeholders) {
      obj[field] = placeholders[field];
    } else {
      // Use a string placeholder for unknown fields
      obj[field] = `[TODO: Fill in ${field}]`;
    }

    return JSON.stringify(obj, null, 2);
  } catch {
    return null;
  }
}

/**
 * Attempt to fix missing markdown sections by appending placeholders.
 * Returns the fixed content, or null if the fix is non-trivial.
 */
function attemptMarkdownSectionFix(
  content: string,
  message: string,
): string | null {
  // Extract missing section name from messages like "missing section 'Objective'"
  const match = message.match(/missing\s+(?:section|heading)\s+'([^']+)'/i);
  if (!match) return null;

  const sectionName = match[1];

  // Check if the section already exists (case-insensitive)
  const sectionPattern = new RegExp(`^## ${sectionName}\\s*$`, 'im');
  if (sectionPattern.test(content)) return null;

  // Append the missing section
  const placeholder = `\n\n## ${sectionName}\n\n[TODO: Fill in ${sectionName}]\n`;
  return content.trimEnd() + placeholder;
}
