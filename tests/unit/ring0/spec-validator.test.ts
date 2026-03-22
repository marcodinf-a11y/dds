import { describe, it, expect } from 'vitest';
import { validateSpecRing0 } from '../../../src/validators/spec/ring0.js';
import type { SpecDefinition } from '../../../src/types/definitions.js';
import type { Ring0RuleResult } from '../../../src/types/results.js';
import validSpecJson from '../../fixtures/specs/valid-spec.json' with { type: 'json' };

// --- Fixture data (inline / imported, no runtime fs reads) ---

const validSpec: SpecDefinition = validSpecJson as SpecDefinition;

const validMarkdown = `# spec-a1b2c3d4: Test Specification

## Overview

This is a test specification used for validating the Ring 0 spec validator. It covers a hypothetical user management system that provides authentication and authorization capabilities.

## Functional Requirements

FR-01: The system shall allow administrators to create new user accounts with a unique username and email address.

FR-02: The system shall support password-based authentication using bcrypt hashing with a minimum cost factor of 12.

FR-03: The system shall create a session token upon successful authentication that expires after 24 hours of inactivity.

### User Management

User management covers account creation and authentication workflows.

### Session Handling

Session handling covers token lifecycle and expiration policies.

## Non-Functional Requirements

NFR-10: The system shall respond to authentication requests within 200 milliseconds at the 95th percentile under normal load.

NFR-11: The system shall support at least 1000 concurrent authenticated sessions.

## System Constraints

The system must be deployable on Linux-based container runtimes. All data at rest must be encrypted using AES-256. The system must not depend on external identity providers for core authentication.

## Glossary

- **User**: An entity with credentials that can authenticate against the system.
- **Session**: A time-bounded authentication context tied to a single user.
- **Cost factor**: The computational work parameter for the bcrypt hashing algorithm.

## Decomposition Guidance

This specification should be decomposed into implementation documents covering: (1) user account management, (2) authentication flow, and (3) session lifecycle. Each area maps to a functional requirement group above.
`;

function findRule(
  results: Ring0RuleResult[],
  rule: string,
): Ring0RuleResult | undefined {
  return results.find((r) => r.rule === rule);
}

// ============================================================
// validateSpecRing0
// ============================================================

