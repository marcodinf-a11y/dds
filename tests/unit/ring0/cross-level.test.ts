import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateSpecImplCrossLevel,
  type ImplDocMinimal,
} from '../../../src/validators/cross-level/spec-impl.js';
import type { SpecDefinition } from '../../../src/types/definitions.js';
import type { Ring0RuleResult } from '../../../src/types/results.js';

// --- Fixture helpers ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../fixtures/specs');

const validSpec: SpecDefinition = JSON.parse(
  readFileSync(resolve(fixturesDir, 'valid-spec.json'), 'utf-8'),
);
const validMarkdown: string = readFileSync(
  resolve(fixturesDir, 'valid-spec.md'),
  'utf-8',
);

function findRule(
  results: Ring0RuleResult[],
  rule: string,
): Ring0RuleResult | undefined {
  return results.find((r) => r.rule === rule);
}

// --- Base data for cross-level tests ---

// A decomposed spec with one impl doc
const decomposedSpec: SpecDefinition = {
  ...validSpec,
  status: 'decomposed',
  implementation_docs: ['impl-11223344'],
};

// An impl doc that references the spec's functional areas
const matchingImplDoc: ImplDocMinimal = {
  id: 'impl-11223344',
  spec_sections: [
    'spec-a1b2c3d4#user-management',
    'spec-a1b2c3d4#session-handling',
  ],
  status: 'draft',
};

// ============================================================
// validateSpecImplCrossLevel
// ============================================================

