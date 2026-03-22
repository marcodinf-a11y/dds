export interface Ring0RuleResult {
  rule: string;
  passed: boolean;
  message?: string;
}

export interface Ring0Result {
  results: Ring0RuleResult[];
  valid: boolean;
}

export interface Ring1Issue {
  reference: string;
  description: string;
}

export interface Ring1CheckResult {
  check: string;
  verdict: string;
  issues: Ring1Issue[];
}

export interface Ring2Evidence {
  reference: string;
  finding: string;
  assessment: string;
}

export interface Ring2CheckResult {
  check: string;
  dimension: string;
  verdict: string;
  evidence: Ring2Evidence[];
  summary: string;
}
