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