describe('validateSpecImplCrossLevel', () => {
  it('passes for a fully consistent spec-impl relationship', () => {
    const result = validateSpecImplCrossLevel(
      decomposedSpec,
      [matchingImplDoc],
      validMarkdown,
    );
    expect(result.valid).toBe(true);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  // ---- CL-S01 - Bidirectional consistency ----

  describe('CL-S01 - Bidirectional consistency', () => {
    it('passes with matching references', () => {
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [matchingImplDoc],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S01');
      expect(rule?.passed).toBe(true);
    });

    it('fails when spec references impl doc that has no back-reference', () => {
      const implWithoutBackRef: ImplDocMinimal = {
        id: 'impl-11223344',
        spec_sections: ['spec-99999999#some-section'], // references a different spec
        status: 'draft',
      };
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [implWithoutBackRef],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S01');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('impl-11223344');
      expect(rule?.message).toContain('no spec_sections entry');
    });

    it('fails when impl doc references spec but is not in spec.implementation_docs', () => {
      const extraImplDoc: ImplDocMinimal = {
        id: 'impl-aabbccdd',
        spec_sections: ['spec-a1b2c3d4#user-management'],
        status: 'draft',
      };
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [matchingImplDoc, extraImplDoc],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S01');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('impl-aabbccdd');
      expect(rule?.message).toContain('not listed in spec.implementation_docs');
    });

    it('fails when spec.implementation_docs references non-existent impl doc', () => {
      const specWithMissing: SpecDefinition = {
        ...validSpec,
        status: 'decomposed',
        implementation_docs: ['impl-11223344', 'impl-deadbeef'],
      };
      const result = validateSpecImplCrossLevel(
        specWithMissing,
        [matchingImplDoc],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S01');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('impl-deadbeef');
      expect(rule?.message).toContain('no such impl doc');
    });
  });

  // ---- CL-S02 - Decomposed has impl docs ----

  describe('CL-S02 - Decomposed has impl docs', () => {
    it('passes when decomposed spec has impl docs', () => {
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [matchingImplDoc],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S02');
      expect(rule?.passed).toBe(true);
    });

    it('fails when decomposed spec has empty implementation_docs', () => {
      const specDecomposedEmpty: SpecDefinition = {
        ...validSpec,
        status: 'decomposed',
        implementation_docs: [],
      };
      const result = validateSpecImplCrossLevel(
        specDecomposedEmpty,
        [],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S02');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('decomposed');
      expect(rule?.message).toContain('empty');
    });

    it('passes for draft spec with no impl docs', () => {
      const result = validateSpecImplCrossLevel(
        validSpec, // status: draft, no implementation_docs
        [],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S02');
      expect(rule?.passed).toBe(true);
    });

    it('passes for validated spec with no impl docs', () => {
      const validatedSpec: SpecDefinition = {
        ...validSpec,
        status: 'validated',
      };
      const result = validateSpecImplCrossLevel(
        validatedSpec,
        [],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S02');
      expect(rule?.passed).toBe(true);
    });
  });

  // ---- CL-S03 - Functional area coverage ----

  describe('CL-S03 - Functional area coverage', () => {
    it('passes when all H3 areas under Functional Requirements are covered', () => {
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [matchingImplDoc],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S03');
      expect(rule?.passed).toBe(true);
    });

    it('fails when a functional area H3 is not covered', () => {
      const partialImplDoc: ImplDocMinimal = {
        id: 'impl-11223344',
        spec_sections: [
          'spec-a1b2c3d4#user-management',
          // Missing spec-a1b2c3d4#session-handling
        ],
        status: 'draft',
      };
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [partialImplDoc],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S03');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('session-handling');
    });

    it('passes when multiple impl docs together cover all areas', () => {
      const specWithTwo: SpecDefinition = {
        ...validSpec,
        status: 'decomposed',
        implementation_docs: ['impl-11223344', 'impl-55667788'],
      };
      const implDoc1: ImplDocMinimal = {
        id: 'impl-11223344',
        spec_sections: ['spec-a1b2c3d4#user-management'],
        status: 'draft',
      };
      const implDoc2: ImplDocMinimal = {
        id: 'impl-55667788',
        spec_sections: ['spec-a1b2c3d4#session-handling'],
        status: 'draft',
      };
      const result = validateSpecImplCrossLevel(
        specWithTwo,
        [implDoc1, implDoc2],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S03');
      expect(rule?.passed).toBe(true);
    });

    it('passes with no H3 headings under Functional Requirements', () => {
      const noH3Md = `# spec-a1b2c3d4: Test Specification

## Overview

Some overview.

## Functional Requirements

FR-01: A flat requirement with no H3 grouping.

## Non-Functional Requirements

NFR-01: Performance.

## System Constraints

Some constraints.

## Glossary

Some glossary.

## Decomposition Guidance

Some guidance.
`;
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [matchingImplDoc],
        noH3Md,
      );
      const rule = findRule(result.results, 'CL-S03');
      expect(rule?.passed).toBe(true);
    });
  });

  // ---- CL-S04 - Version/status consistency ----

  describe('CL-S04 - Version/status consistency', () => {
    it('passes when version is 1 (any impl doc status)', () => {
      const result = validateSpecImplCrossLevel(
        decomposedSpec,
        [matchingImplDoc],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S04');
      expect(rule?.passed).toBe(true);
    });

    it('passes when version > 1 and all impl docs are draft', () => {
      const v2Spec: SpecDefinition = {
        ...decomposedSpec,
        version: 2,
      };
      const draftImpl: ImplDocMinimal = {
        ...matchingImplDoc,
        status: 'draft',
      };
      const result = validateSpecImplCrossLevel(
        v2Spec,
        [draftImpl],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S04');
      expect(rule?.passed).toBe(true);
    });

    it('fails when version > 1 and impl doc is not draft', () => {
      const v2Spec: SpecDefinition = {
        ...decomposedSpec,
        version: 2,
      };
      const validatedImpl: ImplDocMinimal = {
        ...matchingImplDoc,
        status: 'validated',
      };
      const result = validateSpecImplCrossLevel(
        v2Spec,
        [validatedImpl],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S04');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('impl-11223344');
      expect(rule?.message).toContain('not draft');
    });

    it('fails when version > 1 and some impl docs are not draft', () => {
      const v3Spec: SpecDefinition = {
        ...validSpec,
        status: 'decomposed',
        version: 3,
        implementation_docs: ['impl-11223344', 'impl-55667788'],
      };
      const draftImpl: ImplDocMinimal = {
        id: 'impl-11223344',
        spec_sections: ['spec-a1b2c3d4#user-management'],
        status: 'draft',
      };
      const decomposedImpl: ImplDocMinimal = {
        id: 'impl-55667788',
        spec_sections: ['spec-a1b2c3d4#session-handling'],
        status: 'decomposed',
      };
      const result = validateSpecImplCrossLevel(
        v3Spec,
        [draftImpl, decomposedImpl],
        validMarkdown,
      );
      const rule = findRule(result.results, 'CL-S04');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('impl-55667788');
    });
  });
});
