import { createRequire } from 'node:module';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = addFormatsModule as any;
import type { SpecDefinition } from '../../types/definitions.js';
import type { Ring0Result, Ring0RuleResult } from '../../types/results.js';
import { extractHeadings } from '../../parsers/markdown.js';

const Ajv = AjvModule.default ?? AjvModule;
const require = createRequire(import.meta.url);
const specSchema = require('../../schemas/spec.schema.json') as Record<string, unknown>;

// --- Module-level ajv instance and compiled validator ---

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(specSchema);

// --- Required H2 sections in order ---

const REQUIRED_H2_SECTIONS = [
  'Overview',
  'Functional Requirements',
  'Non-Functional Requirements',
  'System Constraints',
  'Glossary',
  'Decomposition Guidance',
] as const;

// --- Helper ---

function checkRule(rule: string, passed: boolean, message?: string): Ring0RuleResult {
  return { rule, passed, message };
}

// --- Spec Ring 0 Validator ---

export function validateSpecRing0(spec: SpecDefinition, markdown: string): Ring0Result {
  const results: Ring0RuleResult[] = [];

  // R0-S01: JSON conforms to SpecificationDefinition schema (use ajv)
  const schemaValid = validateSchema(spec);
  results.push(
    checkRule(
      'R0-S01',
      !!schemaValid,
      schemaValid
        ? 'Spec JSON validates against schema'
        : `Schema validation failed: ${ajv.errorsText(validateSchema.errors)}`,
    ),
  );

  // R0-S02: id is unique (trivially true in single-document mode)
  results.push(
    checkRule(
      'R0-S02',
      true,
      'ID uniqueness check passes in single-document mode (cross-doc uniqueness is a pipeline concern)',
    ),
  );

  // R0-S03: description field matches filename pattern spec-[0-9a-f]{8}.md
  const descPattern = /^spec-[0-9a-f]{8}\.md$/;
  const descValid = descPattern.test(spec.description);
  results.push(
    checkRule(
      'R0-S03',
      descValid,
      descValid
        ? `description "${spec.description}" matches required pattern`
        : `description "${spec.description}" does not match pattern spec-XXXXXXXX.md`,
    ),
  );

  // R0-S04: No self-reference in related_specs
  const relatedSpecs = spec.related_specs ?? [];
  const hasSelfRef = relatedSpecs.includes(spec.id);
  results.push(
    checkRule(
      'R0-S04',
      !hasSelfRef,
      hasSelfRef
        ? `Self-reference found: spec.id "${spec.id}" appears in related_specs`
        : 'No self-reference in related_specs',
    ),
  );

  // --- Markdown checks ---
  const headings = extractHeadings(markdown);
  const h1s = headings.filter((h) => h.level === 1);
  const h2s = headings.filter((h) => h.level === 2);
  const h1 = h1s[0];

  // R0-S05: Markdown starts with H1 matching # {spec-id}: {title}
  const expectedH1Text = `${spec.id}: ${spec.title}`;
  const h1Valid = h1 !== undefined && h1.text === expectedH1Text;
  results.push(
    checkRule(
      'R0-S05',
      h1Valid,
      h1Valid
        ? 'H1 matches expected pattern'
        : `H1 mismatch. Expected "${expectedH1Text}", got "${h1?.text ?? '(none)'}"`,
    ),
  );

  // R0-S06: Markdown contains exactly six H2 sections
  const hasExactlySixH2 = h2s.length === 6;
  results.push(
    checkRule(
      'R0-S06',
      hasExactlySixH2,
      hasExactlySixH2
        ? 'Exactly 6 H2 sections found'
        : `Expected 6 H2 sections, found ${h2s.length}`,
    ),
  );

  // R0-S07: H2 sections match required names in order
  const h2Texts = h2s.map((h) => h.text);
  const h2OrderCorrect =
    h2Texts.length === REQUIRED_H2_SECTIONS.length &&
    h2Texts.every((text, i) => text === REQUIRED_H2_SECTIONS[i]);
  results.push(
    checkRule(
      'R0-S07',
      h2OrderCorrect,
      h2OrderCorrect
        ? 'H2 sections are in correct order'
        : `H2 order mismatch. Expected: ${REQUIRED_H2_SECTIONS.join(', ')}. Got: ${h2Texts.join(', ')}`,
    ),
  );

  // R0-S08: No H2 section is empty
  const emptyH2s = h2s.filter((h) => h.content.length === 0);
  results.push(
    checkRule(
      'R0-S08',
      emptyH2s.length === 0,
      emptyH2s.length === 0
        ? 'All H2 sections have content'
        : `Empty H2 sections: ${emptyH2s.map((h) => h.text).join(', ')}`,
    ),
  );

  // R0-S09: H1 spec-id matches the JSON definition's id field
  const h1Id = h1?.text.match(/^(spec-[0-9a-f]{8}):/)?.[1];
  const h1IdMatch = h1Id === spec.id;
  results.push(
    checkRule(
      'R0-S09',
      h1IdMatch,
      h1IdMatch
        ? 'H1 spec ID matches definition ID'
        : `H1 spec ID "${h1Id ?? '(none)'}" does not match definition ID "${spec.id}"`,
    ),
  );

  // R0-S10: Status-array consistency
  const implDocs = spec.implementation_docs ?? [];
  let statusValid: boolean;
  let statusMessage: string;
  if (spec.status === 'draft' || spec.status === 'validated') {
    statusValid = implDocs.length === 0;
    statusMessage = statusValid
      ? `Status "${spec.status}" correctly has no implementation_docs`
      : `Status "${spec.status}" must have empty implementation_docs, found ${implDocs.length}`;
  } else if (spec.status === 'decomposed') {
    statusValid = implDocs.length > 0;
    statusMessage = statusValid
      ? `Status "decomposed" correctly has ${implDocs.length} implementation_docs`
      : 'Status "decomposed" must have non-empty implementation_docs';
  } else {
    statusValid = false;
    statusMessage = `Unknown status "${spec.status}"`;
  }
  results.push(checkRule('R0-S10', statusValid, statusMessage));

  // R0-S11: related_specs entries match the spec-[0-9a-f]{8} pattern
  const specIdPattern = /^spec-[0-9a-f]{8}$/;
  const invalidRelated = relatedSpecs.filter((s) => !specIdPattern.test(s));
  results.push(
    checkRule(
      'R0-S11',
      invalidRelated.length === 0,
      invalidRelated.length === 0
        ? 'All related_specs entries match the required pattern'
        : `Invalid related_specs entries: ${invalidRelated.join(', ')}`,
    ),
  );

  // R0-S12: At least one FR-XX identifier exists in the Functional Requirements section
  const frSection = h2s.find((h) => h.text === 'Functional Requirements');
  const frPattern = /FR-\d{2}/;
  const hasFrId = frSection !== undefined && frPattern.test(frSection.content);
  results.push(
    checkRule(
      'R0-S12',
      hasFrId,
      hasFrId
        ? 'At least one FR-XX identifier found in Functional Requirements'
        : 'No FR-XX identifier found in Functional Requirements section',
    ),
  );

  // R0-S13: All FR-XX and NFR-XX identifiers are unique within their defining sections
  // FR-XX identifiers are checked within the Functional Requirements section only,
  // NFR-XX within the Non-Functional Requirements section only. References to these
  // identifiers in other sections (e.g., Decomposition Guidance) are not duplicates.
  const frSectionContent = frSection?.content ?? '';
  const nfrSection = h2s.find((h) => h.text === 'Non-Functional Requirements');
  const nfrSectionContent = nfrSection?.content ?? '';
  const allFrMatches = frSectionContent.match(/FR-\d{2}/g) ?? [];
  const allNfrMatches = nfrSectionContent.match(/NFR-\d{2}/g) ?? [];
  const allIdentifiers = [...allFrMatches, ...allNfrMatches];
  const uniqueIdentifiers = new Set(allIdentifiers);
  const identifiersUnique = allIdentifiers.length === uniqueIdentifiers.size;
  const duplicates = allIdentifiers.filter(
    (id, idx) => allIdentifiers.indexOf(id) !== idx,
  );
  results.push(
    checkRule(
      'R0-S13',
      identifiersUnique,
      identifiersUnique
        ? 'All FR-XX and NFR-XX identifiers are unique within their sections'
        : `Duplicate identifiers found: ${[...new Set(duplicates)].join(', ')}`,
    ),
  );

  // R0-S14: version is a positive integer
  const versionValid =
    Number.isInteger(spec.version) && spec.version > 0;
  results.push(
    checkRule(
      'R0-S14',
      versionValid,
      versionValid
        ? `version ${spec.version} is a positive integer`
        : `version ${spec.version} is not a positive integer`,
    ),
  );

  return {
    results,
    valid: results.every((r) => r.passed),
  };
}
