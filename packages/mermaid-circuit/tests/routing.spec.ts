/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { layoutCircuit, type CircuitLayout } from '../src/drawing/layout.js';
import { routeCircuit, type CircuitRouting } from '../src/drawing/routing.js';
import type { CircuitModel } from '../src/circuitTypes.js';
import type { Point } from '../src/drawing/geometry.js';

const fixtures = import.meta.glob('../examples/fixtures/*.mmd', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;
const key = (p: Point) => p.map((v) => v.toFixed(7)).join(',');

function connectivity(model: CircuitModel, layout: CircuitLayout, routes: CircuitRouting): void {
  expect(routes.nets.map((n) => n.net).sort()).toEqual(model.nets.map((n) => n.id).sort());
  for (const net of routes.nets) {
    const assigned = net.attachments.filter((a) => a.device);
    expect(assigned.map((a) => `${a.device}:${a.terminal}`).sort()).toEqual(model.connections.filter((c) => c.net === net.net).map((c) => `${c.device}:${c.terminal}`).sort());
    for (const a of assigned) expect(a.point).toEqual(layout.devices.find((d) => d.id === a.device)!.terminals[a.terminal!]);
    const placed = layout.nets.find((n) => n.id === net.net);
    if (placed) expect(net.attachments.find((a) => !a.device)!.point).toEqual(placed.anchor);
    const graph = new Map<string, Set<string>>();
    for (const segment of net.segments) {
      expect(Math.min(Math.abs(segment.a[0] - segment.b[0]), Math.abs(segment.a[1] - segment.b[1]))).toBeLessThan(1e-7);
      for (const [a, b] of [[segment.a, segment.b], [segment.b, segment.a]]) {
        if (!graph.has(key(a))) graph.set(key(a), new Set());
        graph.get(key(a))!.add(key(b));
      }
      for (const frame of [...layout.stages.map((s) => s.bounds), ...layout.blocks.flatMap((b) => b.bounds ? [b.bounds] : [])]) {
        const axis = Math.abs(segment.a[1] - segment.b[1]) < 1e-7 ? 0 : 1;
        const low = axis === 0 ? frame.minX : frame.minY, high = axis === 0 ? frame.maxX : frame.maxY;
        if (Math.max(segment.a[axis], segment.b[axis]) > low && Math.min(segment.a[axis], segment.b[axis]) < high) {
          for (const side of axis === 0 ? [frame.minY, frame.maxY] : [frame.minX, frame.maxX]) {
            expect(Math.abs(segment.a[1 - axis] - side)).toBeGreaterThanOrEqual(20 - 1e-7);
          }
        }
      }
      for (const pane of [...layout.devices, ...layout.nets]) {
        const x = (segment.a[0] + segment.b[0]) / 2, y = (segment.a[1] + segment.b[1]) / 2;
        expect(x > pane.bounds.minX + 1e-7 && x < pane.bounds.maxX - 1e-7 && y > pane.bounds.minY + 1e-7 && y < pane.bounds.maxY - 1e-7).toBe(false);
      }
    }
    if (net.attachments.length > 1) {
      const reached = new Set([key(net.attachments[0].point)]), pending = [...reached];
      while (pending.length) for (const next of graph.get(pending.pop()!) ?? []) if (!reached.has(next)) { reached.add(next); pending.push(next); }
      for (const a of net.attachments) expect(reached.has(key(a.point)), `${net.net} must reach ${a.device}.${a.terminal}`).toBe(true);
      expect(reached.size).toBe(graph.size);
      for (const [point, edges] of graph) if (edges.size === 1) expect(net.attachments.some((a) => key(a.point) === point), `Dangling wire at ${point}`).toBe(true);
    }
    expect(net.junctions.map(key).sort()).toEqual([...graph].filter(([, edges]) => edges.size >= 3).map(([p]) => p).sort());
    for (const other of routes.nets.filter((n) => n.net !== net.net)) for (const a of net.segments) for (const b of other.segments) {
      const ah = Math.abs(a.a[1] - a.b[1]) < 1e-7, bh = Math.abs(b.a[1] - b.b[1]) < 1e-7;
      if (ah === bh) {
        const axis = ah ? 0 : 1;
        if (Math.abs(a.a[1 - axis] - b.a[1 - axis]) < 1e-7) expect(Math.min(Math.max(a.a[axis], a.b[axis]), Math.max(b.a[axis], b.b[axis])) - Math.max(Math.min(a.a[axis], a.b[axis]), Math.min(b.a[axis], b.b[axis]))).toBeLessThan(0);
      } else {
        const h = ah ? a : b, v = ah ? b : a, p: Point = [v.a[0], h.a[1]];
        if (p[0] >= Math.min(h.a[0], h.b[0]) && p[0] <= Math.max(h.a[0], h.b[0]) && p[1] >= Math.min(v.a[1], v.b[1]) && p[1] <= Math.max(v.a[1], v.b[1])) {
          expect(routes.crossings.some((c) => same(c.point, p) && [c.over, c.under].includes(net.net) && [c.over, c.under].includes(other.net))).toBe(true);
          expect([...net.junctions, ...other.junctions].some((j) => same(j, p))).toBe(false);
        }
      }
    }
  }
}

it.each(Object.entries(fixtures))('routes every connection faithfully: %s', (_path, source) => {
  const model = parseCircuit(source), original = structuredClone(model), layout = layoutCircuit(model);
  const routes = routeCircuit(model, layout);
  connectivity(model, layout, routes);
  expect(routeCircuit(model, layout)).toEqual(routes);
  expect(model).toEqual(original);
  const reordered = { ...model, connections: [...model.connections].reverse() };
  expect(routeCircuit(reordered, layoutCircuit(reordered))).toEqual(routes);
});

it.each(['TB', 'LR'])('retains fractional %s attachments and centered outputs', (direction) => {
  const model = parseCircuit(`circuitDiagram A
Y([Y]):::pinOut
subgraph stage mixed
 direction ${direction}
 M[M]:::nmos
 R[R]:::resistor
end
subgraph stage single
 R2[R2]:::resistor
end
M ---|S:A| R
R ---|B| Y
R2 ---|A| Y`);
  const layout = layoutCircuit(model), routes = routeCircuit(model, layout);
  connectivity(model, layout, routes);
  if (direction === 'TB') expect(layout.devices.find((d) => d.id === 'R2')!.terminals.A[0]).toBe(255);
  else expect(layout.nets.find((n) => n.id === 'Y')!.anchor![1]).toBe(255);
});

it.each([false, true])('branches upper inputs first on the left (reversed declarations: %s)', (reverse) => {
  const source = fixtures['../examples/fixtures/nand2.mmd'];
  const model = parseCircuit(source), layout = layoutCircuit(model);
  const routes = routeCircuit(reverse ? { ...model, nets: [...model.nets].reverse() } : model, layout);
  const shared = layout.nets.filter((n) => routes.nets.find((r) => r.net === n.id)!.junctions.length && model.nets.find((item) => item.id === n.id)!.type === 'pinIn').sort((a, b) => a.anchor![1] - b.anchor![1]);
  for (let i = 1; i < shared.length; i++) {
    const upper = routes.nets.find((n) => n.net === shared[i - 1].id)!.junctions;
    const lower = routes.nets.find((n) => n.net === shared[i].id)!.junctions;
    expect(Math.max(...upper.map((p) => p[0]))).toBeLessThan(Math.min(...lower.map((p) => p[0])));
  }
  expect(routes.crossings.length).toBeGreaterThan(0);
  for (const target of layout.inputTargets) {
    const route = routes.nets.find((n) => n.net === target.net)!;
    const input = layout.nets.find((n) => n.id === target.net)!.anchor!;
    const terminal = layout.devices.find((d) => d.id === target.device)!.terminals[target.terminal];
    const straight = route.segments.filter((s) => same([s.a[0], input[1]], s.a) && same([s.b[0], input[1]], s.b));
    const length = straight.reduce((sum, s) => sum + Math.abs(s.b[0] - s.a[0]), 0);
    if (target.aligned) expect(length).toBeCloseTo(terminal[0] - input[0]);
    else expect(route.segments.some((s) => Math.abs(s.a[1] - s.b[1]) > 0)).toBe(true);
    expect(route.junctions.length).toBeGreaterThan(0);
    for (const p of route.junctions) expect(layout.stages.some(({ bounds: b }) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY)).toBe(false);
  }
});

it('rejects unresolved placement and impossible routes explicitly', () => {
  const unsupported = parseCircuit('circuitDiagram A\nIO([IO]):::pinInOut');
  expect(() => routeCircuit(unsupported, layoutCircuit(unsupported))).toThrow('Unsupported pinInOut placement: IO');
  const model = parseCircuit(fixtures['../examples/fixtures/series.mmd']), layout = layoutCircuit(model);
  const corrupt = { ...layout, devices: layout.devices.map((d, index) => index ? d : { ...d, terminals: { ...d.terminals, A: [300, 300] as Point } }) };
  expect(() => routeCircuit(model, corrupt)).toThrow('not on its symbol pane boundary');
  const obstructed = { ...layout, devices: [...layout.devices, { ...layout.devices[0], id: 'obstacle', bounds: { minX: -1000, minY: -1000, maxX: 2000, maxY: 2000 } }] };
  expect(() => routeCircuit(model, obstructed)).toThrow(/Cannot route net/u);

});

it('keeps wire geometry stable when connection statements are reordered', () => {
  const source = fixtures['../examples/fixtures/series.mmd'];
  const lines = source.trim().split('\n'), connections = lines.filter((line) => line.includes('---'));
  const reordered = [...lines.filter((line) => !line.includes('---')), ...connections.reverse()].join('\n');
  const geometry = (text: string) => {
    const model = parseCircuit(text);
    return routeCircuit(model, layoutCircuit(model)).nets.map((n) => ({
      endpoints: n.attachments.map((a) => [a.device, a.terminal, a.point]), segments: n.segments, junctions: n.junctions,
    }));
  };
  expect(geometry(reordered)).toEqual(geometry(source));
});

it('separates facing attachments on unrelated nets', () => {
  const model = parseCircuit('circuitDiagram A\nR1[R1]:::resistor\nR2[R2]:::resistor\nY([Y]):::pinOut\nZ([Z]):::pinOut\nR1 ---|B| Y\nR2 ---|A| Z');
  const layout = layoutCircuit(model);
  connectivity(model, layout, routeCircuit(model, layout));
});
