/**
 * Convergence detection for the refinement loop.
 *
 * Compares sets of (rule, reference) issue pairs between iterations
 * to detect when automated fixes are no longer making progress.
 *
 * Overlap ratio formula: |intersection| / |current|
 *   - Proportion of current issues that are repeats from the previous iteration.
 *   - When this ratio meets or exceeds the threshold, the loop has plateaued.
 */

/** A single validation issue identified by its rule and reference. */
export interface IssuePair {
  rule: string;
  reference: string;
}

/**
 * Serialize an IssuePair to a deterministic string key for set operations.
 * Uses a separator that is unlikely to appear in rule or reference strings.
 */
function serializeIssuePair(pair: IssuePair): string {
  return `${pair.rule}\0${pair.reference}`;
}

/**
 * Check whether the refinement loop has converged (plateaued).
 *
 * Convergence means the same issues keep reappearing across iterations,
 * indicating the fixer is not making meaningful progress.
 *
 * @param currentIssues  - Issues found in the current iteration.
 * @param previousIssues - Issues found in the previous iteration.
 * @param threshold      - Overlap ratio at or above which convergence is declared
 *                         (e.g. 0.7 means 70% of current issues are repeats).
 * @returns `true` if the overlap ratio >= threshold, `false` otherwise.
 *          Returns `false` when previousIssues is empty (first iteration).
 *          Returns `false` when currentIssues is empty (no issues = passed).
 */
export function checkConvergence(
  currentIssues: IssuePair[],
  previousIssues: IssuePair[],
  threshold: number,
): boolean {
  // First iteration -- no previous data to compare against.
  if (previousIssues.length === 0) {
    return false;
  }

  // No current issues means validation passed -- not a convergence plateau.
  if (currentIssues.length === 0) {
    return false;
  }

  const currentSet = new Set(currentIssues.map(serializeIssuePair));
  const previousSet = new Set(previousIssues.map(serializeIssuePair));

  // Count how many current issues also appeared in the previous iteration.
  let intersectionSize = 0;
  for (const key of currentSet) {
    if (previousSet.has(key)) {
      intersectionSize++;
    }
  }

  // Overlap ratio: proportion of current issues that are repeats.
  const overlapRatio = intersectionSize / currentSet.size;

  return overlapRatio >= threshold;
}
