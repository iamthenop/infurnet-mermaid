import { compareIds, relationshipId, type Family, type Individual, type Litter, type ParsedFamily, type Relationship } from './model.js';
import { resolveGenerations } from './generations.js';

function validateBirth(value: string, id: string): void {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(value);
  if (!match) throw new Error(`Invalid birth metadata for ${id}: use YYYY, YYYY-MM, or YYYY-MM-DD.`);
  const year = Number(match[1]), month = Number(match[2] ?? 1), day = Number(match[3] ?? 1);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new Error(`Invalid birth date for ${id}: ${value}.`);
}

export function validateFamily(parsed: ParsedFamily): Family {
  const individuals: Individual[] = [];
  for (const node of parsed.individuals.values()) {
    if (parsed.litters.has(node.id)) throw new Error(`Identifier ${node.id} names both an individual and a litter.`);
    const roles = [...node.classes].filter((name) => name === 'queen' || name === 'tom' || name === 'human');
    if (roles.length > 1) throw new Error(`Ambiguous reproductive classification for ${node.id}: ${roles.join(', ')}.`);
    if (node.birth !== undefined) validateBirth(node.birth, node.id);
    if (node.img !== undefined && (!node.img.trim() || /[\u0000-\u0020]/u.test(node.img)
      || (/^[a-z][a-z\d+.-]*:/iu.test(node.img) && !/^(https?:|data:image\/(png|jpeg|gif|webp);base64,)/iu.test(node.img)))) {
      throw new Error(`Invalid portrait reference for ${node.id}: use a relative URL, HTTP(S), or raster image data URL.`);
    }
    individuals.push({ id: node.id, label: node.label ?? node.id, classes: [...node.classes].sort(compareIds),
      classification: roles[0] as Individual['classification'], img: node.img, birth: node.birth });
  }
  const byId = new Map(individuals.map((node) => [node.id, node]));
  const relationships = new Map<string, Relationship>();
  const add = (kind: 'maternity' | 'candidate' | 'adoption', source: string, target: string) => {
    const id = relationshipId(kind, source, target);
    relationships.set(id, { id, kind, source, target });
  };
  for (const edge of parsed.edges) {
    if (parsed.litters.has(edge.source)) throw new Error(`Line ${edge.line}: litter ${edge.source} cannot be a parent or adopter.`);
    const parent = byId.get(edge.source)!;
    if (edge.adoption) {
      if (parsed.litters.has(edge.target)) throw new Error(`Line ${edge.line}: adoption targets an individual, not litter ${edge.target}.`);
      if (edge.source === edge.target) throw new Error(`Individual ${edge.source} cannot adopt itself.`);
      add('adoption', edge.source, edge.target);
    } else {
      if (parent.classification === 'human' || byId.get(edge.target)?.classification === 'human') throw new Error(`Line ${edge.line}: biological ancestry involving human ${parent.classification === 'human' ? parent.id : edge.target} is outside catmode.`);
      if (parsed.litters.has(edge.target)) {
        if (edge.notation !== '-->') throw new Error(`Line ${edge.line}: generation spans apply to individuals; use --> for litter ${edge.target}.`);
        if (parent.classification !== 'queen' && parent.classification !== 'tom') {
          throw new Error(`Line ${edge.line}: parent ${parent.id} requires an unambiguous queen or tom classification.`);
        }
        add(parent.classification === 'queen' ? 'maternity' : 'candidate', edge.source, edge.target);
      } else {
        const kind = edge.notation === '-->' ? 'confirmed' : 'ancestry';
        const id = kind === 'confirmed' ? relationshipId(kind, edge.source, edge.target)
          : JSON.stringify([kind, edge.source, edge.target, edge.notation]);
        relationships.set(id, { id, kind, source: edge.source, target: edge.target, span: edge.span, notation: edge.notation });
      }
    }
  }
  const membership = new Map<string, string>();
  const litters: Litter[] = [];
  for (const input of parsed.litters.values()) {
    const parents = [...relationships.values()].filter((edge) => edge.target === input.id);
    const queens = parents.filter((edge) => edge.kind === 'maternity').map((edge) => edge.source);
    if (queens.length > 1) throw new Error(`Multiple queens for litter ${input.id}: ${queens.join(', ')}.`);
    const queen = queens[0] ?? `@unknown-queen:${input.id}`;
    if (!queens.length) {
      const unknown: Individual = { id: queen, label: 'Unknown queen', classes: ['queen'], classification: 'queen', unknownFor: input.id };
      individuals.push(unknown); byId.set(queen, unknown); add('maternity', queen, input.id);
    }
    for (const child of input.offspring) {
      if (membership.has(child)) throw new Error(`Individual ${child} belongs to multiple birth litters: ${membership.get(child)}, ${input.id}.`);
      if (byId.get(child)?.classification === 'human') throw new Error(`Human ${child} cannot belong to cat litter ${input.id}.`);
      membership.set(child, input.id);
    }
    litters.push({ id: input.id, label: input.label, offspring: [...input.offspring].sort(compareIds), queen,
      candidateSires: parents.filter((edge) => edge.kind === 'candidate').map((edge) => edge.source).sort(compareIds) });
  }
  const family: Family = { individuals: individuals.sort((a, b) => compareIds(a.id, b.id)),
    litters: litters.sort((a, b) => compareIds(a.id, b.id)), relationships: [...relationships.values()].sort((a, b) => compareIds(a.id, b.id)) };
  for (const child of individuals) {
    const confirmed = family.relationships.filter((edge) => edge.kind === 'confirmed' && edge.target === child.id);
    for (const role of ['queen', 'tom']) {
      const parents = confirmed.filter((edge) => byId.get(edge.source)!.classification === role);
      if (parents.length > 1) throw new Error(`Multiple confirmed ${role} parents for ${child.id}: ${parents.map((edge) => edge.source).join(', ')}.`);
      const litter = litters.find((item) => item.offspring.includes(child.id));
      if (role === 'queen' && parents.length && litter && !byId.get(litter.queen)!.unknownFor && parents[0].source !== litter.queen) {
        throw new Error(`Confirmed queen ${parents[0].source} conflicts with queen ${litter.queen} of ${child.id}'s litter ${litter.id}.`);
      }
    }
  }
  assertAcyclic(family);
  const definite = parentage(family), possible = parentage(family, true);
  const hasAncestor = (individual: string, ancestor: string): boolean => individual === ancestor
    || [...definite.get(individual)!].some((parent) => hasAncestor(parent, ancestor));
  for (const [child, parents] of possible) for (const parent of parents) {
    if (!definite.get(child)!.has(parent) && hasAncestor(parent, child)) {
      throw new Error(`Impossible candidate ancestry: ${parent} cannot sire its ancestor ${child}.`);
    }
  }
  resolveGenerations(family);
  return family;
}

