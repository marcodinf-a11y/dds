/**
 * Invalid fixture variations for impl-doc Ring 0 validator tests.
 *
 * Each export produces an invalid ImplDefinition or markdown string
 * targeting a specific R0-I rule violation. All data is synthetic
 * and self-contained.
 */

import type { ImplDefinition } from '../../../src/types/definitions.js';

// ---- Base valid definition (used as a starting point for mutations) ----

const baseValid: ImplDefinition = {
  id: 'impl-00000001',
  spec_sections: ['spec-00000001#test-section'],
  description: 'impl-00000001.md',
  modules: ['mod-a', 'mod-b'],
  status: 'draft',
  atomic_tasks: [],
  dependencies: ['impl-00000002'],
};

// ---- R0-I40: Schema violations ----

/** Missing required field (modules) */
export function makeMissingRequiredField(): Record<string, unknown> {
  return {
    id: 'impl-00000001',
    spec_sections: ['spec-00000001#test-section'],
    description: 'impl-00000001.md',
    status: 'draft',
    // modules is missing
  };
}

/** Wrong type for id (number instead of string) */
export function makeWrongTypeId(): Record<string, unknown> {
  return {
    ...baseValid,
    id: 12345,
  };
}

/** Bad ID pattern (does not match impl-XXXXXXXX) */
export function makeBadIdPattern(): ImplDefinition {
  return {
    ...baseValid,
    id: 'bad-id-format' as string,
  };
}

// ---- R0-I41: Duplicate ID ----

export function makeDuplicateIdContext() {
  return {
    existingImplIds: ['impl-00000001'], // same as baseValid.id
    existingTaskIds: [] as string[],
    taskDefinitions: [] as Array<{ id: string; parent: string; scope: { modules: string[] } }>,
    dependencyGraph: [] as Array<{ from: string; to: string }>,
  };
}

// ---- R0-I42: Wrong description pattern ----

export function makeWrongDescriptionPattern(): ImplDefinition {
  return {
    ...baseValid,
    description: 'wrong-pattern.md' as string,
  };
}

// ---- R0-I43: Invalid spec_sections format ----

export function makeInvalidSpecSections(): ImplDefinition {
  return {
    ...baseValid,
    spec_sections: ['invalid-format-no-hash'],
  };
}

// ---- R0-I44: Invalid atomic_tasks references ----

export function makeInvalidAtomicTasksRef(): ImplDefinition {
  return {
    ...baseValid,
    status: 'decomposed',
    atomic_tasks: ['at-99999999'], // does not exist in context
  };
}

// ---- R0-I45: Invalid dependencies references ----

export function makeInvalidDependenciesRef(): ImplDefinition {
  return {
    ...baseValid,
    dependencies: ['impl-99999999'], // does not exist in context
  };
}

// ---- R0-I46: Self-reference in dependencies ----

export function makeSelfDependency(): ImplDefinition {
  return {
    ...baseValid,
    dependencies: ['impl-00000001'], // self-reference
  };
}

// ---- R0-I47: Cyclic dependencies ----

export function makeCyclicDepsGraph() {
  return [
    { from: 'impl-00000001', to: 'impl-00000002' },
    { from: 'impl-00000002', to: 'impl-00000003' },
    { from: 'impl-00000003', to: 'impl-00000001' },
  ];
}

// ---- R0-I48: Status-array inconsistency ----

/** Draft status with non-empty atomic_tasks */
export function makeDraftWithTasks(): ImplDefinition {
  return {
    ...baseValid,
    status: 'draft',
    atomic_tasks: ['at-00000001'],
  };
}

/** Decomposed status with empty atomic_tasks */
export function makeDecomposedWithoutTasks(): ImplDefinition {
  return {
    ...baseValid,
    status: 'decomposed',
    atomic_tasks: [],
  };
}

// ---- R0-I50: Parent mismatch ----

