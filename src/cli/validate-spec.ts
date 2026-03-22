/**
 * CLI entry point: validate a single specification document (Ring 0).
 *
 * Usage: npx tsx src/cli/validate-spec.ts <spec-id>
 *
 * Loads the spec definition and markdown, runs Ring 0 structural validation,
 * prints results, and exits 0 if valid or 1 if invalid.
 * Suitable for PostToolUse hooks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import AjvModule from 'ajv';

import type { SpecDefinition } from '../types/definitions.js';
import { extractHeadings } from '../parsers/markdown.js';

const Ajv = AjvModule.default ?? AjvModule;
const require = createRequire(import.meta.url);
const specSchema = require('../schemas/spec.schema.json') as Record<string, unknown>;

interface RuleResult {
  rule: string;
  pass: boolean;
  message: string;
}

const REQUIRED_H2_SECTIONS = [
  'Overview',
  'Functional Requirements',
  'Non-Functional Requirements',
  'System Constraints',
  'Glossary',
  'Decomposition Guidance',
] as const;

function validateSpecRing0(spec: SpecDefinition, markdown: string): { valid: boolean; results: RuleResult[] } {
  const results: RuleResult[] = [];
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(specSchema);

  // R0-S01: JSON validates against schema
  const schemaValid = validate(spec);
  results.push({
    rule: 'R0-S01',
    pass: !!schemaValid,
    message: schemaValid
      ? 'Spec JSON validates against schema'
      : `Schema validation failed: ${ajv.errorsText(validate.errors)}`,
  });

  // Markdown structural checks
  const headings = extractHeadings(markdown);
  const h1s = headings.filter((h) => h.level === 1);
  const h2s = headings.filter((h) => h.level === 2);

  // R0-S10: H1 matches pattern # {spec-id}: {title}
  const h1 = h1s[0];
  const h1Pattern = /^spec-[0-9a-f]{8}:\s+.+$/;
  const h1Valid = h1 !== undefined && h1Pattern.test(h1.text);
  results.push({
    rule: 'R0-S10',
    pass: h1Valid,
    message: h1Valid
      ? 'H1 matches required pattern'
      : `H1 does not match pattern. Got: "${h1?.text ?? '(none)'}"`,
  });

  // R0-S11: Exactly six H2 sections
  const hasExactlySixH2 = h2s.length === 6;
  results.push({
    rule: 'R0-S11',
    pass: hasExactlySixH2,
    message: hasExactlySixH2
      ? 'Exactly 6 H2 sections found'
      : `Expected 6 H2 sections, found ${h2s.length}`,
  });

  // R0-S12: H2 sections appear in the required order
  const h2Texts = h2s.map((h) => h.text);
  const h2OrderCorrect =
    h2Texts.length === REQUIRED_H2_SECTIONS.length &&
    h2Texts.every((text, i) => text === REQUIRED_H2_SECTIONS[i]);
  results.push({
    rule: 'R0-S12',
    pass: h2OrderCorrect,
    message: h2OrderCorrect
      ? 'H2 sections are in correct order'
      : `H2 order mismatch. Expected: ${REQUIRED_H2_SECTIONS.join(', ')}. Got: ${h2Texts.join(', ')}`,
  });

  // R0-S13: No H2 section is empty
  const emptyH2s = h2s.filter((h) => h.content.length === 0);
  results.push({
    rule: 'R0-S13',
    pass: emptyH2s.length === 0,
    message:
      emptyH2s.length === 0
        ? 'All H2 sections have content'
        : `Empty H2 sections: ${emptyH2s.map((h) => h.text).join(', ')}`,
  });

  // R0-S14: H1 spec-id matches the JSON definition's id
  const h1Id = h1?.text.match(/^(spec-[0-9a-f]{8}):/)?.[1];
  const h1IdMatch = h1Id === spec.id;
  results.push({
    rule: 'R0-S14',
    pass: h1IdMatch,
    message: h1IdMatch
      ? 'H1 spec ID matches definition ID'
      : `H1 spec ID "${h1Id ?? '(none)'}" does not match definition ID "${spec.id}"`,
  });

  return {
    valid: results.every((r) => r.pass),
    results,
  };
}

async function main(): Promise<void> {
  const specId = process.argv[2];

  if (!specId) {
    process.stderr.write('Usage: validate-spec <spec-id>\n');
    process.exit(1);
  }

  const defPath = path.resolve('specs', 'definitions', `${specId}.json`);
  const mdPath = path.resolve('specs', 'descriptions', `${specId}.md`);

  if (!fs.existsSync(defPath)) {
    process.stderr.write(`Spec definition not found: ${defPath}\n`);
    process.exit(1);
  }

  if (!fs.existsSync(mdPath)) {
    process.stderr.write(`Spec description not found: ${mdPath}\n`);
    process.exit(1);
  }

  const spec: SpecDefinition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  const result = validateSpecRing0(spec, markdown);

  for (const r of result.results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`[${status}] ${r.rule}: ${r.message}\n`);
  }

  process.stdout.write(`\nOverall: ${result.valid ? 'VALID' : 'INVALID'}\n`);
  process.exit(result.valid ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