export function parentage(family: Family, includeCandidates = false): Map<string, Set<string>> {
  const result = new Map(family.individuals.map((node) => [node.id, new Set<string>()]));
  const byId = new Map(family.individuals.map((node) => [node.id, node]));
  for (const edge of family.relationships) if (edge.kind === 'confirmed') result.get(edge.target)!.add(edge.source);
  for (const litter of family.litters) for (const child of litter.offspring) {
    const parents = result.get(child)!;
    if (![...parents].some((id) => byId.get(id)!.classification === 'queen')) parents.add(litter.queen);
    if (includeCandidates && ![...parents].some((id) => byId.get(id)!.classification === 'tom')) {
      for (const sire of litter.candidateSires) parents.add(sire);
    }
  }
  for (const edge of family.relationships) if (edge.kind === 'ancestry') result.get(edge.target)!.add(edge.source);
  return result;
}

function assertAcyclic(family: Family): void {
  const parents = parentage(family);
  const active = new Set<string>(), complete = new Set<string>(), path: string[] = [];
  const visit = (id: string): void => {
    if (active.has(id)) throw new Error(`Biological ancestry cycle: ${[...path.slice(path.indexOf(id)), id].join(' -> ')}.`);
    if (complete.has(id)) return;
    active.add(id); path.push(id);
    for (const parent of parents.get(id)!) visit(parent);
    active.delete(id); path.pop(); complete.add(id);
  };
  for (const id of parents.keys()) visit(id);
}
