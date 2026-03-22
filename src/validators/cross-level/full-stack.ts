import type {
  SpecDefinition,
  ImplDefinition,
  TaskDefinition,
} from '../../types/definitions.js';

export interface FullStackTraceabilityContext {
  specs: SpecDefinition[];
  implDocs: ImplDefinition[];
  tasks: TaskDefinition[];
  implMarkdowns: Map<string, string>;
}

export interface TraceabilityIssue {
  rule: string;
  reference: string;
  description: string;
}

export interface CrossLevelResult {
  rule: string;
  passed: boolean;
  issues: TraceabilityIssue[];
}

/**
 * Extract spec requirement heading slugs referenced by an impl doc's REQ-XX annotations.
 * Parses `(from spec-XXXXXXXX#heading-slug)` patterns from the impl doc markdown.
 */
function extractReqToSpecRefs(
  implId: string,
  markdown: string
): Map<string, Set<string>> {
  const reqToSpecSlugs = new Map<string, Set<string>>();
  const reqPattern = /(?:^|\n)#+\s*(REQ-\d+)[^\n]*\(from\s+(spec-[0-9a-f]{8}#[^\s)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = reqPattern.exec(markdown)) !== null) {
    const reqId = match[1];
    const specRef = match[2];
    if (!reqToSpecSlugs.has(reqId)) {
      reqToSpecSlugs.set(reqId, new Set());
    }
    reqToSpecSlugs.get(reqId)!.add(specRef);
  }
  return reqToSpecSlugs;
}

/**
 * Extract all spec section slugs (heading-slug part) from spec_sections arrays
 * across all impl docs that reference a given spec.
 */
function getSpecSectionsForSpec(
  specId: string,
  implDocs: ImplDefinition[]
): Set<string> {
  const sections = new Set<string>();
  for (const impl of implDocs) {
    for (const section of impl.spec_sections) {
      if (section.startsWith(`${specId}#`)) {
        sections.add(section);
      }
    }
  }
  return sections;
}

/**
 * Build a forward reference map: spec section ref -> set of task acceptance criterion IDs.
 *
 * Chain: spec FR-XX/NFR-XX (identified by spec-XXXXXXXX#heading-slug)
 *   -> impl doc REQ-XX (via `from` annotation)
 *   -> task context_refs (matching spec-XXXXXXXX#heading-slug)
 *   -> task acceptance_criteria
 */
export function buildForwardReferenceMap(
  context: FullStackTraceabilityContext
): Map<string, Set<string>> {
  const forwardMap = new Map<string, Set<string>>();

  // Collect all spec section refs that impl docs cover
  const allSpecSectionRefs = new Set<string>();

  // From impl doc markdowns, extract REQ -> spec section mappings
  const specRefToImplDocs = new Map<string, Set<string>>();
  for (const impl of context.implDocs) {
    const markdown = context.implMarkdowns.get(impl.id) ?? '';
    const reqToSpecRefs = extractReqToSpecRefs(impl.id, markdown);

    for (const [, specRefs] of reqToSpecRefs) {
      for (const specRef of specRefs) {
        allSpecSectionRefs.add(specRef);
        if (!specRefToImplDocs.has(specRef)) {
          specRefToImplDocs.set(specRef, new Set());
        }
        specRefToImplDocs.get(specRef)!.add(impl.id);
      }
    }

    // Also add spec_sections from the impl doc definition
    for (const section of impl.spec_sections) {
      allSpecSectionRefs.add(section);
      if (!specRefToImplDocs.has(section)) {
        specRefToImplDocs.set(section, new Set());
      }
      specRefToImplDocs.get(section)!.add(impl.id);
    }
  }

  // For each spec section ref, find tasks with matching context_refs
  for (const specRef of allSpecSectionRefs) {
    const criterionIds = new Set<string>();
    const implDocIds = specRefToImplDocs.get(specRef) ?? new Set();

    for (const task of context.tasks) {
      // Task must belong to one of the impl docs that covers this spec section
      if (!implDocIds.has(task.parent)) {
        continue;
      }
      // Task must have a context_ref matching this spec section
      if (task.context_refs.includes(specRef)) {
        for (const criterion of task.acceptance_criteria) {
          criterionIds.add(criterion.id);
        }
      }
    }

    forwardMap.set(specRef, criterionIds);
  }

  return forwardMap;
}

