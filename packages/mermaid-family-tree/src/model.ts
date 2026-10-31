export type Classification = 'queen' | 'tom' | 'human';

export interface Individual {
  readonly id: string;
  readonly label: string;
  readonly classes: readonly string[];
  readonly classification?: Classification;
  readonly img?: string;
  readonly birth?: string;
  readonly unknownFor?: string;
}

export interface Litter {
  readonly id: string;
  readonly label: string;
  readonly offspring: readonly string[];
  readonly queen: string;
  readonly candidateSires: readonly string[];
}

export interface Relationship {
  readonly id: string;
  readonly kind: 'maternity' | 'candidate' | 'confirmed' | 'adoption';
  readonly source: string;
  readonly target: string;
}

export interface Family {
  readonly individuals: readonly Individual[];
  readonly litters: readonly Litter[];
  readonly relationships: readonly Relationship[];
}

export interface ParsedIndividual {
  id: string;
  label?: string;
  classes: Set<string>;
  img?: string;
  birth?: string;
}

export interface ParsedFamily {
  individuals: Map<string, ParsedIndividual>;
  litters: Map<string, { id: string; label: string; offspring: Set<string> }>;
  edges: { source: string; target: string; adoption: boolean; line: number }[];
}

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function relationshipId(kind: Relationship['kind'], source: string, target: string): string {
  return JSON.stringify([kind, source, target]);
}
