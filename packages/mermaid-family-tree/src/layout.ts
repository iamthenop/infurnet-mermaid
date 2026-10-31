import { graphStratify, layeringSimplex, sugiyama, type GraphNode } from 'd3-dag';
import { compareIds, type Family, type Individual, type Litter, type Relationship } from './model.js';
import { resolveGenerations } from './generations.js';

export interface Point { readonly x: number; readonly y: number }
export interface PlacedIndividual {
  readonly individual: Individual;
  readonly generation: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly top: number;
  readonly bottom: number;
}
export interface PlacedLitter {
  readonly litter: Litter;
  readonly junction: Point;
  readonly rail: readonly [Point, Point];
  readonly drops: readonly { child: string; points: readonly Point[] }[];
}
export interface RoutedRelationship {
  readonly relationship: Relationship;
  readonly points: readonly Point[];
  readonly label?: Point;
}
export interface FamilyLayout {
  readonly individuals: readonly PlacedIndividual[];
  readonly litters: readonly PlacedLitter[];
  readonly relationships: readonly RoutedRelationship[];
  readonly width: number;
  readonly height: number;
}

interface LayoutDatum { id: string; parentIds: string[]; layer: number; width: number }
const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const widthOf = (node: Individual): number => Math.max(132, Array.from(node.label).length * 8 + 32);
const round = (value: number): number => Math.round(value * 1000) / 1000;

function chronologicalOrder(nodes: readonly Individual[]): Individual[] {
  const start = (date: string) => `${date}${date.length === 4 ? '-01-01' : date.length === 7 ? '-01' : ''}`;
  const end = (date: string) => `${date}${date.length === 4 ? '-12-31' : date.length === 7 ? '-31' : ''}`;
  const remaining = [...nodes].sort((a, b) => compareIds(a.id, b.id)), result: Individual[] = [];
  while (remaining.length) {
    const next = remaining.findIndex((node) => !node.birth || !remaining.some((earlier) => earlier.birth && end(earlier.birth) < start(node.birth!)));
    result.push(remaining.splice(next, 1)[0]);
  }
  return result;
}

