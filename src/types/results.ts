export interface Ring0RuleResult {
  rule: string;
  passed: boolean;
  message?: string;
}

export interface Ring0Result {
  results: Ring0RuleResult[];
  valid: boolean;
}

export interface Ring1CheckResult {
  check: string;
  verdict: string;
  issues: string[];
}

export interface Ring1Result {
  results: Ring1CheckResult[];
}

export interface Ring2CheckResult {
  check: string;
  dimension: string;
  verdict: string;
  evidence: string;
  summary: string;
}

export interface Ring2Result {
  results: Ring2CheckResult[];
}
