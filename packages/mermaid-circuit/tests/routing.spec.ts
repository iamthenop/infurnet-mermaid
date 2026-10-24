/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { layoutCircuit, type CircuitLayout } from '../src/drawing/layout.js';
import { routeCircuit, sharingBudget, pinNearby, pinClearance, routeOrdinaryBranch, type CircuitRouting, type RoutedComponent } from '../src/drawing/routing.js';
import type { CircuitModel } from '../src/circuitTypes.js';
import type { Point } from '../src/drawing/geometry.js';

const fixtures = import.meta.glob('../examples/fixtures/*.mmd', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;
const key = (p: Point) => p.map((v) => v.toFixed(7)).join(',');
const onGrid = (p: Point) => p.every((value) => Math.abs(value / 10 - Math.round(value / 10)) < 1e-7);

function attachmentLeads(component: RoutedComponent) {
  const covered = new Set<number>();
  const leads = component.attachments.filter((attachment) => !onGrid(attachment.point) && component.segments.length).map((attachment) => {
    const points = [attachment.point], visited = new Set<number>();
    let length = 0;
    while (!onGrid(points.at(-1)!)) {
      const point = points.at(-1)!;
      const next = component.segments.flatMap((segment, index) => !visited.has(index) && (same(segment.a, point) || same(segment.b, point)) ? [index] : []);
      expect(next, `Attachment lead must be continuous and unbranched at ${point}`).toHaveLength(1);
      const index = next[0], segment = component.segments[index];
      const end = same(point, segment.a) ? segment.b : segment.a;
      expect(points.some((p) => same(p, end)), 'Attachment lead must not loop').toBe(false);
      length += Math.abs(point[0] - end[0]) + Math.abs(point[1] - end[1]);
      expect(length, 'Attachment lead must reach the grid locally').toBeLessThanOrEqual(70 + 1e-7);
      points.push(end); visited.add(index); covered.add(index);
    }
    const end = points.at(-1)!;
    expect(component.attachments.some((a) => same(a.point, end)) || component.segments.some((segment) =>
      onGrid(segment.a) && onGrid(segment.b) && (same(segment.a, end) || same(segment.b, end))), 'Lead must join an ordinary grid track or exact attachment').toBe(true);
    return { attachment, points };
  });
  component.segments.forEach((segment, index) => {
    expect(onGrid(segment.a) && onGrid(segment.b) || covered.has(index), `Off-grid segment ${segment.a}–${segment.b} must belong to an exact attachment lead`).toBe(true);
  });
  return leads;
}

function connectivity(model: CircuitModel, initial: CircuitLayout, routes: CircuitRouting): void {
  const layout = routes.layout;
  expect(layout.devices).toEqual(initial.devices);
  expect(routes.nets.map((n) => n.net).sort()).toEqual(model.nets.map((n) => n.id).sort());
  for (const net of routes.nets) {
    if (model.nets.find((n) => n.id === net.net)!.implicit) {
      expect(net.components).toHaveLength(1);
      expect(net.attachments.some((a) => a.occurrence)).toBe(false);
    }
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
      for (const frame of net.attachments.some((a) => a.occurrence) ? [] : [...layout.stages.map((s) => s.bounds), ...layout.blocks.flatMap((b) => b.bounds ? [b.bounds] : [])]) {
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
      attachmentLeads(component);
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
  for (const branch of routes.branches) {
    const horizontal = (s: typeof branch.segments[number]) => Math.abs(s.a[1] - s.b[1]) < 1e-7;
    const bends = branch.segments.slice(1).filter((s, i) => horizontal(s) !== horizontal(branch.segments[i])).length;
    const crossed = routes.crossings.filter((c) => (c.over === branch.net || c.under === branch.net) && branch.segments.some((s) =>
      c.point[0] >= Math.min(s.a[0], s.b[0]) - 1e-7 && c.point[0] <= Math.max(s.a[0], s.b[0]) + 1e-7
      && c.point[1] >= Math.min(s.a[1], s.b[1]) - 1e-7 && c.point[1] <= Math.max(s.a[1], s.b[1]) + 1e-7));
    expect(branch.bends).toBe(bends);
    expect(branch.crossings).toBe(new Set(crossed.map((c) => key(c.point))).size);
    expect(branch.bends + branch.crossings).toBeLessThanOrEqual(branch.kind === 'shared' ? 3 : 5);
    if (branch.kind === 'shared') expect(sharingBudget(branch.bends, branch.crossings)).toBe(true);
  }
  for (const pin of routes.layout.nets) {
    expect(pinClearance(pin.bounds, layout.devices.map((d) => d.bounds), [...layout.devices, ...routes.layout.nets.filter((n) => n !== pin)].map((p) => p.bounds))).toBe(true);
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
  const point = direction === 'TB' ? layout.devices.find((d) => d.id === 'R2')!.terminals.A : layout.devices.find((d) => d.id === 'R2')!.terminals.A;
  if (direction === 'TB') expect(point[0]).toBe(255);
  else expect(layout.nets.find((n) => n.id === 'Y')!.anchor![1]).toBe(255);
  const lead = routes.nets.find((net) => net.net === 'Y')!.components.flatMap(attachmentLeads).find((lead) => same(lead.attachment.point, point))!;
  if (!onGrid(point)) {
    expect(lead.points[0]).toEqual(point);
    expect(lead.points.length).toBeGreaterThan(1);
    expect(onGrid(lead.points.at(-1)!)).toBe(true);
  }
});

it.each([false, true])('resolves repeated inputs within the branch budget (reversed declarations: %s)', (reverse) => {
  const model = parseCircuit(fixtures['../examples/fixtures/nand2.mmd']);
  const ordered = reverse ? { ...model, nets: [...model.nets].reverse() } : model;
  const layout = layoutCircuit(ordered), routes = routeCircuit(ordered, layout);
  connectivity(ordered, layout, routes);
  for (const branch of routes.branches.filter((b) => b.kind === 'shared')) expect(sharingBudget(branch.bends, branch.crossings)).toBe(true);
  expect(routeCircuit(ordered, layout)).toEqual(routes);
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
  connectivity(sectionModel, missingEndpoint, routeCircuit(sectionModel, missingEndpoint));
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
  expect([...new Set(net.components.map((component) => component.block))]).toEqual([0, 1]);
  const endpoints = net.components.map((component) => component.attachments.filter((attachment) => attachment.occurrence));
  for (const appearances of endpoints) {
    expect(appearances.length).toBeGreaterThan(0);
    for (const endpoint of appearances) expect(routes.layout.nets.find((net) => net.occurrence === endpoint.occurrence)!.id).toBe(id);
  }
  const coordinates = net.components.map((component) => new Set(component.segments.flatMap((segment) => [key(segment.a), key(segment.b)])));
  for (let first = 0; first < coordinates.length; first++) for (const other of coordinates.slice(first + 1)) {
    expect([...coordinates[first]].some((point) => other.has(point))).toBe(false);
  }
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

it.each([
  [0, 0, true], [1, 0, true], [2, 0, true], [0, 1, true], [1, 1, true], [2, 1, true],
  [0, 2, true], [1, 2, true], [2, 2, false], [3, 0, false], [0, 3, false],
])('enforces the approved local branch budget B=%s C=%s', (b, c, accepted) => {
  expect(sharingBudget(Number(b), Number(c))).toBe(accepted);
});

it.each([[600, 480, true], [600.01, 480, false], [600, 480.01, false], [-600, -480, true], [599.99, 479.99, true]])(
  'uses rectangular continuous sharing bounds at (%s,%s)', (x, y, accepted) => {
    const box = { minX: 15, minY: 15, maxX: 135, maxY: 135 };
    expect(pinNearby(box, { minX: 15 + Number(x), minY: 15 + Number(y), maxX: 135 + Number(x), maxY: 135 + Number(y) })).toBe(accepted);
  });

it.each([[0, 0, false], [120, 0, false], [0, 120, false], [239.99, 0, false], [0, 239.99, false],
  [240, 0, true], [0, 240, true], [120, 120, true], [-120, -120, true], [119.99, 120, false]])(
  'checks continuous device/pin tile separation at (%s,%s)', (x, y, accepted) => {
    const device = { minX: 15, minY: 15, maxX: 135, maxY: 135 };
    const pin = { minX: 15 + Number(x), minY: 15 + Number(y), maxX: 135 + Number(x), maxY: 135 + Number(y) };
    expect(pinClearance(pin, [device])).toBe(accepted);
  });

it.each(['horizontal', 'vertical'])('rejects diagonal sharing with an occupied %s neighbor', (axis) => {
  const device = { minX: 15, minY: 15, maxX: 135, maxY: 135 }, pin = { minX: 135, minY: 135, maxX: 255, maxY: 255 };
  const neighbor = axis === 'horizontal' ? { minX: 135, minY: 15, maxX: 255, maxY: 135 } : { minX: 15, minY: 135, maxX: 135, maxY: 255 };
  expect(pinClearance(pin, [device], [device, neighbor])).toBe(false);
});

it('uses a shared occurrence when local branching succeeds and repeats it beyond the neighborhood', () => {
  const model = parseCircuit('circuitDiagram D\nA([A]):::pinIn\nsubgraph stage gates\ndirection TB\nU1[U1]:::buffer\nU2[U2]:::buffer\nU3[U3]:::buffer\nU4[U4]:::buffer\nend\nA ---|I| U1\nA ---|I| U2\nA ---|I| U3\nA ---|I| U4');
  const initial = layoutCircuit(model), routes = routeCircuit(model, initial);
  connectivity(model, initial, routes);
  const occurrences = routes.layout.nets.filter((n) => n.id === 'A');
  expect(occurrences.length).toBeGreaterThan(1);
  expect(occurrences.length).toBeLessThan(4);
  expect(routes.branches.some((b) => b.net === 'A' && b.kind === 'shared')).toBe(true);
  for (const component of routes.nets[0].components) {
    const pin = occurrences.find((p) => component.attachments.some((a) => a.occurrence === p.occurrence))!;
    for (const attachment of component.attachments.filter((a) => a.device)) expect(pinNearby(pin.bounds, initial.devices.find((d) => d.id === attachment.device)!.bounds)).toBe(true);
  }
});

it('prunes an implicit route that requires more than five bends', () => {
  const lead = [{ a: [20, 50] as Point, b: [30, 50] as Point }], tree = [{ a: [220, 50] as Point, b: [230, 50] as Point }];
  const area = { minX: 0, minY: 0, maxX: 260, maxY: 140 };
  const barriers = [
    { bounds: { minX: 60, minY: 0, maxX: 70, maxY: 80 } },
    { bounds: { minX: 110, minY: 60, maxX: 120, maxY: 140 } },
    { bounds: { minX: 160, minY: 0, maxX: 170, maxY: 80 } },
  ];
  const route = routeOrdinaryBranch(lead, tree, barriers.slice(0, 1), [], area, [], () => true);
  expect(route).toBeDefined();
  expect(routeOrdinaryBranch(lead, tree, barriers, [], area, [], () => true)).toBeUndefined();
});

it.each(['horizontal', 'vertical'])('requires the intervening %s tile to be vacant', (axis) => {
  const device = { minX: 15, minY: 15, maxX: 135, maxY: 135 };
  const box = (offset: number) => axis === 'horizontal'
    ? { minX: 15 + offset, minY: 15, maxX: 135 + offset, maxY: 135 }
    : { minX: 15, minY: 15 + offset, maxX: 135, maxY: 135 + offset };
  expect(pinClearance(box(240), [device], [device, box(120)])).toBe(false);
  expect(pinClearance(box(360), [device], [device, box(120)])).toBe(true);
});
