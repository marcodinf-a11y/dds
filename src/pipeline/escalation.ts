/**
 * Escalation report generation for the refinement loop.
 *
 * When convergence is detected or max iterations are reached, an escalation
 * report is written as structured JSON to pipeline/escalations/ for human review.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { IssuePair } from "./convergence.js";

/** Record of a single refinement iteration. */
export interface IterationRecord {
  iteration: number;
  ring0_passed: boolean;
  ring1_passed: boolean | null;
  ring2_passed: boolean | null;
  issues_found: number;
  fix_applied: string | null;
}

/** Structured escalation report written when the refinement loop cannot resolve issues. */
export interface EscalationReport {
  document_id: string;
  document_level: string;
  reason: "convergence" | "max_iterations";
  iterations_completed: number;
  unresolved_issues: IssuePair[];
  history: IterationRecord[];
  document_snapshot: string;
  timestamp: string;
}

/** Default output directory for escalation reports, relative to project root. */
const ESCALATIONS_DIR = "pipeline/escalations";

/**
 * Generate an escalation report and write it to disk as formatted JSON.
 *
 * @param report - The escalation report data.
 * @returns The file path of the written report (relative to project root).
 */
export function generateEscalationReport(report: EscalationReport): string {
  // Ensure the output directory exists.
  fs.mkdirSync(ESCALATIONS_DIR, { recursive: true });

  // Sanitize timestamp for use in filename (replace colons, etc.).
  const safeTimestamp = report.timestamp.replace(/[:.]/g, "-");
  const filename = `${report.document_id}-${safeTimestamp}.json`;
  const filePath = path.join(ESCALATIONS_DIR, filename);

  // Write the report as formatted JSON.
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(filePath, json + "\n", "utf-8");

  return filePath;
}
