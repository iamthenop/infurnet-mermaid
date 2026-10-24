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
    expect(net.components.flatMap((component) => component.attachments)).toEqual(net.attachments);
    expect(net.components.flatMap((component) => component.segments)).toEqual(net.segments);
    for (const component of net.components) {
      const local = new Map<string, Set<string>>();
      for (const segment of component.segments) for (const [a, b] of [[segment.a, segment.b], [segment.b, segment.a]]) {
        if (!local.has(key(a))) local.set(key(a), new Set());
        local.get(key(a))!.add(key(b));
      }
      if (component.attachments.length > 1) {
        const reached = new Set([key(component.attachments[0].point)]), pending = [...reached];
        while (pending.length) for (const next of local.get(pending.pop()!) ?? []) if (!reached.has(next)) { reached.add(next); pending.push(next); }
        for (const a of component.attachments) expect(reached.has(key(a.point)), `${net.net} must reach ${a.device ?? a.occurrence}.${a.terminal}`).toBe(true);
        expect(reached.size).toBe(local.size);
        for (const [point, edges] of local) if (edges.size === 1) expect(component.attachments.some((a) => key(a.point) === point), `Dangling wire at ${point}`).toBe(true);
      }
      if (layout.sectional) {
        const section = layout.sections!.find((section) => section.block === component.block)!;
        for (const attachment of component.attachments) {
          if (attachment.device) expect(section.stages).toContain(layout.devices.find((device) => device.id === attachment.device)!.stage);
          else {
            const occurrence = layout.nets.find((net) => net.occurrence === attachment.occurrence)!;
            expect(occurrence.id).toBe(net.net);
            expect(attachment.point).toEqual(occurrence.anchor);
            expect(occurrence.block ?? null).toBe(component.block);
          }
        }
        for (const point of component.segments.flatMap((segment) => [segment.a, segment.b])) {
          expect(point[0]).toBeGreaterThanOrEqual(section.bounds.minX + 20);
          expect(point[0]).toBeLessThanOrEqual(section.bounds.maxX - 20);
          expect(point[1]).toBeGreaterThanOrEqual(section.bounds.minY + 20);
          expect(point[1]).toBeLessThanOrEqual(section.bounds.maxY - 20);
        }
      }
    }
    if (net.components.length > 1) for (const component of net.components) {
      expect(component.attachments.some((attachment) => attachment.occurrence)).toBe(true);
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
  if (layout.blocks.filter((block) => block.bounds).length > 1) for (const target of layout.inputTargets.filter((target) => target.aligned)) {
    const input = layout.nets.find((net) => net.id === target.net)!.anchor!;
    const terminal = layout.devices.find((device) => device.id === target.device)!.terminals[target.terminal];
    const route = routes.nets.find((route) => route.net === target.net)!;
    const straightLength = route.segments.filter((segment) => segment.a[1] === input[1] && segment.b[1] === input[1])
      .reduce((length, segment) => length + Math.max(0, Math.min(terminal[0], Math.max(segment.a[0], segment.b[0]))
        - Math.max(input[0], Math.min(segment.a[0], segment.b[0]))), 0);
    expect(straightLength, `${target.net} must connect straight to ${target.device}.${target.terminal}`).toBeCloseTo(terminal[0] - input[0]);
  }
  for (const scope of layout.sections ?? [{ block: null }]) {
    const inputColumns = layout.nets.filter((net) => net.symbol === 'pinIn' && (net.block ?? null) === scope.block)
      .sort((a, b) => a.anchor![1] - b.anchor![1])
      .map((net) => routes.nets.find((route) => route.net === net.id)!.components.find((component) => component.block === scope.block)!.junctions)
      .filter((junctions) => junctions.length).map((junctions) => {
        expect(junctions.every((point) => point[0] === junctions[0][0])).toBe(true);
        return junctions[0][0];
      });
    if (inputColumns.length > 1) {
      const spacing = inputColumns[1] - inputColumns[0];
      expect(spacing).toBeGreaterThanOrEqual(20);
      for (let i = 2; i < inputColumns.length; i++) expect(inputColumns[i] - inputColumns[i - 1]).toBe(spacing);
    }
  }
  for (const group of layout.stages.flatMap((stage) => stage.groups)) {
    const devices = group.devices.map((id) => layout.devices.find((device) => device.id === id)!);
    if (group.topology !== 'parallel' || group.direction !== 'LR' || devices.length < 2
      || !devices.every((device) => device.rotation === 0 && ['pmos', 'nmos', 'pmosBlk', 'nmosBlk'].includes(device.symbol))) continue;
    for (const terminal of ['D', 'S']) {
      const railPoints = devices.map((device) => {
        const route = routes.nets.find((route) => route.attachments.some((a) => a.device === device.id && a.terminal === terminal))!;
        const direction = device.terminals[terminal][1] === device.bounds.minY ? -1 : 1;
        let point = device.terminals[terminal];
        for (let step = 0; step < route.segments.length; step++) {
          const incident = route.segments.filter((segment) => same(segment.a, point) || same(segment.b, point));
          if (incident.some((segment) => segment.a[1] === segment.b[1])) break;
          const next = incident.map((segment) => same(segment.a, point) ? segment.b : segment.a)
            .find((next) => next[0] === point[0] && Math.sign(next[1] - point[1]) === direction);
          expect(next, `${device.id}.${terminal} must run straight to the common rail`).toBeDefined();
          point = next!;
        }
        expect(direction < 0 ? Math.min(...devices.map((d) => d.bounds.minY)) - point[1]
          : point[1] - Math.max(...devices.map((d) => d.bounds.maxY))).toBeGreaterThanOrEqual(60);
        return point;
      });
      expect(railPoints.every((point) => point[1] === railPoints[0][1])).toBe(true);
    }
  }
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
  const output = layout.nets.find((net) => net.id === 'OUT')!.anchor!;
  const outputRoute = routes.nets.find((net) => net.net === 'OUT')!;
  expect(outputRoute.junctions.every((point) => point[1] === output[1])).toBe(true);
  const lastDrainX = Math.max(...outputRoute.attachments.filter((a) => a.device).map((a) => a.point[0]));
  for (const segment of outputRoute.segments.filter((s) => Math.max(s.a[0], s.b[0]) > lastDrainX)) {
    expect(segment.a[1]).toBe(output[1]);
    expect(segment.b[1]).toBe(output[1]);
  }
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
  const sectionModel = parseCircuit(fixtures['../examples/fixtures/xor2.mmd']);
  const sectionLayout = layoutCircuit(sectionModel);
  expect(() => routeCircuit(sectionModel, { ...sectionLayout, devices: sectionLayout.devices.filter((device) => device.id !== 'N3') }))
    .toThrow('Missing sectional attachment for N3.G on net Bbar');
  const missingEndpoint = { ...sectionLayout, nets: sectionLayout.nets.filter((net) => net.id !== 'Abar' || net.block !== 1) };
  expect(() => routeCircuit(sectionModel, missingEndpoint)).toThrow(/net Abar|Net Abar/u);
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


it.each(['A', 'B', 'Abar', 'Bbar', 'VDD', 'VSS'])('matches sectional endpoints by net identity: %s', (id) => {
  const model = parseCircuit(fixtures['../examples/fixtures/xor2.mmd']);
  const layout = layoutCircuit(model), routes = routeCircuit(model, layout);
  const net = routes.nets.find((net) => net.net === id)!;
  expect(model.nets.filter((net) => net.id === id)).toHaveLength(1);
  expect(net.components.map((component) => component.block)).toEqual([0, 1]);
  const endpoints = net.components.map((component) => component.attachments.filter((attachment) => attachment.occurrence));
  for (const appearances of endpoints) {
    expect(appearances.length).toBeGreaterThan(0);
    for (const endpoint of appearances) expect(layout.nets.find((net) => net.occurrence === endpoint.occurrence)!.id).toBe(id);
  }
  const coordinates = net.components.map((component) => new Set(component.segments.flatMap((segment) => [key(segment.a), key(segment.b)])));
  expect([...coordinates[0]].some((point) => coordinates[1].has(point))).toBe(false);
});

it('keeps equal labels on different sectional nets separate', () => {
  const source = fixtures['../examples/fixtures/xor2.mmd'];
  const original = parseCircuit(source);
  const model = parseCircuit(source.replace(/(Abar|Bbar)\(\("[^"]*"\)\)/gu, '$1(("shared"))'));
  expect(model.nets.filter((net) => net.label === 'shared').map((net) => net.id)).toEqual(['Abar', 'Bbar']);
  const layout = layoutCircuit(model), routes = routeCircuit(model, layout);
  expect(routes).toEqual(routeCircuit(original, layoutCircuit(original)));
  connectivity(model, layout, routes);
});

it.each([[false, false], [false, true], [true, false], [true, true]])('retains the routed XOR truth table for A=%s B=%s', (a, b) => {
  const model = parseCircuit(fixtures['../examples/fixtures/xor2.mmd']);
  const routes = routeCircuit(model, layoutCircuit(model));
  expect(model.devices).toHaveLength(12);
  expect(model.connections).toHaveLength(36);
  expect(routes.nets.flatMap((net) => net.attachments.filter((attachment) => attachment.device))).toHaveLength(36);
  const terminalNet = (device: string, terminal: string) => routes.nets.find((net) => net.attachments.some((attachment) => attachment.device === device && attachment.terminal === terminal))!.net;
  const signals = new Map([['A', a], ['B', b]]);
  const reachable = (start: string, devices: CircuitModel['devices']) => {
    const edges = devices.filter((device) => {
      const gate = signals.get(terminalNet(device.id, 'G'));
      expect(gate).toBeDefined();
      return device.type === 'pmos' ? !gate : gate;
    }).map((device) => [terminalNet(device.id, 'D'), terminalNet(device.id, 'S')]);
    const reached = new Set([start]);
    for (let pass = 0; pass < model.nets.length; pass++) for (const [left, right] of edges) {
      if (reached.has(left)) reached.add(right);
      if (reached.has(right)) reached.add(left);
    }
    return reached;
  };
  const inverters = model.devices.filter((device) => model.stages[device.stage].block === 0);
  for (const id of ['Abar', 'Bbar']) {
    const reached = reachable(id, inverters);
    expect(Number(reached.has('VDD')) + Number(reached.has('VSS'))).toBe(1);
    signals.set(id, reached.has('VDD'));
  }
  expect(signals.get('Abar')).toBe(!a);
  expect(signals.get('Bbar')).toBe(!b);
  const output = reachable('OUT', model.devices);
  expect(output.has('VDD')).toBe(a !== b);
  expect(output.has('VSS')).toBe(a === b);
  expect(reachable('VDD', model.devices).has('VSS')).toBe(false);
});
