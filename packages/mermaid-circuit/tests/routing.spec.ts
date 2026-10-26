/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { floorplan } from '../src/drawing/layout.js';
import { acceptsRoute, chooseRoute, crossingPoints, mayProxy, routeLayout, validateConnectivity, validPath, type Route } from '../src/drawing/routing.js';

const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });

describe('orthogonal routing', () => {
  it('enforces both new and existing wire crossing budgets', () => {
    const crossings: Route[] = [20, 40, 60].map((x, index) => ({ net: `cross${index}`, shape: '-', points: [[x, -20], [x, 20]] }));
    const straight: Route = { net: 'test', shape: '-', points: [[0, 0], [100, 0]] };
    const bent: Route = { net: 'test', shape: '-|', points: [[0, 0], [100, 0], [100, 40]] };
    expect(acceptsRoute(straight, crossings.slice(0, 2))).toBe(true);
    expect(acceptsRoute(straight, crossings)).toBe(false);
    expect(acceptsRoute(bent, crossings.slice(0, 1))).toBe(true);
    expect(acceptsRoute(bent, crossings.slice(0, 2))).toBe(false);
    expect(acceptsRoute(crossings[1], [bent, crossings[0]])).toBe(false);
    expect(acceptsRoute(straight, [{ ...straight, net: 'other' }])).toBe(false);
  });

  it('uses the fewest bends, rejects reverse turns and reports obstacles explicitly', () => {
    expect(chooseRoute('n', [0, 0], [100, 0], [], []).shape).toBe('-');
    expect(chooseRoute('n', [0, 0], [100, 100], [], []).shape).toBe('-|');
    expect(validPath([[0, 0], [-10, 0], [10, 0]])).toBe(false);
    expect(validPath([[0, 0], [10, 10]])).toBe(false);
    expect(() => chooseRoute('blocked', [0, 0], [100, 0], [], [{ minX: 40, maxX: 60, minY: -10, maxY: 10 }]))
      .toThrow('Routing failure for net "blocked"');
  });

  it.each(Object.entries(fixtures))('%s retains every assignment and only creates same-net junctions', (_name, source) => {
    const model = parseCircuit(source), snapshot = JSON.stringify(model), layout = floorplan(model), routing = routeLayout(layout);
    expect(JSON.stringify(model)).toBe(snapshot);
    expect(routing.attachments).toHaveLength(model.connections.length);
    for (const attachment of routing.attachments) {
      expect(routing.routes.some((route) => route.net === attachment.net && [route.points[0], route.points.at(-1)]
        .some((point) => point && Math.hypot(point[0] - attachment.point[0], point[1] - attachment.point[1]) < 1e-7))).toBe(true);
    }
    for (const route of routing.routes) {
      expect(validPath(route.points)).toBe(true);
      expect(crossingPoints(route, routing.routes)!.length).toBeLessThanOrEqual(route.shape === '-' ? 2 : 1);
    }
    for (const proxy of routing.occurrences) {
      expect(model.nets).toContainEqual(proxy.net);
      expect(proxy.net.type).not.toBe('net');
      if (proxy.isProxy) expect(mayProxy(proxy.net, layout.proxyPolicy)).toBe(true);
      if (proxy.net.type === 'pinIn') expect(proxy.branches).toBeLessThanOrEqual(3);
      expect(proxy.placed.transform.matrix.slice(0, 4).map((value) => value + 0)).toEqual(proxy.net.type === 'pinInOut'
        && proxy.placed.transform.matrix[0] === -1 ? [-1, 0, 0, 1] : [1, 0, 0, 1]);
    }
    for (const net of model.nets.filter((net) => net.type === 'pinOut' || net.type === 'pinIn' && !mayProxy(net, layout.proxyPolicy))) {
      expect(routing.occurrences.filter((item) => item.net.id === net.id)).toHaveLength(1);
    }
    if (_name.endsWith('wireless-solenoid.mmd')) expect(routing.occurrences).toEqual([]);
    for (const junction of routing.junctions) {
      expect(model.nets.some((net) => net.id === junction.net)).toBe(true);
      const touches = routing.routes.filter((route) => route.points.slice(1).some((b, index) => {
        const a = route.points[index], p = junction.point;
        const area = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        return Math.abs(area) < 1e-5 && p[0] >= Math.min(a[0], b[0]) - 1e-7 && p[0] <= Math.max(a[0], b[0]) + 1e-7
          && p[1] >= Math.min(a[1], b[1]) - 1e-7 && p[1] <= Math.max(a[1], b[1]) + 1e-7;
      }));
      expect(touches.length).toBeGreaterThanOrEqual(2);
      expect(new Set(touches.map((route) => route.net))).toEqual(new Set([junction.net]));
    }
    expect(routeLayout(floorplan(model))).toEqual(routing);
  });

  it('uses original graph counts and permits input proxies only at the four-to-one threshold', () => {
    const base = 'circuitDiagram D\nA([A]):::pinIn\nB([B]):::pinIn\nY([Y]):::pinOut\nV{{V}}:::supplyNet\nG{{G}}:::ground\n';
    const source = (count: number) => base + Array.from({ length: count }, (_, index) => `U${index}[U${index}]:::buffer`).join('\n');
    const below = floorplan(parseCircuit(source(7))), at = floorplan(parseCircuit(source(8)));
    expect(below.proxyPolicy).toEqual({ inputs: 2, devices: 7 });
    expect(at.proxyPolicy).toEqual({ inputs: 2, devices: 8 });
    expect(mayProxy(below.nets[0], below.proxyPolicy)).toBe(false);
    expect(mayProxy(at.nets[0], at.proxyPolicy)).toBe(true);
    expect(mayProxy(at.nets[2], at.proxyPolicy)).toBe(false);
    const bidirectional = floorplan(parseCircuit(source(7) + '\nIO([IO]):::pinInOut'));
    expect(bidirectional.proxyPolicy).toEqual({ inputs: 2, devices: 8 });
  });

  it('rejects a broken output conductor and an extra output occurrence', () => {
    const layout = floorplan(parseCircuit(fixtures['../examples/fixtures/cmos-nand2.mmd']));
    const drawing = routeLayout(layout);
    const drain = layout.devices.find((item) => item.device.id === 'N0')!.placed.anchors.D;
    const bridge = drawing.routes.find((route) => route.net === 'OUT' && route.shape === '-'
      && route.points.at(-1)![0] === drain[0] && route.points.at(-1)![1] === drain[1])!;
    expect(bridge).toBeDefined();
    const [a, b] = bridge.points, y = (a[1] + b[1]) / 2;
    const disconnected: Route[] = drawing.routes.filter((route) => route !== bridge).concat([
      { net: 'OUT', shape: '-', points: [a, [a[0], y - 15]] },
      { net: 'OUT', shape: '-', points: [[a[0], y + 15], b] },
    ]);
    expect(() => validateConnectivity(layout, { ...drawing, routes: disconnected })).toThrow('disconnected');
    const output = drawing.occurrences.find((item) => item.net.type === 'pinOut')!;
    expect(() => validateConnectivity(layout, { ...drawing, occurrences: [...drawing.occurrences, { ...output, isProxy: true }] }))
      .toThrow('Unauthorized proxy');
  });

  it('places input left, output right, supply above and ground below an inverter', () => {
    const layout = floorplan(parseCircuit(fixtures['../examples/fixtures/cmos-inverter.mmd']));
    const routing = routeLayout(layout);
    for (const proxy of routing.occurrences) {
      const targets = layout.attachments.filter((item) => item.net === proxy.net.id).map((item) => item.point);
      const at = proxy.placed.anchors.anchor;
      if (proxy.net.type === 'pinIn') expect(at[0]).toBeLessThan(Math.min(...targets.map((point) => point[0])));
      if (proxy.net.type === 'pinOut') expect(at[0]).toBeGreaterThan(Math.max(...targets.map((point) => point[0])));
      if (proxy.net.type === 'supplyNet') expect(at[1]).toBeLessThan(Math.min(...targets.map((point) => point[1])));
      if (proxy.net.type === 'ground') expect(at[1]).toBeGreaterThan(Math.max(...targets.map((point) => point[1])));
    }
  });

  it('uses another input occurrence after three branches', () => {
    const source = (count: number) => `circuitDiagram D\nA(["A"]):::pinIn\nsubgraph stage inputs\n direction TB\n`
      + Array.from({ length: count }, (_, i) => `G${i}["G${i}"]:::buffer`).join('\n') + '\nend\n'
      + Array.from({ length: count }, (_, i) => `A --- G${i} |I|`).join('\n');
    const three = routeLayout(floorplan(parseCircuit(source(3))));
    const four = routeLayout(floorplan(parseCircuit(source(4))));
    expect(three.occurrences.filter((proxy) => proxy.net.id === 'A')).toHaveLength(1);
    expect(four.occurrences.filter((proxy) => proxy.net.id === 'A')).toHaveLength(2);
  });

  it('centers parallel split and rejoin points on straight common conductors', () => {
    const layout = floorplan(parseCircuit(fixtures['../examples/fixtures/cmos-nand2.mmd']));
    const routing = routeLayout(layout);
    const pm = layout.devices.filter((item) => item.device.type === 'pmos');
    const x = (pm[0].placed.anchors.S[0] + pm[1].placed.anchors.S[0]) / 2;
    for (const net of ['VDD', 'OUT']) {
      const joint = routing.junctions.find((item) => item.net === net)!;
      expect(joint.point[0]).toBe(x);
      for (const device of pm) {
        const terminal = net === 'VDD' ? 'S' : 'D';
        const route = routing.routes.find((route) => route.net === net && route.points[0] === device.placed.anchors[terminal]);
        expect(route).toBeDefined();
        expect(route!.points.at(-2)![1]).toBe(joint.point[1]);
        expect(route!.points.at(-1)).toEqual(joint.point);
      }
    }
  });

  it('centers opposite branch arms and perpendicular feeds around the explicit DC source', () => {
    const layout = floorplan(parseCircuit(fixtures['../examples/fixtures/wireless-solenoid.mmd']));
    const routing = routeLayout(layout);
    const terminal = (device: string, name: string) => layout.attachments.find((item) => item.device === device && item.terminal === name)!;
    const outgoing = terminal('remote', 'no'), top = terminal('Solenoid', 'A'), bottom = terminal('Solenoid', 'B');
    const upperBranch = routing.routes.find((route) => route.net === top.net && route.points[0] === top.point)!;
    const feed = routing.routes.find((route) => route.net === outgoing.net && route.points[0] === outgoing.point)!;
    expect(feed.shape).toBe('-|');
    expect(feed.points.at(-1)![1]).toBe(top.point[1] - 60);
    expect(upperBranch.points.at(-1)![1]).toBe(feed.points.at(-1)![1]);
    expect(feed.points.at(-2)![0]).toBe(feed.points.at(-1)![0]);
    expect(feed.points.at(-2)![1]).toBeLessThan(feed.points.at(-1)![1]);
    const centeredPair = (a: ReturnType<typeof terminal>, b: ReturnType<typeof terminal>) => {
      const wires = [a, b].map((item) => routing.routes.find((route) => route.net === item.net && route.points[0] === item.point)!);
      const joint = wires[0].points.at(-1)!;
      expect(wires[1].points.at(-1)).toEqual(joint);
      const arms = wires.map((wire) => wire.points.at(-2)!);
      expect(joint).toEqual([(arms[0][0] + arms[1][0]) / 2, (arms[0][1] + arms[1][1]) / 2]);
      const vectors = arms.map((point) => [point[0] - joint[0], point[1] - joint[1]]);
      expect(vectors[0][0] * vectors[1][0] + vectors[0][1] * vectors[1][1])
        .toBeCloseTo(-Math.hypot(...vectors[0]) * Math.hypot(...vectors[1]));
      expect(Math.hypot(...vectors[0])).toBeGreaterThan(0);
      expect(routing.junctions).toContainEqual({ net: a.net, point: joint });
      return { joint, wires };
    };
    const split = centeredPair(top, terminal('Diode', 'K'));
    const join = centeredPair(bottom, terminal('Diode', 'A'));
    expect(split.joint[0]).toBe(join.joint[0]);
    const length = (wire: Route) => wire.points.slice(1).reduce((sum, point, i) => sum
      + Math.hypot(point[0] - wire.points[i][0], point[1] - wire.points[i][1]), 0);
    for (const pair of [split, join]) expect(length(pair.wires[0])).toBeCloseTo(length(pair.wires[1]));
    const returnStem = routing.routes.find((route) => route.net === bottom.net && route.points[0] === join.joint)!;
    expect(returnStem.points[1][0]).toBe(join.joint[0]);
    expect(returnStem.points[1][1]).toBeGreaterThan(join.joint[1]);
    const supply = terminal('Source', 'P');
    const sourceWire = routing.routes.find((route) => route.net === supply.net)!;
    expect(sourceWire.points[0]).toEqual(supply.point);
    expect(sourceWire.points[1][0]).toBe(supply.point[0]);
    expect(sourceWire.points[1][1]).toBeLessThan(supply.point[1]);
    expect(sourceWire.points.at(-1)![0]).toBeGreaterThan(supply.point[0]);
    const power = terminal('remote', 'v+'), control = terminal('remote', 'ctl');
    const powerSplit = centeredPair(power, control);
    const powerFeed = routing.routes.find((route) => route.net === power.net && !powerSplit.wires.includes(route))!;
    expect(powerFeed.points.at(-1)).toEqual(powerSplit.joint);
    expect(powerFeed.points.at(-2)![1]).toBe(powerSplit.joint[1]);
    expect(routing.occurrences).toEqual([]);
    expect(routing.crossings).toBe(0);
  });

  it('mirrors XOR input pins, splits and entry routes without additional occurrences', () => {
    const layout = floorplan(parseCircuit(fixtures['../examples/fixtures/xor-nand4.mmd']));
    const routing = routeLayout(layout);
    const axis = layout.devices.find((item) => item.device.id === 'N1')!.placed.anchors.center[1];
    const reflect = (point: readonly number[]) => [point[0], 2 * axis - point[1]];
    const upper = routing.routes.filter((route) => route.net === 'A');
    const lower = routing.routes.filter((route) => route.net === 'B');
    expect(lower.map((route) => route.points)).toEqual(upper.map((route) => route.points.map(reflect)));
    const pin = (net: string) => routing.occurrences.find((item) => item.net.id === net)!.placed.anchors.anchor;
    expect(pin('B')).toEqual(reflect(pin('A')));
    expect(routing.junctions.find((item) => item.net === 'B')!.point)
      .toEqual(reflect(routing.junctions.find((item) => item.net === 'A')!.point));
    expect(routing.occurrences.some((item) => item.isProxy)).toBe(false);
    expect(routing.crossings).toBe(0);
  });

  it('keeps interleaved input branches on separate conductors ahead of symmetry', () => {
    const source = 'circuitDiagram D\nA([A]):::pinIn\nB([B]):::pinIn\n'
      + Array.from({ length: 4 }, (_, index) => `G${index}[G${index}]:::buffer`).join('\n') + '\n'
      + Array.from({ length: 4 }, (_, index) => `${index % 2 ? 'B' : 'A'} --- G${index} |I|`).join('\n');
    const layout = floorplan(parseCircuit(source)), routing = routeLayout(layout);
    expect(routing.occurrences).toHaveLength(2);
    expect(routing.occurrences.some((item) => item.isProxy)).toBe(false);
    for (const route of routing.routes) expect(crossingPoints(route, routing.routes)).toBeDefined();
    expect(() => validateConnectivity(layout, routing)).not.toThrow();
  });
});
