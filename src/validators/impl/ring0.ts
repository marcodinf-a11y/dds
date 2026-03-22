import { createRequire } from 'node:module';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = addFormatsModule as any;
import type { ImplDefinition } from '../../types/definitions.js';
import { extractHeadings } from '../../parsers/markdown.js';
import { buildAdjacencyList, detectCycles } from '../../parsers/graph.js';
import type { Ring0RuleResult, Ring0Result } from '../../types/results.js';

const Ajv = AjvModule.default ?? AjvModule;
const require = createRequire(import.meta.url);
const implSchema = require('../../schemas/impl.schema.json') as Record<string, unknown>;

// --- Context interface ---

export interface ImplValidationContext {
  existingImplIds: string[];
  existingTaskIds: string[];
  taskDefinitions: Array<{ id: string; parent: string; scope: { modules: string[] } }>;
  dependencyGraph: Array<{ from: string; to: string }>;
}

// --- Shared ajv instance ---

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateImplSchema = ajv.compile(implSchema);

// --- Required H2 sections in order ---

const REQUIRED_H2_SECTIONS = [
  'Objective',
  'Background',
  'Requirements',
  'Design Decisions',
  'Out of Scope',
  'Dependencies',
  'Decomposition Notes',
] as const;

// --- Required H3 subsections under Decomposition Notes ---

const REQUIRED_H3_DECOMPOSITION = [
  'Suggested Task Boundaries',
  'Ordering Rationale',
  'Decomposition Constraints',
] as const;

// --- Impl Ring 0 Validator ---

