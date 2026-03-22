/**
 * CLI entry point: validate a single implementation document (Ring 0).
 *
 * Usage: npx tsx src/cli/validate-impl.ts <impl-id>
 *
 * Loads the impl definition and markdown, runs Ring 0 structural validation,
 * prints results, and exits 0 if valid or 1 if invalid.
 * Suitable for PostToolUse hooks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import AjvModule from 'ajv';

import type { ImplDefinition } from '../types/definitions.js';
import { extractHeadings } from '../parsers/markdown.js';

const Ajv = AjvModule.default ?? AjvModule;
const require = createRequire(import.meta.url);
const implSchema = require('../schemas/impl.schema.json') as Record<string, unknown>;

interface RuleResult {
  rule: string;
  pass: boolean;
  message: string;
}

const REQUIRED_H2_SECTIONS = [
  'Background',
  'Requirements',
  'Out of Scope',
  'Design Decisions',
  'Decomposition Notes',
] as const;

function validateImplRing0(impl: ImplDefinition, markdown: string): { valid: boolean; results: RuleResult[] } {
  const results: RuleResult[] = [];
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(implSchema);

  // R0-I40: JSON validates against schema
  const schemaValid = validate(impl);
  results.push({
    rule: 'R0-I40',
    pass: !!schemaValid,
    message: schemaValid
      ? 'Impl JSON validates against schema'
      : `Schema validation failed: ${ajv.errorsText(validate.errors)}`,
  });

  // Markdown structural checks
  const headings = extractHeadings(markdown);
  const h1s = headings.filter((h) => h.level === 1);
  const h2s = headings.filter((h) => h.level === 2);

  // R0-I60: H1 matches pattern # {impl-id}: {title}
  const h1 = h1s[0];
  const h1Pattern = /^impl-[0-9a-f]{8}:\s+.+$/;
  const h1Valid = h1 !== undefined && h1Pattern.test(h1.text);
  results.push({
    rule: 'R0-I60',
    pass: h1Valid,
    message: h1Valid
      ? 'H1 matches required pattern'
      : `H1 does not match pattern. Got: "${h1?.text ?? '(none)'}"`,
  });

  // R0-I61: Exactly five H2 sections
  const hasExactlyFiveH2 = h2s.length === 5;
  results.push({
    rule: 'R0-I61',
    pass: hasExactlyFiveH2,
    message: hasExactlyFiveH2
      ? 'Exactly 5 H2 sections found'
      : `Expected 5 H2 sections, found ${h2s.length}`,
  });

  // R0-I62: H2 sections appear in the required order
  const h2Texts = h2s.map((h) => h.text);
  const h2OrderCorrect =
    h2Texts.length === REQUIRED_H2_SECTIONS.length &&
    h2Texts.every((text, i) => text === REQUIRED_H2_SECTIONS[i]);
  results.push({
    rule: 'R0-I62',
    pass: h2OrderCorrect,
    message: h2OrderCorrect
      ? 'H2 sections are in correct order'
      : `H2 order mismatch. Expected: ${REQUIRED_H2_SECTIONS.join(', ')}. Got: ${h2Texts.join(', ')}`,
  });

  // R0-I63: No H2 section is empty
  const emptyH2s = h2s.filter((h) => h.content.length === 0);
  results.push({
    rule: 'R0-I63',
    pass: emptyH2s.length === 0,
    message:
      emptyH2s.length === 0
        ? 'All H2 sections have content'
        : `Empty H2 sections: ${emptyH2s.map((h) => h.text).join(', ')}`,
  });

  // R0-I64: H1 impl-id matches the JSON definition's id
  const h1Id = h1?.text.match(/^(impl-[0-9a-f]{8}):/)?.[1];
  const h1IdMatch = h1Id === impl.id;
  results.push({
    rule: 'R0-I64',
    pass: h1IdMatch,
    message: h1IdMatch
      ? 'H1 impl ID matches definition ID'
      : `H1 impl ID "${h1Id ?? '(none)'}" does not match definition ID "${impl.id}"`,
  });

  return {
    valid: results.every((r) => r.pass),
    results,
  };
}

async function main(): Promise<void> {
  const implId = process.argv[2];

  if (!implId) {
    process.stderr.write('Usage: validate-impl <impl-id>\n');
    process.exit(1);
  }

  const defPath = path.resolve('implementations', 'definitions', `${implId}.json`);
  const mdPath = path.resolve('implementations', 'descriptions', `${implId}.md`);

  if (!fs.existsSync(defPath)) {
    process.stderr.write(`Impl definition not found: ${defPath}\n`);
    process.exit(1);
  }

  if (!fs.existsSync(mdPath)) {
    process.stderr.write(`Impl description not found: ${mdPath}\n`);
    process.exit(1);
  }

  const impl: ImplDefinition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));
  const markdown = fs.readFileSync(mdPath, 'utf-8');

  const result = validateImplRing0(impl, markdown);

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
