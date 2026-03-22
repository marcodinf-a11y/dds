export interface SpecDefinition {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'validated' | 'decomposed';
  version: number;
  implementation_docs?: string[];
  related_specs?: string[];
}

export interface ImplDefinition {
  id: string;
  spec_sections: string[];
  description: string;
  modules: string[];
  status: 'draft' | 'validated' | 'decomposed';
  atomic_tasks?: string[];
  dependencies?: string[];
}

export interface TestCriterion {
  id: string;
  type: 'test';
  description: string;
  verify: string;
}

export interface BuildCriterion {
  id: string;
  type: 'build';
  description: string;
  verify: string;
}

export interface LintCriterion {
  id: string;
  type: 'lint';
  description: string;
  verify: string;
}

export interface ReviewCriterion {
  id: string;
  type: 'review';
  description: string;
  rubric: string;
}

export type AcceptanceCriterion =
  | TestCriterion
  | BuildCriterion
  | LintCriterion
  | ReviewCriterion;

export interface TaskDefinition {
  id: string;
  parent: string;
  description: string;
  blocked_by: string[];
  blocks: string[];
  scope: {
    files: string[];
    modules: string[];
  };
  acceptance_criteria: AcceptanceCriterion[];
  context_refs: string[];
}

export interface CriterionResult {
  criterion_id: string;
  verdict: 'pass' | 'fail' | 'skipped';
  output?: string;
}

export interface ExecutionRecord {
  task_id: string;
  run: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'abandoned';
  criteria_results: CriterionResult[];
  commits?: string[];
  scope_violations?: string[];
  agent_notes?: string;
  token_usage?: number;
  started_at: string;
  finished_at?: string | null;
}
