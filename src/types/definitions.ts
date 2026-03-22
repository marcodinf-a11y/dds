export interface SpecDefinition {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'validated' | 'decomposed';
  version: number;
  implementation_docs?: string[];
  related_specs?: string[];
}