/**
 * Build a backward reference map: acceptance criterion ID -> set of spec section refs.
 *
 * Chain: task acceptance criterion
 *   -> task context_refs (spec-XXXXXXXX#heading-slug)
 *   -> parent impl doc spec_sections (must include the context_ref)
 *   -> spec FR-XX/NFR-XX
 */
export function buildBackwardReferenceMap(
  context: FullStackTraceabilityContext
): Map<string, Set<string>> {
  const backwardMap = new Map<string, Set<string>>();

  // Index impl docs by ID for quick lookup
  const implDocById = new Map<string, ImplDefinition>();
  for (const impl of context.implDocs) {
    implDocById.set(impl.id, impl);
  }

  for (const task of context.tasks) {
    const parentImpl = implDocById.get(task.parent);

    for (const criterion of task.acceptance_criteria) {
      const specRefs = new Set<string>();

      for (const contextRef of task.context_refs) {
        // Verify this context_ref is covered by the parent impl doc's spec_sections
        if (parentImpl && parentImpl.spec_sections.includes(contextRef)) {
          specRefs.add(contextRef);
        }
      }

      backwardMap.set(criterion.id, specRefs);
    }
  }

  return backwardMap;
}

/**
 * CL-F01: Top-down traceability.
 * For every spec FR-XX and NFR-XX, there must exist a forward chain through
 * at least one impl doc REQ-XX to at least one task acceptance criterion.
 */
export function validateCLF01(
  context: FullStackTraceabilityContext
): CrossLevelResult {
  const issues: TraceabilityIssue[] = [];

  if (context.specs.length === 0) {
    issues.push({
      rule: 'CL-F01',
      reference: 'specs',
      description: 'No specifications provided for traceability check',
    });
    return { rule: 'CL-F01', passed: false, issues };
  }

  const forwardMap = buildForwardReferenceMap(context);

  // Collect all spec section refs that should be covered
  const allExpectedRefs = new Set<string>();
  for (const spec of context.specs) {
    const sections = getSpecSectionsForSpec(spec.id, context.implDocs);
    for (const section of sections) {
      allExpectedRefs.add(section);
    }
  }

  // Also include any refs found in impl doc markdowns
  for (const [specRef] of forwardMap) {
    allExpectedRefs.add(specRef);
  }

  // Check each spec section ref has at least one acceptance criterion
  for (const specRef of allExpectedRefs) {
    const criterionIds = forwardMap.get(specRef);
    if (!criterionIds || criterionIds.size === 0) {
      issues.push({
        rule: 'CL-F01',
        reference: specRef,
        description: `Spec requirement ${specRef} has no forward chain to any task acceptance criterion`,
      });
    }
  }

  return { rule: 'CL-F01', passed: issues.length === 0, issues };
}

/**
 * CL-F02: Bottom-up traceability.
 * For every task acceptance criterion, there must exist a backward chain
 * through the parent impl doc to at least one spec FR-XX or NFR-XX.
 */
export function validateCLF02(
  context: FullStackTraceabilityContext
): CrossLevelResult {
  const issues: TraceabilityIssue[] = [];

  if (context.tasks.length === 0) {
    issues.push({
      rule: 'CL-F02',
      reference: 'tasks',
      description: 'No tasks provided for traceability check',
    });
    return { rule: 'CL-F02', passed: false, issues };
  }

  const backwardMap = buildBackwardReferenceMap(context);

  for (const [criterionId, specRefs] of backwardMap) {
    if (specRefs.size === 0) {
      issues.push({
        rule: 'CL-F02',
        reference: criterionId,
        description: `Acceptance criterion ${criterionId} has no backward chain to any spec requirement`,
      });
    }
  }

  return { rule: 'CL-F02', passed: issues.length === 0, issues };
}

/**
 * Validate full-stack traceability by running both CL-F01 and CL-F02.
 * Returns a combined result.
 */
export function validateFullStackTraceability(
  context: FullStackTraceabilityContext
): CrossLevelResult {
  const clf01 = validateCLF01(context);
  const clf02 = validateCLF02(context);

  const allIssues = [...clf01.issues, ...clf02.issues];

  return {
    rule: 'CL-F01+CL-F02',
    passed: clf01.passed && clf02.passed,
    issues: allIssues,
  };
}