export function makeParentMismatchContext() {
  return {
    existingImplIds: ['impl-00000002'],
    existingTaskIds: ['at-00000001'],
    taskDefinitions: [
      {
        id: 'at-00000001',
        parent: 'impl-99999999', // wrong parent
        scope: { modules: ['mod-a'] },
      },
    ],
    dependencyGraph: [] as Array<{ from: string; to: string }>,
  };
}

export function makeImplWithTasks(): ImplDefinition {
  return {
    ...baseValid,
    status: 'decomposed',
    atomic_tasks: ['at-00000001'],
  };
}

// ---- R0-I51: Module superset violation ----

export function makeModuleViolationContext() {
  return {
    existingImplIds: ['impl-00000002'],
    existingTaskIds: ['at-00000001'],
    taskDefinitions: [
      {
        id: 'at-00000001',
        parent: 'impl-00000001',
        scope: { modules: ['mod-a', 'mod-c'] }, // mod-c not in impl modules
      },
    ],
    dependencyGraph: [] as Array<{ from: string; to: string }>,
  };
}

// ---- R0-I60: Bad H1 format ----

export const markdownBadH1 = `# This Is Not An Impl ID

## Objective

Some content.

## Background

Some content.

## Requirements

REQ-01 Test (from spec-00000001#test-section)

Some content.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.

### Ordering Rationale

Some content.

### Decomposition Constraints

Some content.
`;

// ---- R0-I61: Wrong H2 sections (wrong order) ----

export const markdownWrongH2Order = `# impl-00000001: Test Document

## Background

Some content.

## Objective

Some content.

## Requirements

REQ-01 Test (from spec-00000001#test-section)

Some content.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.

### Ordering Rationale

Some content.

### Decomposition Constraints

Some content.
`;

// ---- R0-I61: Missing H2 sections ----

export const markdownMissingH2 = `# impl-00000001: Test Document

## Objective

Some content.

## Background

Some content.

## Requirements

### REQ-01 Test (from spec-00000001#test-section)

Some content.
`;

// ---- R0-I62: Empty H2 section ----

export const markdownEmptySection = `# impl-00000001: Test Document

## Objective

Some content.

## Background

## Requirements

REQ-01 Test (from spec-00000001#test-section)

Some content.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.

### Ordering Rationale

Some content.

### Decomposition Constraints

Some content.
`;

// ---- R0-I63: Missing H3 subsections ----

export const markdownMissingH3 = `# impl-00000001: Test Document

## Objective

Some content.

## Background

Some content.

## Requirements

REQ-01 Test (from spec-00000001#test-section)

Some content.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.
`;

// ---- R0-I63: Extra H3 subsections ----

export const markdownExtraH3 = `# impl-00000001: Test Document

## Objective

Some content.

## Background

Some content.

## Requirements

REQ-01 Test (from spec-00000001#test-section)

Some content.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.

### Ordering Rationale

Some content.

### Decomposition Constraints

Some content.

### Extra Subsection

Some content.
`;

// ---- R0-I64: H1 ID mismatch ----

export const markdownIdMismatch = `# impl-99999999: Wrong ID Document

## Objective

Some content.

## Background

Some content.

## Requirements

REQ-01 Test (from spec-00000001#test-section)

Some content.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.

### Ordering Rationale

Some content.

### Decomposition Constraints

Some content.
`;

// ---- R0-I66: No REQ entries ----

export const markdownNoReq = `# impl-00000001: Test Document

## Objective

Some content.

## Background

Some content.

## Requirements

This section has no requirement entries.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.

### Ordering Rationale

Some content.

### Decomposition Constraints

Some content.
`;

// ---- R0-I67: REQ without spec reference ----

export const markdownReqWithoutRef = `# impl-00000001: Test Document

## Objective

Some content.

## Background

Some content.

## Requirements

REQ-01 Test Requirement Without Reference

Some content without a spec reference.

## Design Decisions

Some content.

## Out of Scope

Some content.

## Dependencies

Some content.

## Decomposition Notes

### Suggested Task Boundaries

Some content.

### Ordering Rationale

Some content.

### Decomposition Constraints

Some content.
`;
