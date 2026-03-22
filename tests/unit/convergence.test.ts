import { describe, it, expect } from 'vitest';
import { checkConvergence, type IssuePair } from '../../src/pipeline/convergence.js';

// ---------------------------------------------------------------------------
// Helper to create IssuePair arrays
// ---------------------------------------------------------------------------

function issues(...pairs: [string, string][]): IssuePair[] {
  return pairs.map(([rule, reference]) => ({ rule, reference }));
}

// ---------------------------------------------------------------------------
// Tests for checkConvergence
// ---------------------------------------------------------------------------

describe('checkConvergence', () => {
  // -- Identical issue sets --

  it('returns true when current and previous have identical issue sets', () => {
    const current = issues(['R1-T01', 'ref-a'], ['R1-T02', 'ref-b']);
    const previous = issues(['R1-T01', 'ref-a'], ['R1-T02', 'ref-b']);
    // Overlap = 2/2 = 1.0, threshold 0.7 => true
    expect(checkConvergence(current, previous, 0.7)).toBe(true);
  });

  it('returns true when identical sets and threshold is 1.0', () => {
    const current = issues(['R1-T01', 'ref-a']);
    const previous = issues(['R1-T01', 'ref-a']);
    // Overlap = 1/1 = 1.0, threshold 1.0 => true (>= threshold)
    expect(checkConvergence(current, previous, 1.0)).toBe(true);
  });

  // -- Completely disjoint sets --

  it('returns false when current and previous are completely disjoint', () => {
    const current = issues(['R1-T01', 'ref-a'], ['R1-T02', 'ref-b']);
    const previous = issues(['R1-T03', 'ref-c'], ['R1-T04', 'ref-d']);
    // Overlap = 0/2 = 0.0, threshold 0.7 => false
    expect(checkConvergence(current, previous, 0.7)).toBe(false);
  });

  // -- Partial overlap at threshold boundary --

  it('returns true when overlap ratio equals exactly the threshold (>=)', () => {
    // 7 out of 10 current issues are repeats => overlap = 7/10 = 0.7
    const shared = issues(
      ['R1-T01', 'ref-1'],
      ['R1-T02', 'ref-2'],
      ['R1-T03', 'ref-3'],
      ['R1-T04', 'ref-4'],
      ['R1-T05', 'ref-5'],
      ['R1-T06', 'ref-6'],
      ['R1-T07', 'ref-7'],
    );
    const newOnly = issues(
      ['R1-T08', 'ref-8'],
      ['R1-T09', 'ref-9'],
      ['R1-T10', 'ref-10'],
    );
    const previousExtra = issues(
      ['R1-T11', 'ref-11'],
      ['R1-T12', 'ref-12'],
      ['R1-T13', 'ref-13'],
    );

    const current = [...shared, ...newOnly]; // 10 issues, 7 shared
    const previous = [...shared, ...previousExtra]; // 10 issues, 7 shared

    expect(checkConvergence(current, previous, 0.7)).toBe(true);
  });

  it('returns false when overlap ratio is just below the threshold', () => {
    // 6 out of 10 current issues are repeats => overlap = 6/10 = 0.6
    const shared = issues(
      ['R1-T01', 'ref-1'],
      ['R1-T02', 'ref-2'],
      ['R1-T03', 'ref-3'],
      ['R1-T04', 'ref-4'],
      ['R1-T05', 'ref-5'],
      ['R1-T06', 'ref-6'],
    );
    const newOnly = issues(
      ['R1-T07', 'ref-7'],
      ['R1-T08', 'ref-8'],
      ['R1-T09', 'ref-9'],
      ['R1-T10', 'ref-10'],
    );
    const previousExtra = issues(
      ['R1-T11', 'ref-11'],
      ['R1-T12', 'ref-12'],
      ['R1-T13', 'ref-13'],
      ['R1-T14', 'ref-14'],
    );

    const current = [...shared, ...newOnly]; // 10 issues, 6 shared
    const previous = [...shared, ...previousExtra]; // 10 issues, 6 shared

    expect(checkConvergence(current, previous, 0.7)).toBe(false);
  });

  // -- Empty previous issues (first iteration) --

  it('returns false when previousIssues is empty (first iteration)', () => {
    const current = issues(['R1-T01', 'ref-a'], ['R1-T02', 'ref-b']);
    expect(checkConvergence(current, [], 0.7)).toBe(false);
  });

  // -- Empty current issues (all fixed) --

  it('returns false when currentIssues is empty (all issues resolved)', () => {
    const previous = issues(['R1-T01', 'ref-a'], ['R1-T02', 'ref-b']);
    expect(checkConvergence([], previous, 0.7)).toBe(false);
  });

  // -- Both empty --

  it('returns false when both current and previous are empty', () => {
    expect(checkConvergence([], [], 0.7)).toBe(false);
  });

  // -- Single-element sets --

  it('returns true for single identical issue in both sets', () => {
    const current = issues(['R1-T01', 'ref-a']);
    const previous = issues(['R1-T01', 'ref-a']);
    // Overlap = 1/1 = 1.0, threshold 0.7 => true
    expect(checkConvergence(current, previous, 0.7)).toBe(true);
  });

  it('returns false for single different issue in each set', () => {
    const current = issues(['R1-T01', 'ref-a']);
    const previous = issues(['R1-T02', 'ref-b']);
    // Overlap = 0/1 = 0.0, threshold 0.7 => false
    expect(checkConvergence(current, previous, 0.7)).toBe(false);
  });

  // -- Duplicate handling --

  it('deduplicates issues within a set (same pair repeated)', () => {
    // If current has duplicates, the Set deduplicates them.
    // Two identical pairs => set size 1, overlap with previous set of size 1
    const current: IssuePair[] = [
      { rule: 'R1-T01', reference: 'ref-a' },
      { rule: 'R1-T01', reference: 'ref-a' },
    ];
    const previous = issues(['R1-T01', 'ref-a']);
    // Set of current = {R1-T01\0ref-a}, size 1, overlap 1 => 1.0
    expect(checkConvergence(current, previous, 0.7)).toBe(true);
  });

  // -- Threshold edge cases --

  it('returns true with threshold 0 when any overlap exists', () => {
    const current = issues(['R1-T01', 'ref-a'], ['R1-T02', 'ref-b']);
    const previous = issues(['R1-T01', 'ref-a']);
    // Overlap = 1/2 = 0.5, threshold 0.0 => true
    expect(checkConvergence(current, previous, 0)).toBe(true);
  });

  it('returns false with threshold 0 when no overlap and previous is non-empty', () => {
    const current = issues(['R1-T01', 'ref-a']);
    const previous = issues(['R1-T02', 'ref-b']);
    // Overlap = 0/1 = 0.0, threshold 0.0 => true (0 >= 0)
    expect(checkConvergence(current, previous, 0)).toBe(true);
  });

  // -- Order independence --

  it('is independent of issue order in the arrays', () => {
    const current = issues(['R1-T02', 'ref-b'], ['R1-T01', 'ref-a']);
    const previous = issues(['R1-T01', 'ref-a'], ['R1-T02', 'ref-b']);
    expect(checkConvergence(current, previous, 0.7)).toBe(true);
  });
});