describe('validateSpecRing0', () => {
  it('passes for a fully valid spec', () => {
    const result = validateSpecRing0(validSpec, validMarkdown);
    expect(result.valid).toBe(true);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  // ---- R0-S01 - Schema conformance ----

  describe('R0-S01 - Schema conformance', () => {
    it('passes with a valid spec', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S01');
      expect(rule?.passed).toBe(true);
    });

    it('fails with a missing required field (title)', () => {
      const badSpec = { ...validSpec } as Record<string, unknown>;
      delete badSpec.title;
      const result = validateSpecRing0(
        badSpec as unknown as SpecDefinition,
        validMarkdown,
      );
      const rule = findRule(result.results, 'R0-S01');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('Schema validation failed');
    });

    it('fails with invalid id pattern', () => {
      const badSpec = { ...validSpec, id: 'not-a-valid-id' };
      const result = validateSpecRing0(badSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S01');
      expect(rule?.passed).toBe(false);
    });

    it('fails with additional property', () => {
      const badSpec = { ...validSpec, extraField: 'nope' } as unknown as SpecDefinition;
      const result = validateSpecRing0(badSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S01');
      expect(rule?.passed).toBe(false);
    });
  });

  // ---- R0-S02 - ID uniqueness (single-doc mode) ----

  describe('R0-S02 - ID uniqueness', () => {
    it('passes in single-document mode', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S02');
      expect(rule?.passed).toBe(true);
    });

    it('still passes in single-document mode even when spec id duplicates another (pipeline concern)', () => {
      // R0-S02 is trivially true in single-document mode; cross-doc
      // uniqueness is enforced at the pipeline level, not the validator.
      // Here we supply a spec whose id could collide with another doc —
      // the validator must still report pass for R0-S02.
      const duplicateIdSpec: SpecDefinition = { ...validSpec, id: 'spec-a1b2c3d4' };
      const result = validateSpecRing0(duplicateIdSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S02');
      expect(rule?.passed).toBe(true);
      expect(rule?.message).toContain('single-document mode');
    });
  });

  // ---- R0-S03 - Description pattern ----

  describe('R0-S03 - Description pattern', () => {
    it('passes with correct filename pattern', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S03');
      expect(rule?.passed).toBe(true);
    });

    it('fails with wrong filename pattern', () => {
      const badSpec: SpecDefinition = {
        ...validSpec,
        description: 'wrong-filename.md',
      };
      const result = validateSpecRing0(badSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S03');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('does not match pattern');
    });
  });

  // ---- R0-S04 - No self-reference ----

  describe('R0-S04 - No self-reference', () => {
    it('passes with no related_specs', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S04');
      expect(rule?.passed).toBe(true);
    });

    it('passes with related_specs that does not include self', () => {
      const spec: SpecDefinition = {
        ...validSpec,
        related_specs: ['spec-11223344'],
      };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S04');
      expect(rule?.passed).toBe(true);
    });

    it('fails with self-reference in related_specs', () => {
      const spec: SpecDefinition = {
        ...validSpec,
        related_specs: ['spec-a1b2c3d4'],
      };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S04');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('Self-reference');
    });
  });

  // ---- R0-S05 - H1 matches spec ----

  describe('R0-S05 - H1 matches spec', () => {
    it('passes with correct H1', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S05');
      expect(rule?.passed).toBe(true);
    });

    it('fails with wrong H1 title', () => {
      const badMd = validMarkdown.replace(
        '# spec-a1b2c3d4: Test Specification',
        '# spec-a1b2c3d4: Wrong Title',
      );
      const result = validateSpecRing0(validSpec, badMd);
      const rule = findRule(result.results, 'R0-S05');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('mismatch');
    });

    it('fails with no H1', () => {
      const noH1Md = validMarkdown.replace(
        '# spec-a1b2c3d4: Test Specification\n',
        '',
      );
      const result = validateSpecRing0(validSpec, noH1Md);
      const rule = findRule(result.results, 'R0-S05');
      expect(rule?.passed).toBe(false);
    });
  });

  // ---- R0-S06 / R0-S07 - H2 sections ----

  describe('R0-S06/R0-S07 - H2 sections', () => {
    it('passes with all six H2 sections in correct order', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const r06 = findRule(result.results, 'R0-S06');
      const r07 = findRule(result.results, 'R0-S07');
      expect(r06?.passed).toBe(true);
      expect(r07?.passed).toBe(true);
    });

    it('fails R0-S06 with missing H2 section', () => {
      // Remove the Glossary section
      const badMd = validMarkdown.replace(
        /## Glossary\n[\s\S]*?(?=## Decomposition Guidance)/,
        '',
      );
      const result = validateSpecRing0(validSpec, badMd);
      const rule = findRule(result.results, 'R0-S06');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('Expected 6');
    });

    it('fails R0-S07 with wrong H2 order', () => {
      // Swap Overview and Functional Requirements
      const badMd = `# spec-a1b2c3d4: Test Specification

## Functional Requirements

### User Management

FR-01: The system shall do things.

## Overview

Some overview.

## Non-Functional Requirements

NFR-01: Performance requirement.

## System Constraints

Some constraints.

## Glossary

Some glossary.

## Decomposition Guidance

Some guidance.
`;
      const result = validateSpecRing0(validSpec, badMd);
      const rule = findRule(result.results, 'R0-S07');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('order mismatch');
    });
  });

  // ---- R0-S08 - Non-empty sections ----

  describe('R0-S08 - Non-empty sections', () => {
    it('passes when all H2 sections have content', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S08');
      expect(rule?.passed).toBe(true);
    });

    it('fails with empty H2 section', () => {
      const badMd = `# spec-a1b2c3d4: Test Specification

## Overview

Some overview content.

## Functional Requirements

### User Management

FR-01: The system shall do things.

## Non-Functional Requirements

NFR-01: Performance.

## System Constraints

## Glossary

Some glossary.

## Decomposition Guidance

Some guidance.
`;
      const result = validateSpecRing0(validSpec, badMd);
      const rule = findRule(result.results, 'R0-S08');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('Empty H2');
      expect(rule?.message).toContain('System Constraints');
    });
  });

  // ---- R0-S09 - H1 ID matches JSON ----

  describe('R0-S09 - H1 ID matches JSON', () => {
    it('passes when H1 ID matches spec.id', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S09');
      expect(rule?.passed).toBe(true);
    });

    it('fails when H1 ID does not match spec.id', () => {
      const badMd = validMarkdown.replace(
        '# spec-a1b2c3d4: Test Specification',
        '# spec-99999999: Test Specification',
      );
      const result = validateSpecRing0(validSpec, badMd);
      const rule = findRule(result.results, 'R0-S09');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('does not match');
    });
  });

  // ---- R0-S10 - Status-array consistency ----

  describe('R0-S10 - Status-array consistency', () => {
    it('passes for draft with no implementation_docs', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S10');
      expect(rule?.passed).toBe(true);
    });

    it('passes for validated with no implementation_docs', () => {
      const spec: SpecDefinition = { ...validSpec, status: 'validated' };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S10');
      expect(rule?.passed).toBe(true);
    });

    it('fails for decomposed with empty implementation_docs', () => {
      const spec: SpecDefinition = {
        ...validSpec,
        status: 'decomposed',
        implementation_docs: [],
      };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S10');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('must have non-empty');
    });

    it('passes for decomposed with implementation_docs', () => {
      const spec: SpecDefinition = {
        ...validSpec,
        status: 'decomposed',
        implementation_docs: ['impl-11223344'],
      };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S10');
      expect(rule?.passed).toBe(true);
    });

    it('fails for draft with implementation_docs', () => {
      const spec: SpecDefinition = {
        ...validSpec,
        status: 'draft',
        implementation_docs: ['impl-11223344'],
      };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S10');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('must have empty');
    });
  });

  // ---- R0-S11 - related_specs pattern ----

  describe('R0-S11 - related_specs pattern', () => {
    it('passes with no related_specs', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S11');
      expect(rule?.passed).toBe(true);
    });

    it('passes with valid related_specs entries', () => {
      const spec: SpecDefinition = {
        ...validSpec,
        related_specs: ['spec-11223344', 'spec-aabbccdd'],
      };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S11');
      expect(rule?.passed).toBe(true);
    });

    it('fails with invalid related_specs pattern', () => {
      const spec: SpecDefinition = {
        ...validSpec,
        related_specs: ['not-a-valid-spec-id'],
      };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S11');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('Invalid related_specs');
    });
  });

  // ---- R0-S12 - FR-XX exists ----

  describe('R0-S12 - FR-XX exists', () => {
    it('passes when FR entries exist', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S12');
      expect(rule?.passed).toBe(true);
    });

    it('fails when no FR entries exist', () => {
      const noFrMd = `# spec-a1b2c3d4: Test Specification

## Overview

Some overview.

## Functional Requirements

### User Management

The system shall allow creating users.

## Non-Functional Requirements

NFR-01: Performance.

## System Constraints

Some constraints.

## Glossary

Some glossary.

## Decomposition Guidance

Some guidance.
`;
      const result = validateSpecRing0(validSpec, noFrMd);
      const rule = findRule(result.results, 'R0-S12');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('No FR-XX');
    });
  });

  // ---- R0-S13 - Unique identifiers ----

  describe('R0-S13 - Unique identifiers', () => {
    it('passes with unique FR and NFR identifiers', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S13');
      expect(rule?.passed).toBe(true);
    });

    it('fails with duplicate FR-01', () => {
      const dupMd = `# spec-a1b2c3d4: Test Specification

## Overview

Some overview.

## Functional Requirements

### User Management

FR-01: First requirement.

### Session Handling

FR-01: Duplicate requirement.

## Non-Functional Requirements

NFR-01: Performance.

## System Constraints

Some constraints.

## Glossary

Some glossary.

## Decomposition Guidance

Some guidance.
`;
      const result = validateSpecRing0(validSpec, dupMd);
      const rule = findRule(result.results, 'R0-S13');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('Duplicate');
      expect(rule?.message).toContain('FR-01');
    });

    it('fails with duplicate NFR identifiers', () => {
      const dupMd = `# spec-a1b2c3d4: Test Specification

## Overview

Some overview.

## Functional Requirements

### User Management

FR-01: A requirement.

## Non-Functional Requirements

NFR-01: First NFR.

NFR-01: Duplicate NFR.

## System Constraints

Some constraints.

## Glossary

Some glossary.

## Decomposition Guidance

Some guidance.
`;
      const result = validateSpecRing0(validSpec, dupMd);
      const rule = findRule(result.results, 'R0-S13');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('NFR-01');
    });
  });

  // ---- R0-S14 - Version positive integer ----

  describe('R0-S14 - Version positive integer', () => {
    it('passes with version 1', () => {
      const result = validateSpecRing0(validSpec, validMarkdown);
      const rule = findRule(result.results, 'R0-S14');
      expect(rule?.passed).toBe(true);
    });

    it('fails with version 0', () => {
      const spec: SpecDefinition = { ...validSpec, version: 0 };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S14');
      expect(rule?.passed).toBe(false);
      expect(rule?.message).toContain('not a positive integer');
    });

    it('fails with negative version', () => {
      const spec: SpecDefinition = { ...validSpec, version: -1 };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S14');
      expect(rule?.passed).toBe(false);
    });

    it('fails with non-integer version', () => {
      const spec: SpecDefinition = { ...validSpec, version: 1.5 };
      const result = validateSpecRing0(spec, validMarkdown);
      const rule = findRule(result.results, 'R0-S14');
      expect(rule?.passed).toBe(false);
    });
  });
});
