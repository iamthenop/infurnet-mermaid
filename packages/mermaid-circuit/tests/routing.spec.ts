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
    for (const attachment of layout.attachments) {
      const vector = ({ T: [0, -1], B: [0, 1], L: [-1, 0], R: [1, 0] } as const)[attachment.side];
      const target = [attachment.point[0] + vector[0] * 60, attachment.point[1] + vector[1] * 60];
      const covered = routing.routes.filter((route) => route.net === attachment.net).some((route) => route.points.slice(1).some((end, i) => {
        const start = route.points[i];
        return Math.abs((end[0] - start[0]) * (target[1] - start[1]) - (end[1] - start[1]) * (target[0] - start[0])) < 1e-5
          && target[0] >= Math.min(start[0], end[0]) - 1e-5 && target[0] <= Math.max(start[0], end[0]) + 1e-5
          && target[1] >= Math.min(start[1], end[1]) - 1e-5 && target[1] <= Math.max(start[1], end[1]) + 1e-5;
      }));
      expect(covered, `${attachment.device}.${attachment.terminal} lead`).toBe(true);
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
      const directions = new Set<string>();
      expect(model.nets.some((net) => net.id === junction.net)).toBe(true);
      const touches = routing.routes.filter((route) => route.points.slice(1).some((b, index) => {
        const a = route.points[index], p = junction.point;
        const area = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        return Math.abs(area) < 1e-5 && p[0] >= Math.min(a[0], b[0]) - 1e-7 && p[0] <= Math.max(a[0], b[0]) + 1e-7
          && p[1] >= Math.min(a[1], b[1]) - 1e-7 && p[1] <= Math.max(a[1], b[1]) + 1e-7;
      }));
      expect(touches.length).toBeGreaterThanOrEqual(2);
      expect(new Set(touches.map((route) => route.net))).toEqual(new Set([junction.net]));
      for (const route of touches) for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i], p = junction.point;
        if (Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) > 1e-5
          || p[0] < Math.min(a[0], b[0]) - 1e-7 || p[0] > Math.max(a[0], b[0]) + 1e-7
          || p[1] < Math.min(a[1], b[1]) - 1e-7 || p[1] > Math.max(a[1], b[1]) + 1e-7) continue;
        for (const end of [a, b]) if (Math.hypot(end[0] - p[0], end[1] - p[1]) > 1e-7) {
          directions.add(Math.abs(end[0] - p[0]) > 1e-7 ? end[0] < p[0] ? 'L' : 'R' : end[1] < p[1] ? 'T' : 'B');
        }
      }
      for (const item of layout.attachments) if (item.net === junction.net
        && Math.hypot(item.point[0] - junction.point[0], item.point[1] - junction.point[1]) < 1e-7) {
        directions.add(({ T: 'B', B: 'T', L: 'R', R: 'L' } as const)[item.side]);
      }
      expect(directions.size).toBe(3);
    }
    expect(routeLayout(floorplan(model))).toEqual(routing);
  });

  it.each(['opamp-voltage-follower', 'opamp-noninverting-amplifier', 'capacitor-feedback'])
  ('routes %s locally with near-output branching, clear approaches and connected returns', (name) => {
    const source = name === 'capacitor-feedback'
      ? fixtures['../examples/fixtures/opamp-noninverting-amplifier.mmd'].replace(':::resistor', ':::capacitor')
      : fixtures[`../examples/fixtures/${name}.mmd`];
    const model = parseCircuit(source), layout = floorplan(model), routed = routeLayout(layout);
    const amplifier = layout.devices.find((item) => item.device.id === 'U1')!;
    const output = amplifier.placed.anchors.out, input = amplifier.placed.anchors.in1;
    const branch = [output[0] + 60, output[1]];
    expect(routed.junctions).toHaveLength(name === 'opamp-voltage-follower' ? 1 : 2);
    expect(routed.junctions).toContainEqual({ net: 'VOUT', point: branch });
    expect(routed.routes).toContainEqual({ net: 'VOUT', points: [output, branch], shape: '-' });
    const left = input[0] - (name === 'opamp-voltage-follower' ? 120 : 360);
    const inputNet = model.connections.find((item) => item.device === 'U1' && item.terminal === 'in1')!.net;
    expect(routed.routes).toContainEqual({ net: inputNet, points: [[left, input[1]], input], shape: '-' });
    if (name !== 'opamp-voltage-follower') {
      expect(routed.junctions).toContainEqual({ net: inputNet, point: [left, input[1]] });
      const rf = model.connections.filter((item) => item.device === 'RF');
      expect(new Set(rf.map((item) => item.net)).size).toBe(2);
    }
    expect(() => validateConnectivity(layout, routed)).not.toThrow();
    expect(routed.crossings).toBe(1);
    expect(routed.junctions.some((joint) => joint.point[0] === output[0] + 120 && joint.point[1] === output[1])).toBe(false);
    expect(routed.occurrences.find((item) => item.net.id === 'VOUT')!.placed.anchors.anchor[0]).toBeGreaterThan(branch[0]);
    for (const route of routed.routes) {
      expect(validPath(route.points)).toBe(true);
      expect(acceptsRoute(route, routed.routes, layout.devices.map((item) => item.placed.bounds))).toBe(true);
    }
    const withoutOutput = source.replace('U1 |out| --- VOUT', '');
    expect(routeLayout(floorplan(parseCircuit(withoutOutput))).junctions).toHaveLength(name === 'opamp-voltage-follower' ? 0 : 1);
    const broken = routed.routes.filter((route) => !(route.net === inputNet && route.points.at(-1) === input));
    expect(() => validateConnectivity(layout, { ...routed, routes: broken })).toThrow();
  });

  it('does not grant ordinary output feeds, positive-feedback paths or other input nets a return-route exception', () => {
    expect(validPath([[0, 0], [60, 0], [60, -180], [-120, -180], [-120, 0], [0, 0]])).toBe(false);
    const positive = fixtures['../examples/fixtures/opamp-noninverting-amplifier.mmd']
      .replace('RF |B| --- |in1| U1', 'RF |B| --- |in2| U1');
    expect(() => routeLayout(floorplan(parseCircuit(positive)))).toThrow('Routing failure');
    const layout = floorplan(parseCircuit(fixtures['../examples/fixtures/opamp-voltage-follower.mmd']));
    const routed = routeLayout(layout);
    const ordinary: Route = { net: 'VOUT', points: [[180, 60], [240, 60], [120, 60]], shape: '-|' };
    expect(acceptsRoute(ordinary, routed.routes)).toBe(false);
    expect(() => chooseRoute('ordinary', [120, 60], [0, 40], routed.routes, layout.devices.map((item) => item.placed.bounds)))
      .toThrow('Routing failure');
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

  it('enforces diagram and block proxy thresholds using original connected block counts', () => {
    const source = (count: number) => 'circuitDiagram D\nA([A]):::pinIn\nUnused([Unused]):::pinIn\nsubgraph block local\n'
      + Array.from({ length: count }, (_, i) => `subgraph stage part${i}\nG${i}[G${i}]:::buffer\nend`).join('\n')
      + '\nend\nsubgraph block other\n' + Array.from({ length: 8 - count }, (_, i) => `U${i}[U${i}]:::buffer`).join('\n')
      + '\nend\n' + Array.from({ length: count }, (_, i) => `A --- G${i} |I|`).join('\n');
    const below = floorplan(parseCircuit(source(3))), at = floorplan(parseCircuit(source(4)));
    expect(below.proxyPolicy).toEqual({ inputs: 2, devices: 8 });
    expect(below.blockProxyPolicies[0]).toMatchObject({ inputs: 1, devices: 3 });
    expect(at.blockProxyPolicies[0]).toMatchObject({ inputs: 1, devices: 4 });
    expect(mayProxy(below.nets[0], below.proxyPolicy)).toBe(true);
    const single = routeLayout(below), multiple = routeLayout(at);
    expect(single.occurrences.filter((item) => item.net.id === 'A')).toHaveLength(1);
    expect(multiple.occurrences.filter((item) => item.net.id === 'A')).toHaveLength(4);
    expect(() => validateConnectivity(below, { ...single, occurrences: [...single.occurrences,
      { ...single.occurrences[0], isProxy: true }] })).toThrow('Unauthorized input proxy in block');
    const diagramBelow = floorplan(parseCircuit(source(4) + '\nUnused2([Unused2]):::pinIn'));
    expect(mayProxy(diagramBelow.nets[0], diagramBelow.blockProxyPolicies[0])).toBe(true);
    expect(mayProxy(diagramBelow.nets[0], diagramBelow.proxyPolicy)).toBe(false);
    expect(() => routeLayout(diagramBelow)).toThrow('circuit threshold forbids');
    const xor = floorplan(parseCircuit(fixtures['../examples/fixtures/cmos-xor12.mmd']));
    expect(xor.blockProxyPolicies.map(({ inputs, devices }) => ({ inputs, devices })))
      .toEqual([{ inputs: 2, devices: 6 }, { inputs: 2, devices: 10 }]);
  });

  it.each(['cmos-inverter', 'cmos-nand2', 'cmos-xor12'])('aligns input flags and centers their branches in %s', (name) => {
    const layout = floorplan(parseCircuit(fixtures[`../examples/fixtures/${name}.mmd`])), routing = routeLayout(layout);
    const blocks = layout.blockProxyPolicies.length ? layout.blockProxyPolicies.map((block) => block.stages)
      : [layout.stageBounds.map((_, index) => index)];
    for (const stages of blocks) {
      const pins = routing.occurrences.filter((item) => item.net.type === 'pinIn' && item.stages.every((stage) => stages.includes(stage)));
      expect(new Set(pins.map((item) => item.placed.anchors.anchor[0])).size).toBe(1);
      for (const pin of pins) {
        const anchors = layout.attachments.filter((item) => item.net === pin.net.id && pin.stages.includes(item.stage));
        const ys = anchors.map((item) => item.point[1]);
        expect(pin.placed.anchors.anchor[1]).toBe((Math.min(...ys) + Math.max(...ys)) / 2);
      }
    }
    expect(() => validateConnectivity(layout, routing)).not.toThrow();
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
    expect(three.junctions).toHaveLength(2);
    expect(four.junctions).toHaveLength(2);
  });

  it('rejects a connected four-way crossing instead of rendering a junction dot', () => {
    const layout = floorplan(parseCircuit(fixtures['../examples/fixtures/cmos-inverter.mmd']));
    const drawing = routeLayout(layout);
    const wire = drawing.routes.find((route) => route.shape === '-' && route.points[0][1] === route.points[1][1])!;
    const x = (wire.points[0][0] + wire.points[1][0]) / 2, y = wire.points[0][1];
    const cross: Route = { net: wire.net, points: [[x, y - 30], [x, y + 30]], shape: '-' };
    expect(() => validateConnectivity(layout, { ...drawing, routes: [...drawing.routes, cross] })).toThrow('must be T-shaped');
  });

  it('routes a centered three-way gate fanout through two T-junctions', () => {
    const source = 'circuitDiagram D\n' + Array.from({ length: 4 }, (_, i) => `G${i}[G${i}]:::buffer`).join('\n')
      + '\n' + [1, 2, 3].map((i) => `G0 |O| --- G${i} |I|`).join('\n');
    const layout = floorplan(parseCircuit(source)), drawing = routeLayout(layout);
    expect(drawing.attachments).toHaveLength(4);
    expect(drawing.junctions).toHaveLength(2);
    expect(drawing.occurrences).toHaveLength(0);
    expect(() => validateConnectivity(layout, drawing)).not.toThrow();
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
    const outgoing = terminal('Remote', 'no'), top = terminal('Solenoid', 'A'), bottom = terminal('Solenoid', 'B');
    const upperBranch = routing.routes.find((route) => route.net === top.net && route.points[0] === top.point)!;
    const feed = routing.routes.find((route) => route.net === outgoing.net && route.points[0] === outgoing.point)!;
    expect(feed.shape).toBe('-|');
    expect(feed.points.at(-1)![1]).toBe(top.point[1] - 60);
    expect(upperBranch.points.at(-1)![1]).toBe(feed.points.at(-1)![1]);
    expect(feed.points.at(-2)![0]).toBe(feed.points.at(-1)![0]);
    expect(feed.points.at(-2)![1]).toBeLessThan(feed.points.at(-1)![1]);
    const centeredPair = (a: ReturnType<typeof terminal>, b: ReturnType<typeof terminal>) => {
      const wires = [a, b].map((item) => {
        const first = routing.routes.find((route) => route.net === item.net && route.points[0] === item.point)!;
        const next = routing.routes.find((route) => route.net === item.net && route.points[0] === first.points.at(-1));
        return next && !routing.junctions.some((joint) => joint.net === item.net && joint.point.every((value, i) => value === first.points.at(-1)![i]))
          ? { ...first, points: [...first.points, ...next.points.slice(1)] } : first;
      });
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
    const power = terminal('Remote', 'v+'), control = terminal('Remote', 'ctl');
    const powerSplit = centeredPair(power, control);
    expect(routing.junctionScopes).toContainEqual({ net: power.net, point: powerSplit.joint, stages: [power.stage] });
    for (const pair of [split, join]) {
      expect(routing.junctionScopes.find((scope) => scope.point === pair.joint || scope.point.every((value, index) => value === pair.joint[index]))!.stages)
        .toEqual([top.stage]);
    }
    const powerFeed = routing.routes.find((route) => route.net === power.net && route.points[0] === terminal('Fuse', 'B').point)!;
    expect(powerFeed.points.at(-1)).toEqual(powerSplit.joint);
    expect(powerFeed.points.at(-2)![0]).toBe(powerSplit.joint[0]);
    expect(powerFeed.points.at(-2)![1]).toBeLessThan(powerSplit.joint[1]);
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
    const geometry = (points: readonly (readonly number[])[]) => JSON.stringify([...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    expect(lower.map((route) => geometry(route.points)).sort())
      .toEqual(upper.map((route) => geometry(route.points.map(reflect))).sort());
    const pin = (net: string) => routing.occurrences.find((item) => item.net.id === net)!.placed.anchors.anchor;
    expect(pin('B')).toEqual(reflect(pin('A')));
    expect(routing.junctions.find((item) => item.net === 'B')!.point)
      .toEqual(reflect(routing.junctions.find((item) => item.net === 'A')!.point));
    expect(routing.occurrences.some((item) => item.isProxy)).toBe(false);
    expect(routing.crossings).toBe(0);
  });

  it.each(['pinIn', 'pinOut', 'pinInOut'])('mirrors equivalent %s branches even when their declarations run in the same order', (type) => {
    const terminal = type === 'pinOut' ? 'O' : 'I';
    const source = `circuitDiagram D\nA([A]):::${type}\nB([B]):::${type}\n`
      + Array.from({ length: 4 }, (_, i) => `G${i}[G${i}]:::buffer`).join('\n') + '\n'
      + [0, 1, 2, 3].map((i) => `${i < 2 ? 'A' : 'B'} --- G${i} |${terminal}|`).join('\n');
    const layout = floorplan(parseCircuit(source)), routing = routeLayout(layout);
    const center = (Math.min(...layout.attachments.map((item) => item.point[1])) + Math.max(...layout.attachments.map((item) => item.point[1]))) / 2;
    const pins = routing.occurrences.map((item) => item.placed.anchors.anchor);
    expect(pins).toHaveLength(2);
    expect(pins[1]).toEqual([pins[0][0], 2 * center - pins[0][1]]);
    expect(routing.junctions[1].point).toEqual([routing.junctions[0].point[0], 2 * center - routing.junctions[0].point[1]]);
    expect(routing.occurrences.some((item) => item.isProxy)).toBe(false);
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
