import { type Family, type GenerationSpan } from './model.js';

interface Constraint {
  readonly id?: string;
  readonly source: string;
  readonly target: string;
  readonly span: GenerationSpan;
  readonly description: string;
}

interface Bound {
  readonly from: number;
  readonly to: number;
  readonly distance: number;
  readonly reasons: readonly string[];
}

function conflict(reasons: readonly string[]): never {
  throw new Error(`Conflicting generation constraints: ${[...new Set(reasons)].join('; ')}.`);
}

function biologicalConstraints(family: Family): Constraint[] {
  const result: Constraint[] = [];
  const byId = new Map(family.individuals.map((node) => [node.id, node]));
  const confirmed = family.relationships.filter((edge) => edge.kind === 'confirmed');
  for (const edge of family.relationships) if (edge.kind === 'confirmed' || edge.kind === 'ancestry') {
    result.push({ ...edge, description: `${edge.source} ${edge.notation} ${edge.target}` });
  }
  for (const litter of family.litters) {
    for (const child of litter.offspring) {
      const mother = confirmed.find((edge) => edge.target === child && byId.get(edge.source)!.classification === 'queen');
      if (!mother) result.push({ source: litter.queen, target: child, span: { kind: 'exact', generations: 1 },
        description: `${litter.queen} --> ${litter.id} (maternity of ${child})` });
    }
  }
  return result;
}

/** Gaps yield to paths through intermediate individuals, excluding possible sires and adoption. */
export function redundantGapIds(family: Family): Set<string> {
  const children = new Map(family.individuals.map((node) => [node.id, new Set<string>()]));
  for (const edge of biologicalConstraints(family)) children.get(edge.source)!.add(edge.target);
  const redundant = new Set<string>();
  for (const edge of family.relationships) {
    if (edge.kind !== 'ancestry') continue;
    const pending = [...children.get(edge.source)!].filter((child) => child !== edge.target);
    const seen = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (id === edge.target) { redundant.add(edge.id); break; }
      if (seen.has(id)) continue;
      seen.add(id); pending.push(...children.get(id)!);
    }
  }
  return redundant;
}

function constraintsFor(family: Family, layout: boolean): Constraint[] {
  const redundant = redundantGapIds(family);
  const result = biologicalConstraints(family).filter((edge) => !edge.id || !redundant.has(edge.id));
  if (layout) for (const litter of family.litters) {
    for (const child of litter.offspring.slice(1)) result.push({ source: litter.offspring[0], target: child,
      span: { kind: 'exact', generations: 0 }, description: `litter ${litter.id} aligns ${litter.offspring[0]} and ${child}` });

    if (!litter.offspring.length) continue;
    for (const source of [litter.queen, ...litter.candidateSires]) result.push({ source, target: litter.offspring[0], span: { kind: 'unknown' },
      description: `${source} --> ${litter.id} (layout above litter)` });
  }
  return result;
}

function lowerBounds(count: number, bounds: readonly Bound[], initial: readonly number[]): number[] {
  const ranks = [...initial], previous = new Map<number, Bound>();
  for (let step = 0; step < count; step++) {
    let changed: number | undefined;
    for (const bound of bounds) if (ranks[bound.to] < ranks[bound.from] + bound.distance) {
      ranks[bound.to] = ranks[bound.from] + bound.distance;
      previous.set(bound.to, bound); changed = bound.to;
    }
    if (changed === undefined) return ranks;
    if (step === count - 1) {
      let cursor = changed;
      for (let i = 0; i < count; i++) cursor = previous.get(cursor)!.from;
      const start = cursor, reasons: string[] = [];
      do { const edge = previous.get(cursor)!; reasons.push(...edge.reasons); cursor = edge.from; } while (cursor !== start);
      conflict(reasons);
    }
  }
  return ranks;
}

/** Solve rank differences without changing declared spans or adding individuals. */
export function resolveGenerations(family: Family, layout = false): Map<string, number> {
  const constraints = constraintsFor(family, layout);
  const adjacent = new Map<string, { target: string; difference: number; reason: string }[]>(family.individuals.map((node) => [node.id, []]));
  for (const edge of constraints) if (edge.span.kind === 'exact') {
    adjacent.get(edge.source)!.push({ target: edge.target, difference: edge.span.generations, reason: edge.description });
    adjacent.get(edge.target)!.push({ target: edge.source, difference: -edge.span.generations, reason: edge.description });
  }
  const component = new Map<string, number>(), offset = new Map<string, number>(), trail = new Map<string, string[]>();
  const floors: number[] = [];
  for (const node of family.individuals) {
    if (component.has(node.id)) continue;
    const index = floors.length, queue = [node.id];
    floors.push(0); component.set(node.id, index); offset.set(node.id, 0); trail.set(node.id, []);
    for (let i = 0; i < queue.length; i++) {
      const source = queue[i];
      for (const edge of adjacent.get(source)!) {
        const expected = offset.get(source)! + edge.difference;
        if (offset.has(edge.target)) {
          if (offset.get(edge.target) !== expected) conflict([...trail.get(source)!, edge.reason, ...trail.get(edge.target)!]);
        } else {
          component.set(edge.target, index); offset.set(edge.target, expected);
          trail.set(edge.target, [...trail.get(source)!, edge.reason]); queue.push(edge.target);
          floors[index] = Math.max(floors[index], -expected);
        }
      }
    }
  }
  const bounds: Bound[] = [];
  for (const edge of constraints) if (edge.span.kind === 'unknown') {
    bounds.push({ from: component.get(edge.source)!, to: component.get(edge.target)!,
      distance: 1 + offset.get(edge.source)! - offset.get(edge.target)!,
      reasons: [...trail.get(edge.source)!, edge.description, ...trail.get(edge.target)!] });
  }
  lowerBounds(floors.length, bounds, floors);
  // Fix each free distance at its smallest feasible value, in stable graph order.
  for (const bound of [...bounds]) {
    const initial = floors.map(() => -Infinity); initial[bound.from] = 0;
    const distance = lowerBounds(floors.length, bounds, initial)[bound.to];
    bounds.push({ from: bound.to, to: bound.from, distance: -distance, reasons: bound.reasons });
  }
  const bases = lowerBounds(floors.length, bounds, floors);
  return new Map(family.individuals.map((node) => [node.id, bases[component.get(node.id)!] + offset.get(node.id)!]));
}