export function layoutFamily(family: Family): FamilyLayout {
  if (!family.individuals.length) return { individuals: [], litters: [], relationships: [], width: 160, height: 80 };
  const generation = resolveGenerations(family, true);
  const birthLitter = new Map<string, Litter>();
  for (const litter of family.litters) for (const child of litter.offspring) birthLitter.set(child, litter);
  const litterGeneration = new Map(family.litters.map((litter) => [litter.id, Math.max(
    1, ...litter.offspring.map((child) => generation.get(child)!),
    ...[litter.queen, ...litter.candidateSires].map((id) => generation.get(id)! + 1))]));
  const data: LayoutDatum[] = family.individuals.map((node) => ({ id: node.id, width: widthOf(node), layer: generation.get(node.id)! * 2,
    parentIds: [...new Set([
      ...(birthLitter.has(node.id) ? [`@litter:${birthLitter.get(node.id)!.id}`] : []),
      ...family.relationships.filter((edge) => (edge.kind === 'confirmed' || edge.kind === 'ancestry') && edge.target === node.id).map((edge) => edge.source),
    ])] }));
  for (const litter of family.litters) data.push({ id: `@litter:${litter.id}`, width: 12,
    layer: litterGeneration.get(litter.id)! * 2 - 1, parentIds: [litter.queen, ...litter.candidateSires] });
  const dag = graphStratify()(data);
  const layering = layeringSimplex().rank((node: GraphNode<LayoutDatum>) => node.data.layer)
    .group((node: GraphNode<LayoutDatum>) => String(node.data.layer));
  sugiyama().layering(layering).nodeSize((node: GraphNode<LayoutDatum>) => [node.data.width + 52, 24]).gap([28, 40])(dag);
  const seed = new Map([...dag.nodes()].map((node) => [node.data.id, node.x]));
  const xPositions = new Map<string, number>();
  for (const row of [...new Set(generation.values())].sort((a, b) => b - a)) {
    const groups = new Map<string, Individual[]>();
    for (const node of family.individuals.filter((item) => generation.get(item.id) === row)) {
      const key = birthLitter.has(node.id) ? `litter:${birthLitter.get(node.id)!.id}` : `individual:${node.id}`;
      const items = groups.get(key) ?? []; items.push(node); groups.set(key, items);
    }
    const blocks = [...groups].map(([id, unordered]) => {
      const nodes = chronologicalOrder(unordered);
      const children = family.litters.filter((litter) => nodes.some((node) => litter.queen === node.id || litter.candidateSires.includes(node.id)))
        .flatMap((litter) => litter.offspring).filter((child) => xPositions.has(child));
      const ideal = children.length ? mean(children.map((child) => xPositions.get(child)!)) : mean(nodes.map((node) => seed.get(node.id)!));
      return { id, nodes, ideal, width: nodes.reduce((sum, node) => sum + widthOf(node) + 52, -52) };
    }).sort((a, b) => a.ideal - b.ideal || compareIds(a.id, b.id));
    let cursor = -Infinity;
    for (const block of blocks) {
      const left = Math.max(block.ideal - block.width / 2, cursor);
      let x = left;
      for (const node of block.nodes) { xPositions.set(node.id, x + widthOf(node) / 2); x += widthOf(node) + 52; }
      cursor = left + block.width + 88;
    }
    const shift = mean(blocks.map((block) => block.ideal - mean(block.nodes.map((node) => xPositions.get(node.id)!))));
    for (const block of blocks) for (const node of block.nodes) xPositions.set(node.id, xPositions.get(node.id)! + shift);
  }
  const left = Math.min(...family.individuals.map((node) => xPositions.get(node.id)! - widthOf(node) / 2));
  const maxPortrait = Math.max(36, ...family.individuals.filter((node) => node.img).map(widthOf));
  const spacing = maxPortrait + 176;
  const individuals: PlacedIndividual[] = family.individuals.map((individual) => {
    const width = widthOf(individual), gen = generation.get(individual.id)!;
    const x = round(xPositions.get(individual.id)! - left + 60), y = maxPortrait + 60 + gen * spacing;
    return { individual, generation: gen, x, y, width, top: y - (individual.img ? width : 18), bottom: y + 18 };
  });
  const placed = new Map(individuals.map((node) => [node.individual.id, node]));
  const litters: PlacedLitter[] = family.litters.map((litter) => {
    const children = litter.offspring.map((child) => placed.get(child)!).sort((a, b) => a.x - b.x);
    const x = round(children.length ? mean(children.map((child) => child.x)) : mean([litter.queen, ...litter.candidateSires].map((id) => placed.get(id)!.x)));
    const top = children.length ? Math.min(...children.map((child) => child.top)) : maxPortrait + 60 + litterGeneration.get(litter.id)! * spacing - 18;
    const railY = top - 32, junction = { x, y: top - 64 };
    return { litter, junction, rail: [{ x: children[0]?.x ?? x - 12, y: railY }, { x: children.at(-1)?.x ?? x + 12, y: railY }],
      drops: children.map((child) => ({ child: child.individual.id, points: [{ x: child.x, y: railY }, { x: child.x, y: child.top }] })) };
  });
  const byLitter = new Map(litters.map((item) => [item.litter.id, item]));
  const contentRight = Math.max(...individuals.map((node) => node.x + node.width / 2));
  let outerLane = contentRight + 36;
  const relationships: RoutedRelationship[] = family.relationships.map((relationship, index) => {
    const from = placed.get(relationship.source)!;
    if (relationship.kind === 'adoption') {
      const to = placed.get(relationship.target)!;
      const lane = outerLane; outerLane += 28;
      const first = { x: from.x, y: from.bottom }, last = { x: to.x, y: to.bottom };
      const fromY = from.bottom + 30, toY = to.bottom + 30;
      if (fromY === toY) return { relationship, points: [first, { x: first.x, y: fromY }, { x: last.x, y: toY }, last],
        label: { x: (first.x + last.x) / 2, y: fromY + 16 } };
      return { relationship, points: [first, { x: first.x, y: fromY }, { x: lane, y: fromY },
        { x: lane, y: toY }, { x: last.x, y: toY }, last], label: { x: lane + 6, y: (fromY + toY) / 2 - 6 } };
    }
    const litter = byLitter.get(relationship.target), target = placed.get(relationship.target);
    const to = litter?.junction ?? { x: target!.x, y: target!.top };
    const outgoing = family.relationships.filter((edge) => edge.source === relationship.source && edge.kind !== 'adoption');
    const offset = outgoing.length > 1 ? -20 + 40 * outgoing.findIndex((edge) => edge.id === relationship.id) / (outgoing.length - 1) : 0;
    const start = { x: from.x + offset, y: from.bottom };
    const gap = (litterGeneration.get(relationship.target) ?? target?.generation ?? 0) - from.generation;
    const channelY = to.y - 18 - index % 4 * 8;
    if (relationship.kind === 'confirmed' || relationship.kind === 'ancestry') {
      const sideX = target!.x - target!.width / 2 - 24;
      const end: Point[] = [{ x: sideX, y: channelY }, { x: sideX, y: target!.y }, { x: target!.x - target!.width / 2, y: target!.y }];
      if (gap > 1) {
        const lane = outerLane; outerLane += 24;
        return { relationship, points: [start, { x: start.x, y: start.y + 32 }, { x: lane, y: start.y + 32 }, { x: lane, y: channelY }, ...end] };
      }
      return { relationship, points: [start, { x: start.x, y: channelY }, ...end] };
    }
    if (gap > 1) {
      const lane = outerLane; outerLane += 24;
      return { relationship, points: [start, { x: start.x, y: start.y + 32 }, { x: lane, y: start.y + 32 },
        { x: lane, y: channelY }, { x: to.x, y: channelY }, to] };
    }
    return { relationship, points: [start, { x: start.x, y: channelY }, { x: to.x, y: channelY }, to] };
  });
  return { individuals, litters, relationships, width: Math.ceil(outerLane + 80),
    height: Math.ceil(Math.max(...individuals.map((node) => node.bottom), ...litters.map((litter) => litter.rail[0].y),
      ...relationships.flatMap((route) => route.points.map((point) => point.y)), ...relationships.flatMap((route) => route.label ? [route.label.y] : [])) + 48) };
}
