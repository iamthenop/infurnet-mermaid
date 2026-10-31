/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { parseFamily } from '../src/parser.js';
import { layoutFamily } from '../src/layout.js';
import { renderFamily } from '../src/svg.js';
import { resolveGenerations } from '../src/generations.js';

const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
const references = import.meta.glob<string>('../examples/fixtures/*.svg', { eager: true, query: '?raw', import: 'default' });
const names = Object.keys(fixtures).map((path) => path.split('/').at(-1)!);
const source = (name: string) => fixtures[`../examples/fixtures/${name}`];

it.each(names)('preserves identities, distinct junctions, horizontal rails, and vertical drops in %s', (name) => {
  const family = parseFamily(source(name)), layout = layoutFamily(family);
  expect(layout.individuals.map((node) => node.individual.id)).toEqual(family.individuals.map((node) => node.id));
  expect(layout.litters).toHaveLength(family.litters.length);
  for (const litter of layout.litters) {
    expect(litter.rail[0].y).toBe(litter.rail[1].y);
    expect(litter.junction.y).toBeLessThan(litter.rail[0].y);
    expect(litter.drops.map((drop) => drop.child).sort()).toEqual([...litter.litter.offspring].sort());
    const generations = new Set(litter.drops.map((drop) => layout.individuals.find((node) => node.individual.id === drop.child)!.generation));
    expect(generations.size).toBeLessThanOrEqual(1);
    for (const drop of litter.drops) {
      expect(drop.points[0].x).toBe(drop.points[1].x);
      expect(drop.points[0].y).toBeLessThan(drop.points[1].y);
    }
  }
  for (const route of layout.relationships) {
    expect(route.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    route.points.slice(1).forEach((point, index) => expect(point.x === route.points[index].x || point.y === route.points[index].y).toBe(true));
    if (route.relationship.kind !== 'adoption') expect(route.points[0].y).toBeLessThan(route.points.at(-1)!.y);
    for (const node of layout.individuals) {
      if ([route.relationship.source, route.relationship.target].includes(node.individual.id)) continue;
      for (let index = 1; index < route.points.length; index++) {
        const a = route.points[index - 1], b = route.points[index];
        const left = node.x - node.width / 2, right = node.x + node.width / 2;
        const intersects = a.x === b.x
          ? a.x > left && a.x < right && Math.max(a.y, b.y) > node.top && Math.min(a.y, b.y) < node.bottom
          : a.y > node.top && a.y < node.bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
        expect(intersects, `${route.relationship.id} crosses ${node.individual.id}`).toBe(false);
      }
    }
  }
  for (const a of layout.individuals) for (const b of layout.individuals) {
    if (a.individual.id >= b.individual.id || a.generation !== b.generation) continue;
    expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual((a.width + b.width) / 2 + 40);
  }
  expect(renderFamily(family)).toBe(renderFamily(family));
  expect(renderFamily(family, { id: name.replace('.mmd', '') }) + '\n').toBe(references[`../examples/fixtures/${name.replace('.mmd', '.svg')}`]);
  expect(renderFamily(family)).not.toContain('data-litter-boundary');
});

it('keeps generation gaps without adding individuals or asserting candidate ancestry', () => {
  const family = parseFamily(source('generation-gap.mmd')), layout = layoutFamily(family);
  const founder = layout.individuals.find((node) => node.individual.id === 'Founder')!;
  const kitten = layout.individuals.find((node) => node.individual.id === 'Kitten')!;
  expect(kitten.generation - founder.generation).toBe(3);
  expect(layout.individuals).toHaveLength(5);
  expect(layout.relationships.find((route) => route.relationship.kind === 'ancestry')!.points).toHaveLength(7);
});

it('orders known birth dates without using dates to establish ancestry', () => {
  const family = parseFamily('familyTree TB\ncatmode\nQ:::queen\nQ@{birth:"2026"}\nsubgraph L\nA@{birth:"2025-07"}\nZ@{birth:"2025-06"}\nend\nQ-->L');
  const layout = layoutFamily(family), byId = new Map(layout.individuals.map((node) => [node.individual.id, node]));
  expect(byId.get('Z')!.x).toBeLessThan(byId.get('A')!.x);
  expect(byId.get('Q')!.generation).toBeLessThan(byId.get('Z')!.generation);
});

it('renders empty input and empty litters deterministically', () => {
  expect(renderFamily(parseFamily('familyTree TB\ncatmode'))).toContain('viewBox="0 0 160 80"');
  expect(renderFamily(parseFamily('familyTree TB\ncatmode\nsubgraph L\nend'))).toContain('data-litter="L"');
});

it('attaches confirmed parentage to the kitten nameplate independently of its sibling rail', () => {
  const layout = layoutFamily(parseFamily(source('confirmed-adoption.mmd')));
  const kitten = layout.individuals.find((node) => node.individual.id === 'Braus')!;
  const route = layout.relationships.find((route) => route.relationship.kind === 'confirmed')!;
  expect(route.points.at(-1)).toEqual({ x: kitten.x - kitten.width / 2, y: kitten.y });
  expect(route.points.at(-2)!.y).toBe(kitten.y);
});

it('orders partial dates and undated siblings consistently without inventing dates', () => {
  const model = parseFamily('familyTree TB\ncatmode\nsubgraph L\nZ@{birth:"2024"}\nA@{birth:"2025-06"}\nM\nend');
  const layout = layoutFamily(model), x = (id: string) => layout.individuals.find((node) => node.individual.id === id)!.x;
  expect(x('Z')).toBeLessThan(x('A'));
  expect(model.individuals.find((node) => node.id === 'M')!.birth).toBeUndefined();
});

it('generates distinct SVG identities for special identifiers and escaped labels', () => {
  const model = parseFamily('familyTree TB\ncatmode\n__proto__["A & B"]\nconstructor\na_b\na-b');
  const svg = renderFamily(model);
  const ids = [...svg.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(svg).toContain('A &amp; B');
});

it.each([
  ['A-->B', [['A', 'B', 1]]],
  ['A--->B', [['A', 'B', 2]]],
  ['A---->B', [['A', 'B', 3]]],
  ['A---------->B', [['A', 'B', 9]]],
  ['A-*->B', [['A', 'B', 1]]],
  ['A-->B\nB-->C\nA--->C', [['A', 'B', 1], ['B', 'C', 1], ['A', 'C', 2]]],
  ['A-->B\nB-->C\nA-*->C', [['A', 'C', 2]]],
  ['A--->C\nA-*->B\nB-*->C', [['A', 'B', 1], ['B', 'C', 1]]],
  ['A---->C\nA-*->B\nB-*->C', [['A', 'B', 1], ['B', 'C', 2]]],
  ['A---->B\nC-*->B', [['A', 'B', 3], ['C', 'B', 1]]],
  ['A--->B\nA-*->C', [['A', 'B', 2], ['A', 'C', 1]]],
  ['A--->B\nB-.->|adopt|A', [['A', 'B', 2]]],
] as const)('enforces declared and minimum feasible unknown distances: %s', (body, expected) => {
  const family = parseFamily(`familyTree TB\ncatmode\n${body}`), before = JSON.stringify(family);
  const layout = layoutFamily(family), nodes = new Map(layout.individuals.map((node) => [node.individual.id, node]));
  for (const [from, to, span] of expected) {
    expect(nodes.get(to)!.generation - nodes.get(from)!.generation).toBe(span);
    expect(nodes.get(to)!.y - nodes.get(from)!.y).toBe(212 * span);
  }
  expect(layout.individuals).toHaveLength(family.individuals.length);
  expect(JSON.stringify(family)).toBe(before);
});

it('detects contradictions across exact components connected by unknown inequalities', () => {
  const body = 'A--->B\nC-->D\nA-*->C\nD-*->B';
  expect(() => parseFamily(`familyTree TB\ncatmode\n${body}`)).toThrow(/Conflicting generation constraints/u);
  for (const text of ['A ---> B', 'C --> D', 'A -*-> C', 'D -*-> B']) {
    expect(() => parseFamily(`familyTree TB\ncatmode\n${body}`)).toThrow(text);
  }
});

it('keeps constraint solving independent of source order and birth dates', () => {
  const declarations = ['A---->D', 'A-*->B', 'B-*->C', 'C-*->D'];
  const parse = (lines: string[]) => parseFamily(`familyTree TB\ncatmode\n${lines.join('\n')}`);
  const first = parse(declarations), second = parse([...declarations].reverse());
  expect(resolveGenerations(first)).toEqual(resolveGenerations(second));
  expect(renderFamily(first)).toBe(renderFamily(second));
  expect(resolveGenerations(parse([...declarations, 'A@{birth:"2026"}', 'D@{birth:"2020"}']))).toEqual(resolveGenerations(first));
});