export function validateImplRing0(
  impl: ImplDefinition,
  markdown: string,
  context: ImplValidationContext,
): Ring0Result {
  const results: Ring0RuleResult[] = [];

  // =====================
  // JSON/Definition checks
  // =====================

  // R0-I40: JSON validates against ImplementationDefinition schema (ajv)
  const schemaValid = validateImplSchema(impl);
  results.push({
    rule: 'R0-I40',
    passed: !!schemaValid,
    message: schemaValid
      ? 'Impl JSON validates against schema'
      : `Schema validation failed: ${ajv.errorsText(validateImplSchema.errors)}`,
  });

  // R0-I41: ID is unique across all impl docs (via context.existingImplIds)
  const idUnique = !context.existingImplIds.includes(impl.id);
  results.push({
    rule: 'R0-I41',
    passed: idUnique,
    message: idUnique
      ? `Impl ID ${impl.id} is unique`
      : `Impl ID ${impl.id} already exists`,
  });

  // R0-I42: description field matches impl-XXXXXXXX.md pattern
  const descPattern = /^impl-[0-9a-f]{8}\.md$/;
  const descValid = descPattern.test(impl.description);
  results.push({
    rule: 'R0-I42',
    passed: descValid,
    message: descValid
      ? `Description "${impl.description}" matches required pattern`
      : `Description "${impl.description}" does not match pattern impl-XXXXXXXX.md`,
  });

  // R0-I43: Every spec_sections entry matches spec-XXXXXXXX#heading-slug format
  const specSectionPattern = /^spec-[0-9a-f]{8}#[a-z0-9-]+$/;
  const invalidSpecSections = impl.spec_sections.filter(
    (s) => !specSectionPattern.test(s),
  );
  results.push({
    rule: 'R0-I43',
    passed: invalidSpecSections.length === 0,
    message:
      invalidSpecSections.length === 0
        ? 'All spec_sections entries match required format'
        : `Invalid spec_sections entries: ${invalidSpecSections.join(', ')}`,
  });

  // R0-I44: Every atomic_tasks entry references an existing task definition
  const atomicTasks = impl.atomic_tasks ?? [];
  const invalidTasks = atomicTasks.filter(
    (id) => !context.existingTaskIds.includes(id),
  );
  results.push({
    rule: 'R0-I44',
    passed: invalidTasks.length === 0,
    message:
      invalidTasks.length === 0
        ? 'All atomic_tasks references are valid'
        : `Invalid atomic_tasks references: ${invalidTasks.join(', ')}`,
  });

  // R0-I45: Every dependencies entry references an existing impl doc
  const dependencies = impl.dependencies ?? [];
  const invalidDeps = dependencies.filter(
    (id) => !context.existingImplIds.includes(id),
  );
  results.push({
    rule: 'R0-I45',
    passed: invalidDeps.length === 0,
    message:
      invalidDeps.length === 0
        ? 'All dependencies references are valid'
        : `Invalid dependencies references: ${invalidDeps.join(', ')}`,
  });

  // R0-I46: No self-references in dependencies
  const selfRef = dependencies.includes(impl.id);
  results.push({
    rule: 'R0-I46',
    passed: !selfRef,
    message: selfRef
      ? `Self-reference found in dependencies for ${impl.id}`
      : 'No self-references in dependencies',
  });

  // R0-I47: Dependency graph is acyclic (uses graph.ts detectCycles)
  const adjacencyList = buildAdjacencyList(context.dependencyGraph);
  const cycles = detectCycles(adjacencyList);
  results.push({
    rule: 'R0-I47',
    passed: cycles.length === 0,
    message:
      cycles.length === 0
        ? 'Dependency graph is acyclic'
        : `Cycles detected: ${cycles.map((c) => c.join(' -> ')).join('; ')}`,
  });

  // R0-I48: Status-array consistency
  // draft/validated = empty atomic_tasks, decomposed = non-empty
  let statusConsistent: boolean;
  if (impl.status === 'draft' || impl.status === 'validated') {
    statusConsistent = atomicTasks.length === 0;
  } else {
    // decomposed
    statusConsistent = atomicTasks.length > 0;
  }
  results.push({
    rule: 'R0-I48',
    passed: statusConsistent,
    message: statusConsistent
      ? `Status "${impl.status}" is consistent with atomic_tasks (count: ${atomicTasks.length})`
      : `Status "${impl.status}" is inconsistent with atomic_tasks (count: ${atomicTasks.length})`,
  });

  // R0-I50: Parent consistency -- every task in atomic_tasks has parent == this impl ID
  const parentMismatches: string[] = [];
  for (const taskId of atomicTasks) {
    const taskDef = context.taskDefinitions.find((t) => t.id === taskId);
    if (taskDef && taskDef.parent !== impl.id) {
      parentMismatches.push(
        `${taskId} has parent ${taskDef.parent}, expected ${impl.id}`,
      );
    }
  }
  results.push({
    rule: 'R0-I50',
    passed: parentMismatches.length === 0,
    message:
      parentMismatches.length === 0
        ? 'All tasks have correct parent reference'
        : `Parent mismatches: ${parentMismatches.join('; ')}`,
  });

  // R0-I51: Module containment -- every task's scope.modules is a subset of this impl's modules
  const moduleViolations: string[] = [];
  const implModules = new Set(impl.modules);
  for (const taskDef of context.taskDefinitions) {
    if (taskDef.parent === impl.id) {
      const extraModules = taskDef.scope.modules.filter(
        (m) => !implModules.has(m),
      );
      if (extraModules.length > 0) {
        moduleViolations.push(
          `${taskDef.id} has modules [${extraModules.join(', ')}] not in impl modules`,
        );
      }
    }
  }
  results.push({
    rule: 'R0-I51',
    passed: moduleViolations.length === 0,
    message:
      moduleViolations.length === 0
        ? 'All task modules are subsets of impl modules'
        : `Module violations: ${moduleViolations.join('; ')}`,
  });

  // ===============
  // Markdown checks
  // ===============

  const headings = extractHeadings(markdown);
  const h1s = headings.filter((h) => h.level === 1);
  const h2s = headings.filter((h) => h.level === 2);

  // R0-I60: H1 matches # {impl-id}: {title}
  const h1 = h1s[0];
  const h1Pattern = /^impl-[0-9a-f]{8}:\s+.+$/;
  const h1Valid = h1 !== undefined && h1Pattern.test(h1.text);
  results.push({
    rule: 'R0-I60',
    passed: h1Valid,
    message: h1Valid
      ? 'H1 matches required pattern'
      : `H1 does not match pattern "# impl-XXXXXXXX: Title". Got: "${h1?.text ?? '(none)'}"`,
  });

  // R0-I61: Exactly 7 H2 sections in order
  const h2Texts = h2s.map((h) => h.text);
  const hasExactly7H2 = h2s.length === 7;
  const h2OrderCorrect =
    h2Texts.length === REQUIRED_H2_SECTIONS.length &&
    h2Texts.every((text, i) => text === REQUIRED_H2_SECTIONS[i]);
  results.push({
    rule: 'R0-I61',
    passed: hasExactly7H2 && h2OrderCorrect,
    message:
      hasExactly7H2 && h2OrderCorrect
        ? 'Exactly 7 H2 sections in correct order'
        : `Expected 7 H2 sections in order [${REQUIRED_H2_SECTIONS.join(', ')}]. Got ${h2s.length}: [${h2Texts.join(', ')}]`,
  });

  // R0-I62: No H2 section is empty
  const emptyH2s = h2s.filter((h) => h.content.trim().length === 0);
  results.push({
    rule: 'R0-I62',
    passed: emptyH2s.length === 0,
    message:
      emptyH2s.length === 0
        ? 'All H2 sections have content'
        : `Empty H2 sections: ${emptyH2s.map((h) => h.text).join(', ')}`,
  });

  // R0-I63: Decomposition Notes has exactly 3 H3 subsections in order
  const decompositionNotesH2 = h2s.find((h) => h.text === 'Decomposition Notes');
  let h3sInDecomp: string[] = [];
  if (decompositionNotesH2) {
    // Find all H3 headings that fall within the Decomposition Notes section
    const h3s = headings.filter(
      (h) =>
        h.level === 3 &&
        h.startLine > decompositionNotesH2.startLine &&
        h.startLine <= decompositionNotesH2.endLine,
    );
    h3sInDecomp = h3s.map((h) => h.text);
  }
  const h3OrderCorrect =
    h3sInDecomp.length === REQUIRED_H3_DECOMPOSITION.length &&
    h3sInDecomp.every((text, i) => text === REQUIRED_H3_DECOMPOSITION[i]);
  results.push({
    rule: 'R0-I63',
    passed: h3OrderCorrect,
    message: h3OrderCorrect
      ? 'Decomposition Notes has exactly 3 H3 subsections in correct order'
      : `Expected 3 H3 subsections [${REQUIRED_H3_DECOMPOSITION.join(', ')}]. Got ${h3sInDecomp.length}: [${h3sInDecomp.join(', ')}]`,
  });

  // R0-I64: H1 impl-id matches definition's id field
  const h1Id = h1?.text.match(/^(impl-[0-9a-f]{8}):/)?.[1];
  const h1IdMatch = h1Id === impl.id;
  results.push({
    rule: 'R0-I64',
    passed: h1IdMatch,
    message: h1IdMatch
      ? 'H1 impl ID matches definition ID'
      : `H1 impl ID "${h1Id ?? '(none)'}" does not match definition ID "${impl.id}"`,
  });

  // R0-I66: At least one REQ-XX entry in the Requirements section
  const requirementsH2 = h2s.find((h) => h.text === 'Requirements');
  const requirementsContent = requirementsH2?.content ?? '';
  const reqPattern = /REQ-\d+/g;
  const reqMatches = requirementsContent.match(reqPattern);
  const hasReqEntries = reqMatches !== null && reqMatches.length > 0;
  results.push({
    rule: 'R0-I66',
    passed: hasReqEntries,
    message: hasReqEntries
      ? `Found ${reqMatches!.length} REQ-XX entries in Requirements section`
      : 'No REQ-XX entries found in Requirements section',
  });

  // R0-I67: Each REQ-XX entry includes a (from spec-XXXXXXXX#heading-slug) reference
  const reqLinePattern = /REQ-\d+/g;
  const reqLines = requirementsContent.split('\n');
  const reqEntriesWithoutRef: string[] = [];
  for (const line of reqLines) {
    const reqMatch = line.match(reqLinePattern);
    if (reqMatch) {
      for (const req of reqMatch) {
        // Check if the line contains a spec reference
        if (!/\(from spec-[0-9a-f]{8}#[a-z0-9-]+\)/.test(line)) {
          reqEntriesWithoutRef.push(req);
        }
      }
    }
  }
  results.push({
    rule: 'R0-I67',
    passed: reqEntriesWithoutRef.length === 0,
    message:
      reqEntriesWithoutRef.length === 0
        ? 'All REQ-XX entries have spec section references'
        : `REQ-XX entries missing spec references: ${reqEntriesWithoutRef.join(', ')}`,
  });

  return {
    valid: results.every((r) => r.passed),
    results,
  };
}
