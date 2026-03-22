import type { SpecDefinition } from '../../types/definitions.js';
import type { Ring0Result, Ring0RuleResult } from '../../types/results.js';
import { extractHeadings } from '../../parsers/markdown.js';

/**
 * Minimal interface for impl doc data needed by cross-level validators.
 * Avoids depending on the full ImplDefinition type which may not exist yet.
 */
export interface ImplDocMinimal {
  id: string;
  spec_sections: string[];
  status: string;
}

/**
 * Helper to create a Ring0RuleResult entry.
 */
function checkRule(
  rule: string,
  passed: boolean,
  message?: string
): Ring0RuleResult {
  const result: Ring0RuleResult = { rule, passed };
  if (message !== undefined) {
    result.message = message;
  }
  return result;
}

/**
 * CL-S01: Bidirectional consistency.
 *
 * Every impl doc listed in spec.implementation_docs must have at least one
 * spec_sections entry referencing this spec. Conversely, every impl doc
 * whose spec_sections references this spec must appear in
 * spec.implementation_docs.
 */
function checkCLS01(
  spec: SpecDefinition,
  implDocs: ImplDocMinimal[]
): Ring0RuleResult {
  const errors: string[] = [];
  const implDocsById = new Map<string, ImplDocMinimal>();
  for (const impl of implDocs) {
    implDocsById.set(impl.id, impl);
  }

  const specImplDocs = spec.implementation_docs ?? [];

  // Forward: every ID in spec.implementation_docs must correspond to an impl
  // doc whose spec_sections contains at least one entry starting with spec.id#
  for (const implId of specImplDocs) {
    const impl = implDocsById.get(implId);
    if (!impl) {
      errors.push(
        `spec.implementation_docs references ${implId} but no such impl doc was provided`
      );
      continue;
    }
    const hasBackRef = impl.spec_sections.some((s) =>
      s.startsWith(`${spec.id}#`)
    );
    if (!hasBackRef) {
      errors.push(
        `spec.implementation_docs references ${implId} but that impl doc has no spec_sections entry for ${spec.id}`
      );
    }
  }

  // Backward: every impl doc whose spec_sections references this spec must
  // appear in spec.implementation_docs
  for (const impl of implDocs) {
    const refsThisSpec = impl.spec_sections.some((s) =>
      s.startsWith(`${spec.id}#`)
    );
    if (refsThisSpec && !specImplDocs.includes(impl.id)) {
      errors.push(
        `impl doc ${impl.id} has spec_sections referencing ${spec.id} but is not listed in spec.implementation_docs`
      );
    }
  }

  if (errors.length === 0) {
    return checkRule('CL-S01', true);
  }
  return checkRule('CL-S01', false, errors.join('; '));
}

/**
 * CL-S02: Decomposed specs must have impl docs.
 *
 * Every spec with status "decomposed" must have at least one entry in
 * implementation_docs. Passes trivially for other statuses.
 */
function checkCLS02(spec: SpecDefinition): Ring0RuleResult {
  if (spec.status !== 'decomposed') {
    return checkRule('CL-S02', true);
  }
  const implDocs = spec.implementation_docs ?? [];
  if (implDocs.length > 0) {
    return checkRule('CL-S02', true);
  }
  return checkRule(
    'CL-S02',
    false,
    `spec ${spec.id} has status "decomposed" but implementation_docs is empty`
  );
}

/**
 * CL-S03: Functional area coverage.
 *
 * The union of all spec_sections entries across a spec's impl docs must cover
 * every H3 heading that appears under the "Functional Requirements" H2 section
 * in the spec markdown.
 */
function checkCLS03(
  spec: SpecDefinition,
  implDocs: ImplDocMinimal[],
  specMarkdown: string
): Ring0RuleResult {
  const headings = extractHeadings(specMarkdown);

  // Find the "Functional Requirements" H2 heading
  const frIndex = headings.findIndex(
    (h) => h.level === 2 && h.text === 'Functional Requirements'
  );

  if (frIndex === -1) {
    // No Functional Requirements section found - pass trivially
    return checkRule('CL-S03', true);
  }

  // Collect H3 headings under the Functional Requirements H2
  // (until we hit the next H2 or end of headings)
  const h3Slugs: string[] = [];
  for (let i = frIndex + 1; i < headings.length; i++) {
    if (headings[i].level <= 2) {
      break;
    }
    if (headings[i].level === 3) {
      h3Slugs.push(`${spec.id}#${headings[i].slug}`);
    }
  }

  if (h3Slugs.length === 0) {
    return checkRule('CL-S03', true);
  }

  // Collect the union of all spec_sections from impl docs
  const coveredSections = new Set<string>();
  for (const impl of implDocs) {
    for (const section of impl.spec_sections) {
      coveredSections.add(section);
    }
  }

  // Check coverage
  const uncovered = h3Slugs.filter((slug) => !coveredSections.has(slug));
  if (uncovered.length === 0) {
    return checkRule('CL-S03', true);
  }
  return checkRule(
    'CL-S03',
    false,
    `Functional area(s) not covered by any impl doc: ${uncovered.join(', ')}`
  );
}

/**
 * CL-S04: Version/status consistency.
 *
 * If a spec's version is greater than 1, all downstream impl docs must have
 * status "draft". This detects stale impl docs that were not reverted after
 * a spec version bump.
 */
function checkCLS04(
  spec: SpecDefinition,
  implDocs: ImplDocMinimal[]
): Ring0RuleResult {
  if (spec.version <= 1) {
    return checkRule('CL-S04', true);
  }

  const nonDraft = implDocs.filter((impl) => impl.status !== 'draft');
  if (nonDraft.length === 0) {
    return checkRule('CL-S04', true);
  }

  const ids = nonDraft.map((impl) => impl.id).join(', ');
  return checkRule(
    'CL-S04',
    false,
    `spec ${spec.id} has version ${spec.version} (>1) but these impl docs are not draft: ${ids}`
  );
}

/**
 * Validate cross-level invariants between a spec and its implementation documents.
 *
 * Checks CL-S01 through CL-S04. This is a pure function - no I/O, no LLM calls.
 * All data needed is passed as parameters.
 */
export function validateSpecImplCrossLevel(
  spec: SpecDefinition,
  implDocs: ImplDocMinimal[],
  specMarkdown: string
): Ring0Result {
  const results: Ring0RuleResult[] = [
    checkCLS01(spec, implDocs),
    checkCLS02(spec),
    checkCLS03(spec, implDocs, specMarkdown),
    checkCLS04(spec, implDocs),
  ];

  const valid = results.every((r) => r.passed);

  return { results, valid };
}
