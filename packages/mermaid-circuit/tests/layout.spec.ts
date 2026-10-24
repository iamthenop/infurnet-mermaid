/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import notation from '../spec/notation.md?raw';
import nor from '../examples/fixtures/nor3.mmd?raw';
import xor from '../examples/fixtures/xor2.mmd?raw';
import xorNand from '../examples/fixtures/xor-nand4.mmd?raw';
import { layoutCircuit, type CircuitLayout, type PlacedDevice } from '../src/drawing/layout.js';
import { Transform, type Bounds, type Point } from '../src/drawing/geometry.js';
import { routeCircuit, routingQuality } from '../src/drawing/routing.js';
import { resolveSymbol } from '../src/drawing/symbols.js';
import { parseCircuit } from '../src/parser/circuitParser.js';

const nand = notation.split('## NAND2 reference')[1].split('```text\n')[1].split('```')[0];
const declaration = (id: string, type = 'resistor') => `${id}["${id}"]:::${type}`;
const stage = (body: string, direction = '') => `subgraph stage network\n${direction ? `direction ${direction}\n` : ''}${body}\nend`;
const circuit = (body: string) => parseCircuit(`circuitDiagram A\n${body}`);
const device = (layout: CircuitLayout, id: string): PlacedDevice => layout.devices.find((item) => item.id === id)!;
const chain = (count: number, direction = '') => circuit(stage(
  Array.from({ length: count }, (_, index) => declaration(`R${index + 1}`)).join('\n'), direction)
  + '\n' + Array.from({ length: count - 1 }, (_, index) => `R${index + 1} ---|B:A| R${index + 2}`).join('\n'));

function expectPoint(actual: Point, expected: Point): void {
  expect(actual[0]).toBeCloseTo(expected[0], 8);
  expect(actual[1]).toBeCloseTo(expected[1], 8);
}

function contains(outer: Bounds, inner: Bounds): void {
  expect(outer.minX).toBeLessThanOrEqual(inner.minX);
  expect(outer.minY).toBeLessThanOrEqual(inner.minY);
  expect(outer.maxX).toBeGreaterThanOrEqual(inner.maxX);
  expect(outer.maxY).toBeGreaterThanOrEqual(inner.maxY);
}

function geometry(layout: CircuitLayout, centered = false): void {
  const symbols = [...layout.devices, ...layout.nets];
  for (const [index, symbol] of symbols.entries()) {
    expect([symbol.width, symbol.height]).toEqual([120, 120]);
    expect([0, 90, 180, 270]).toContain(symbol.rotation);
    contains(layout.bounds, symbol.bounds);
    const source = resolveSymbol(symbol.symbol);
    const [a, b, c, d, e, f] = symbol.svgTransform.slice(7, -1).split(' ').map(Number);
    const artworkPoint = ([x, y]: Point): Point => [a * x + c * y + e, b * x + d * y + f];
    expect(Object.keys(symbol.terminals)).toEqual(Object.keys(source.terminals));
    for (const [name, point] of Object.entries(source.terminals)) {
      expectPoint(symbol.terminals[name], symbol.transform.apply(point));
      expectPoint(symbol.terminals[name], artworkPoint(point));
    }
    if (source.anchor) expectPoint(symbol.anchor!, artworkPoint(source.anchor));
    const attachments = [...Object.values(symbol.terminals), ...(symbol.anchor ? [symbol.anchor] : [])];
    const localAttachments = attachments.map(([x, y]): Point => [x - symbol.position[0], y - symbol.position[1]]);
    for (const point of [...localAttachments, ...(centered || symbol.symbol === 'pinOut' ? [] : attachments)]) {
      for (const coordinate of point) {
        const phase = ((coordinate % 120) + 120) % 120;
        expect(Math.min(...[0, 30, 40, 60, 80, 90, 120].map((snap) => Math.abs(phase - snap)))).toBeLessThan(1e-8);
      }
    }
    for (const other of symbols.slice(index + 1)) {
      const xOverlap = Math.min(symbol.bounds.maxX, other.bounds.maxX) - Math.max(symbol.bounds.minX, other.bounds.minX);
      const inset = (item: typeof symbol) => item.symbol === 'pinIn' ? item.height / 8 : 0;
      const yOverlap = Math.min(symbol.bounds.maxY - inset(symbol), other.bounds.maxY - inset(other)) - Math.max(symbol.bounds.minY + inset(symbol), other.bounds.minY + inset(other));
      expect(xOverlap <= 0 || yOverlap <= 0).toBe(true);
    }
  }
  for (const placedStage of layout.stages) {
    contains(layout.bounds, placedStage.bounds);
    layout.devices.filter((item) => item.stage === placedStage.stage && item.region === 'internal')
      .forEach((item) => contains(placedStage.bounds, item.bounds));
  }
  for (const block of layout.blocks) if (block.bounds) {
    contains(layout.bounds, block.bounds);
    block.stages.forEach((index) => contains(block.bounds!, layout.stages[index].bounds));
  }
}

describe('stage topology and orientation', () => {
  it.each([2, 3])('places %s series resistors vertically with aligned named terminals', (count) => {
    const model = chain(count), layout = layoutCircuit(model);
    expect(model.stages[0].direction).toBe('auto');
    expect(layout.stages[0].groups).toEqual([{ topology: 'series', direction: 'TB', devices: model.stages[0].devices }]);
    for (let index = 1; index < count; index++) {
      const above = device(layout, `R${index}`), below = device(layout, `R${index + 1}`);
      expect(above.bounds.maxY).toBeLessThan(below.bounds.minY);
      expect(above.terminals.B[0]).toBeCloseTo(below.terminals.A[0]);
      expect(above.terminals.B[1]).toBeGreaterThan(above.terminals.A[1]);
      expect(below.terminals.A[1]).toBeLessThan(below.terminals.B[1]);
    }
    expect(layout.devices.every((item) => item.rotation !== 0)).toBe(true);
    geometry(layout);
  });

  it('walks a chain in electrical order rather than declaration order', () => {
    const layout = layoutCircuit(circuit([declaration('R2'), declaration('R3'), declaration('R1'),
      'R1 ---|B:A| R2', 'R2 ---|B:A| R3'].join('\n')));
    expect(layout.stages[0].groups[0].devices).toEqual(['R3', 'R2', 'R1']);
    expect(device(layout, 'R3').position[1]).toBeLessThan(device(layout, 'R2').position[1]);
    expect(device(layout, 'R2').position[1]).toBeLessThan(device(layout, 'R1').position[1]);
    geometry(layout);
  });

  it.each(['LR', 'TB'])('explicit %s overrides automatic arrangement', (direction) => {
    const layout = layoutCircuit(chain(3, direction));
    const axis = direction === 'LR' ? 0 : 1;
    expect(layout.stages[0].direction).toBe(direction);
    expect(layout.stages[0].groups[0].direction).toBe(direction);
    expect(layout.devices[0].position[axis]).toBeLessThan(layout.devices[1].position[axis]);
    expect(layout.devices[1].position[axis]).toBeLessThan(layout.devices[2].position[axis]);
    geometry(layout);
  });

  it.each([
    ['N1', 'N2', 'N3', 'N4'], ['N4', 'N3', 'N2', 'N1'], ['N4', 'N2', 'N1', 'N3'],
  ])('places digital LR dependencies in columns with declaration order %j,%j,%j,%j', (...order) => {
    const source = xorNand.replace(/    N1[^\n]+\n    N2[^\n]+\n    N3[^\n]+\n    N4[^\n]+/u,
      order.map((id) => `    ${declaration(id, 'nand')}`).join('\n'));
    const model = parseCircuit(source), before = structuredClone(model), layout = layoutCircuit(model);
    const [first, upper, lower, last] = ['N1', ...order.filter((id) => id === 'N2' || id === 'N3'), 'N4']
      .map((id) => device(layout, id));
    expect(first.position[0]).toBeLessThan(upper.position[0]);
    expect(upper.position[0]).toBe(lower.position[0]);
    expect(lower.position[0]).toBeLessThan(last.position[0]);
    expect(upper.position[1]).toBeLessThan(lower.position[1]);
    expect(first.position[1]).toBe((upper.position[1] + lower.position[1]) / 2);
    expect(last.position[1]).toBe(first.position[1]);
    expect(layout.devices.every((placed) => placed.rotation === 0)).toBe(true);
    const frame = layout.stages[0].bounds;
    expect([frame.maxX - frame.minX, frame.maxY - frame.minY]).toEqual([540, 360]);
    expect(layoutCircuit({ ...model, connections: [...model.connections].reverse() }).devices).toEqual(layout.devices);
    expect(model).toEqual(before);
    geometry(layout, true);
  });

  it('levels digital inverter and buffer dependencies independently of declaration order', () => {
    const model = parseCircuit(`circuitDiagram D
${stage(`${declaration('U3', 'buffer')}\n${declaration('U2', 'inverter')}\n${declaration('U1', 'buffer')}`, 'LR')}
U1 ---|O:I| U2
U2 ---|O:I| U3`);
    const layout = layoutCircuit(model);
    expect(device(layout, 'U1').position[0]).toBeLessThan(device(layout, 'U2').position[0]);
    expect(device(layout, 'U2').position[0]).toBeLessThan(device(layout, 'U3').position[0]);
    expect(new Set(layout.devices.map((placed) => placed.position[1])).size).toBe(1);
    expect(layout.devices.every((placed) => !placed.reflected)).toBe(true);
    geometry(layout);
  });

  it('uses a barycenter sweep to untangle same-depth digital gates', () => {
    const model = parseCircuit(`circuitDiagram D
${stage(['U1', 'U2', 'V2', 'V1'].map((id) => declaration(id, 'buffer')).join('\n'), 'LR')}
U1 ---|O:I| V1
U2 ---|O:I| V2`);
    const layout = layoutCircuit(model);
    expect(device(layout, 'V1').position[0]).toBe(device(layout, 'V2').position[0]);
    expect(device(layout, 'U1').position[1]).toBeLessThan(device(layout, 'U2').position[1]);
    expect(device(layout, 'V1').position[1]).toBeLessThan(device(layout, 'V2').position[1]);
    expect(routeCircuit(model, layout).crossings).toHaveLength(0);
    expect(layoutCircuit(model)).toEqual(layout);
    geometry(layout);
  });

  it('reflects NAND inputs from terminal geometry and preserves the zero-crossing XOR', () => {
    const model = parseCircuit(xorNand), before = structuredClone(model), layout = layoutCircuit(model);
    expect(layout.devices.filter((placed) => placed.reflected).map((placed) => placed.id)).toEqual(['N3']);
    const mirrored = device(layout, 'N3');
    expect(mirrored.terminals.I1[1]).toBeGreaterThan(mirrored.terminals.I2[1]);
    expect(mirrored.terminals.O[0]).toBe(mirrored.bounds.maxX);
    const transform = new Transform({ translation: mirrored.position });
    const unmirrored = { ...mirrored, ...resolveSymbol('nand', transform), id: mirrored.id, transform, reflected: false };
    const baseline = { ...layout, devices: layout.devices.map((placed) => placed.id === 'N3' ? unmirrored : placed) };
    expect(routingQuality(routeCircuit(model, layout))[0]).toBe(0);
    expect(routingQuality(routeCircuit(model, baseline))[0]).toBeGreaterThan(0);
    expect(model).toEqual(before);
    expect(layoutCircuit(model)).toEqual(layout);
  });

  it('returns deterministic digital geometry even when routing is unsupported', () => {
    const model = parseCircuit(`circuitDiagram D
IO([IO]):::pinInOut
${stage(declaration('U', 'nand'), 'LR')}
IO ---|I1| U`), original = structuredClone(model);
    const layout = layoutCircuit(model);
    expect(layout.devices.map((device) => device.id)).toEqual(['U']);
    expect(layout.unplacedNetIds).toEqual(['IO']);
    expect(layoutCircuit(model)).toEqual(layout);
    expect(model).toEqual(original);
    geometry(layout, true);
    expect(() => routeCircuit(model, layout)).toThrow('Unsupported pinInOut placement: IO');
  });

  it('retains digital LR declaration fallback when dependencies contain feedback', () => {
    const model = parseCircuit(`circuitDiagram D
${stage(`${declaration('U2', 'inverter')}\n${declaration('U1', 'inverter')}`, 'LR')}
U1 ---|O:I| U2
U2 ---|O:I| U1`);
    const layout = layoutCircuit(model);
    expect(device(layout, 'U2').position[0]).toBeLessThan(device(layout, 'U1').position[0]);
    expect(layout.devices.every((placed) => placed.rotation === 0)).toBe(true);
    geometry(layout);
  });

  it.each(['', 'TB'])('places parallel resistors with direction %s and preserves their common nets', (direction) => {
    const model = circuit(`${stage(`${declaration('R1')}\n${declaration('R2')}`, direction)}
R1 ---|A:B| R2
R1 ---|B:A| R2`);
    const before = structuredClone(model.connections), layout = layoutCircuit(model);
    expect(layout.stages[0].groups[0].topology).toBe('parallel');
    expect(layout.stages[0].groups[0].direction).toBe(direction || 'LR');
    const axis = direction === 'TB' ? 1 : 0;
    expect(layout.devices[0].position[axis]).toBeLessThan(layout.devices[1].position[axis]);
    expect(model.connections).toEqual(before);
    if (!direction) {
      expect(layout.devices[0].terminals.A[1]).toBeCloseTo(layout.devices[1].terminals.B[1]);
      expect(layout.devices[0].terminals.B[1]).toBeCloseTo(layout.devices[1].terminals.A[1]);
    }
    geometry(layout);
  });

  it.each([
    ['A:B', true], ['B:A', false], ['A:A', true], ['B:B', true],
  ] as const)('LR series %s rotates only when attachment alignment improves', (terminals, rotates) => {
    const layout = layoutCircuit(circuit(`${stage(`${declaration('R1')}\n${declaration('R2')}`, 'LR')}\nR1 ---|${terminals}| R2`));
    const [leftName, rightName] = terminals.split(':');
    const [left, right] = layout.devices;
    expect(left.position[0]).toBeLessThan(right.position[0]);
    expect(left.terminals[leftName][0]).toBeCloseTo(left.bounds.maxX);
    expect(right.terminals[rightName][0]).toBeCloseTo(right.bounds.minX);
    expect(left.terminals[leftName][1]).toBeCloseTo(right.terminals[rightName][1]);
    expect(layout.devices.some((item) => item.rotation !== 0)).toBe(rotates);
    geometry(layout);
  });

  it.each(['G', 'D'])('does not classify a shared MOS %s net as series or parallel', (terminal) => {
    const layout = layoutCircuit(circuit(`${declaration('M1', 'nmos')}\n${declaration('M2', 'nmos')}\n${declaration('M3', 'nmos')}
M1 ---|${terminal}:${terminal}| M2
M2 ---|${terminal}:${terminal}| M3`));
    expect(layout.stages[0].groups[0].topology).toBe('unrecognized');
    expect(layout.stages[0].groups[0].devices).toEqual(['M1', 'M2', 'M3']);
    expect(layout.fallbackStages).toEqual([0]);
    expect(layout.devices.map((item) => item.rotation)).toEqual([0, 0, 0]);
    geometry(layout);
  });

  it('uses declaration order and default rotations for an unrecognized cycle', () => {
    const model = chain(3);
    const layout = layoutCircuit(circuit(`${model.devices.map((item) => declaration(item.id)).join('\n')}
R1 ---|B:A| R2
R2 ---|B:A| R3
R3 ---|B:A| R1`));
    expect(layout.fallbackStages).toEqual([0]);
    expect(layout.stages[0].groups[0].devices).toEqual(['R1', 'R2', 'R3']);
    expect(layout.devices.map((item) => item.rotation)).toEqual([0, 0, 0]);
    geometry(layout);
  });

  it.each(['auto', 'explicit'])('places NAND2 pull-up and pull-down networks in %s mode', (mode) => {
    const model = parseCircuit(mode === 'auto' ? nand.replace(/\s*direction (LR|TB)/g, '') : nand);
    const layout = layoutCircuit(model), p0 = device(layout, 'PMOS0'), p1 = device(layout, 'PMOS1');
    const n0 = device(layout, 'NMOS0'), n1 = device(layout, 'NMOS1');
    expect(layout.stages.map((item) => item.groups[0].topology)).toEqual(['parallel', 'series']);
    expect(p0.bounds.maxX).toBeLessThan(p1.bounds.minX);
    expect(p1.position[1] - p0.position[1]).toBe(90);
    expect(Math.max(p0.bounds.maxY, p1.bounds.maxY)).toBeLessThan(n0.bounds.minY);
    expect(n0.bounds.maxY).toBeLessThan(n1.bounds.minY);
    expect(n0.terminals.S[0]).toBeCloseTo(n1.terminals.D[0]);
    const [pullUp, pullDown] = layout.stages.map((item) => item.bounds);
    expect((pullUp.minX + pullUp.maxX) / 2).toBe((pullDown.minX + pullDown.maxX) / 2);
    expect(pullUp.maxX - pullUp.minX).toBeGreaterThan(pullDown.maxX - pullDown.minX);
    const output = layout.nets.find((item) => item.id === 'OUT')!;
    expect(output.anchor![1]).toBe((p1.terminals.D[1] + n0.terminals.D[1]) / 2);
    expect(output.anchor![1]).toBe(510);
    expect(output.anchor![1]).not.toBe(p0.terminals.D[1]);
    expect(layout.inputTargets).toEqual([
      { net: 'A', device: 'PMOS0', terminal: 'G', aligned: true },
      { net: 'B', device: 'PMOS1', terminal: 'G', aligned: true },
    ]);
    for (const item of layout.devices) {
      expect(item.rotation).toBe(0);
      expect(item.terminals.G[0]).toBe(item.bounds.minX);
      const pmos = item.id.startsWith('P');
      expect(item.terminals[pmos ? 'S' : 'D'][1]).toBe(item.bounds.minY);
      expect(item.terminals[pmos ? 'D' : 'S'][1]).toBe(item.bounds.maxY);
    }
    geometry(layout);
  });

  it.each([['NAND2', nand], ['NOR3', nor], ['XOR2', xor]])('centers power and staggers parallel devices consistently in %s', (_name, source) => {
    const layout = layoutCircuit(parseCircuit(source));
    expect(layout.devices.every((placed) => !placed.reflected)).toBe(true);
    for (const section of layout.sections ?? [{ block: undefined, stages: layout.stages.map((stage) => stage.stage) }]) {
      const xs = layout.devices.filter((device) => section.stages.includes(device.stage)).flatMap((device) => [device.terminals.D[0], device.terminals.S[0]]);
      const center = (Math.min(...xs) + Math.max(...xs)) / 2;
      const rails = layout.nets.filter((net) => net.block === section.block && (net.symbol === 'supplyNet' || net.symbol === 'ground'));
      expect(rails).toHaveLength(2);
      for (const net of rails) expect(net.anchor![0]).toBe(center);
    }
    for (const group of layout.stages.flatMap((stage) => stage.groups).filter((group) => group.topology === 'parallel')) {
      const devices = group.devices.map((id) => device(layout, id));
      for (let i = 1; i < devices.length; i++) expect(devices[i].position[1] - devices[i - 1].position[1]).toBe(90);
    }
    geometry(layout);
  });

  it.each([['pmos', 'nmos'], ['pmosBlk', 'nmosBlk']] as const)('preserves %s/%s defaults and puts PMOS above NMOS', (p, n) => {
    const layout = layoutCircuit(circuit(`${declaration('N', n)}\n${declaration('P', p)}`));
    const pmos = device(layout, 'P'), nmos = device(layout, 'N');
    expect(pmos.bounds.maxY).toBeLessThan(nmos.bounds.minY);
    for (const item of [pmos, nmos]) {
      expect(item.rotation).toBe(0);
      expect(item.terminals.G[0]).toBe(item.bounds.minX);
      expect(item.terminals.G[1]).toBe(item.position[1] + item.height / 2);
      if (p === 'pmosBlk') expect(item.terminals.B[0]).toBe(item.bounds.maxX);
    }
    expect(pmos.terminals.S[1]).toBe(pmos.bounds.minY);
    expect(pmos.terminals.D[1]).toBe(pmos.bounds.maxY);
    expect(nmos.terminals.D[1]).toBe(nmos.bounds.minY);
    expect(nmos.terminals.S[1]).toBe(nmos.bounds.maxY);
    geometry(layout);
  });

  it('rotates CMOS in explicit LR without changing source or drain assignments', () => {
    const model = circuit(`${stage(`${declaration('M1', 'nmosBlk')}\n${declaration('M2', 'nmosBlk')}`, 'LR')}
M1 ---|S:D| M2`);
    const original = structuredClone(model), layout = layoutCircuit(model), [left, right] = layout.devices;
    expect(left.rotation).not.toBe(0);
    expect(right.rotation).not.toBe(0);
    expect(left.terminals.S[0]).toBeCloseTo(left.bounds.maxX);
    expect(right.terminals.D[0]).toBeCloseTo(right.bounds.minX);
    expect(left.terminals.S[1]).toBeCloseTo(right.terminals.D[1]);
    expect(model).toEqual(original);
    geometry(layout);
  });

  it.each(['D:D', 'S:S'])('keeps PMOS above NMOS for a mixed series connection %s', (terminals) => {
    const layout = layoutCircuit(circuit(`${declaration('N', 'nmos')}\n${declaration('P', 'pmos')}\nN ---|${terminals}| P`));
    expect(device(layout, 'P').bounds.maxY).toBeLessThan(device(layout, 'N').bounds.minY);
    expect(layout.devices.map((item) => item.rotation)).toEqual([0, 0]);
    expect(layout.stages[0].groups[0].topology).toBe('series');
    geometry(layout);
  });

  it('reports a fallback when a mixed chain cannot keep all PMOS above NMOS', () => {
    const layout = layoutCircuit(circuit(`${declaration('P1', 'pmos')}\n${declaration('N', 'nmos')}\n${declaration('P2', 'pmos')}
P1 ---|D:D| N
N ---|S:S| P2`));
    expect(layout.fallbackStages).toEqual([0]);
    expect(device(layout, 'P1').bounds.maxY).toBeLessThan(device(layout, 'N').bounds.minY);
    expect(device(layout, 'P2').bounds.maxY).toBeLessThan(device(layout, 'N').bounds.minY);
    geometry(layout);
  });
});

describe('peripheral placement, structure and reproducibility', () => {
  const inverter = `A([A]):::pinIn
Y([Y]):::pinOut
VDD{{VDD}}:::supplyNet
GND{{GND}}:::ground
${stage(`${declaration('MP', 'pmos')}\n${declaration('MN', 'nmos')}`, 'TB')}
A ---|G| MP
A ---|G| MN
VDD ---|S| MP
Y ---|D| MP
Y ---|D| MN
GND ---|S| MN`;

  it.each([0, 1, 4])('centers inverter output independently of %s added supplies and grounds', (extra) => {
    const additions = Array.from({ length: extra }, (_, i) => `VDD${i}{{VDD${i}}}:::supplyNet\nGND${i}{{GND${i}}}:::ground`).join('\n');
    const baseline = layoutCircuit(circuit(inverter)), layout = layoutCircuit(circuit(`${inverter}\n${additions}`));
    const { minY, maxY } = layout.stages[0].bounds;
    expect(layout.nets.find((item) => item.id === 'Y')!.anchor![1]).toBe((minY + maxY) / 2);
    expect(layout.nets.find((item) => item.id === 'Y')!.anchor![1]).not.toBe(device(layout, 'MP').terminals.D[1]);
    expect(layout.stages).toEqual(baseline.stages);
    expect(layout.devices).toEqual(baseline.devices);
    geometry(layout);
  });

  it('excludes empty and voltage-only stages from the output midpoint', () => {
    const layout = layoutCircuit(circuit(`subgraph stage emptyBefore\nend
${inverter}
subgraph stage power
${declaration('V1', 'voltageSource')}
${declaration('V2', 'voltageSource')}
end
subgraph stage emptyAfter\nend`));
    const internal = layout.stages[1].bounds;
    expect(layout.nets.find((item) => item.id === 'Y')!.anchor![1]).toBe((internal.minY + internal.maxY) / 2);
    expect(layout.devices.filter((item) => item.region === 'top').map((item) => item.id)).toEqual(['V1', 'V2']);
    geometry(layout);
  });

  it.each([2, 3, 6])('centers %s output anchors in declaration order without moving devices', (count) => {
    const ids = ['Z2', 'A1', 'Y0', 'B3', 'X4', 'C5'].slice(0, count);
    const baseline = layoutCircuit(circuit(declaration('R')));
    const layout = layoutCircuit(circuit(`${declaration('R')}\n${ids.map((id) => `${id}([${id}]):::pinOut`).join('\n')}`));
    const { minY, maxY } = layout.stages[0].bounds, centerY = (minY + maxY) / 2;
    expect(layout.devices).toEqual(baseline.devices);
    expect(layout.nets.map((item) => item.id)).toEqual(ids);
    expect(layout.nets.reduce((sum, item) => sum + item.anchor![1], 0) / count).toBe(centerY);
    expect((layout.nets[0].anchor![1] + layout.nets.at(-1)!.anchor![1]) / 2).toBe(centerY);
    for (const [index, item] of layout.nets.entries()) {
      expect(item.anchor![0]).toBe(layout.nets[0].anchor![0]);
      expect(item.bounds.minX).toBeGreaterThan(layout.stages[0].bounds.maxX);
      if (index) expect(layout.nets[index - 1].bounds.maxY).toBeLessThanOrEqual(item.bounds.minY);
    }
    if (count === 6) expect(layout.bounds.minY).toBeLessThan(layout.stages[0].bounds.minY);
    geometry(layout);
  });

  it.each([false, true])('centers unequal-width stages without changing their arrangements (block: %s)', (inBlock) => {
    const wide = stage(`${declaration('R1')}\n${declaration('R2')}`, 'LR').replace('network', 'wide');
    const narrow = stage(declaration('R3')).replace('network', 'narrow');
    const body = `${wide}\n${narrow}\nsubgraph stage empty\nend`;
    const layout = layoutCircuit(circuit(inBlock ? `subgraph block group\n${body}\nend` : body));
    const centerX = (layout.stages[0].bounds.minX + layout.stages[0].bounds.maxX) / 2;
    for (const item of layout.stages) expect((item.bounds.minX + item.bounds.maxX) / 2).toBe(centerX);
    for (const [index, source] of [wide, narrow].entries()) {
      const alone = layoutCircuit(circuit(source)), before = alone.stages[0].bounds, after = layout.stages[index].bounds;
      expect(after.maxX - after.minX).toBe(before.maxX - before.minX);
      expect(after.maxY - after.minY).toBe(before.maxY - before.minY);
      const dx = after.minX - before.minX, dy = after.minY - before.minY;
      for (const original of alone.devices) {
        const moved = device(layout, original.id);
        expectPoint(moved.position, [original.position[0] + dx, original.position[1] + dy]);
        expect(moved.rotation).toBe(original.rotation);
        for (const [name, point] of Object.entries(original.terminals)) {
          expectPoint(moved.terminals[name], [point[0] + dx, point[1] + dy]);
        }
      }
      if (index) expect(layout.stages[index - 1].bounds.maxY).toBeLessThan(after.minY);
    }
    expect(layout.stages[0].bounds.maxX - layout.stages[0].bounds.minX)
      .toBeGreaterThan(layout.stages[1].bounds.maxX - layout.stages[1].bounds.minX);
    expect(layout.blocks.map((item) => item.stages)).toEqual(inBlock ? [[0, 1, 2]] : []);
    geometry(layout);
  });

  it.each(['TB', 'LR'])('preserves exact half-grid centering for a mixed %s stage', (direction) => {
    const source = `Y([Y]):::pinOut
${stage(`${declaration('M', 'nmos')}\n${declaration('R')}`, direction).replace('network', 'mixed')}
${stage(declaration('R2')).replace('network', 'single')}
M ---|S:A| R
R ---|B| Y`;
    const model = circuit(source), original = structuredClone(model), layout = layoutCircuit(model);
    const [mixed, single] = layout.stages.map((item) => item.bounds);
    expect((mixed.minX + mixed.maxX) / 2).toBe((single.minX + single.maxX) / 2);
    const output = layout.nets.find((item) => item.id === 'Y')!;
    expect(output.anchor![1]).toBe((mixed.minY + single.maxY) / 2);
    if (direction === 'TB') {
      const alone = layoutCircuit(circuit(stage(declaration('R2'))));
      const shift = ((mixed.maxX - mixed.minX) - (single.maxX - single.minX)) / 2;
      expect(shift).toBe(15);
      expect(device(layout, 'R2').terminals.A[0]).toBe(device(alone, 'R2').terminals.A[0] + shift);
      expect(device(layout, 'R2').terminals.A[0]).toBe(255);
    } else expect(output.anchor![1]).toBe(255);
    expect(layoutCircuit(model)).toEqual(layout);
    expect(model).toEqual(original);
    geometry(layout, true);
  });

  it.each([false, true])('retains safe output fallback without internal devices (voltage source: %s)', (voltage) => {
    const body = `Y([Y]):::pinOut\nZ([Z]):::pinOut${voltage ? `\n${declaration('V', 'voltageSource')}\nV ---|P| Y` : ''}`;
    const baseline = layoutCircuit(circuit(body));
    const layout = layoutCircuit(circuit(`${body}\nsubgraph stage empty\nend`));
    expect(layout.devices.every((item) => item.region === 'top')).toBe(true);
    expect(layout.nets.map((item) => item.anchor![1])).toEqual(baseline.nets.map((item) => item.anchor![1]));
    expect(layout.nets.every((item) => item.position[1] >= 0)).toBe(true);
    geometry(layout);
  });

  it('places peripheral categories in declaration order and keeps generic and bidirectional nets unplaced', () => {
    const layout = layoutCircuit(circuit(`${declaration('V2', 'voltageSource')}
${declaration('R')}
${declaration('V1', 'voltageSource')}
S2{{S2}}:::supplyNet
S1{{S1}}:::supplyNet
G2{{G2}}:::ground
G1{{G1}}:::ground
I2([I2]):::pinIn
I1([I1]):::pinIn
O2([O2]):::pinOut
O1([O1]):::pinOut
IO([IO]):::pinInOut
N((N)):::net`));
    const resistor = device(layout, 'R'), v2 = device(layout, 'V2'), v1 = device(layout, 'V1');
    expect(v2.position[0]).toBeLessThan(v1.position[0]);
    expect(v2.bounds.maxY).toBeLessThan(resistor.bounds.minY);
    for (const [ids, region, axis] of [
      [['S2', 'S1'], 'top', 0], [['G2', 'G1'], 'bottom', 0],
      [['I2', 'I1'], 'left', 1], [['O2', 'O1'], 'right', 1],
    ] as const) {
      const [first, second] = ids.map((id) => layout.nets.find((item) => item.id === id)!);
      expect(first.region).toBe(region);
      expect(second.region).toBe(region);
      expect(first.position[axis]).toBeLessThan(second.position[axis]);
      for (const item of [first, second]) {
        if (region === 'top') expect(item.bounds.maxY).toBeLessThan(resistor.bounds.minY);
        if (region === 'bottom') expect(item.bounds.minY).toBeGreaterThan(resistor.bounds.maxY);
        if (region === 'left') expect(item.bounds.maxX).toBeLessThan(resistor.bounds.minX);
        if (region === 'right') expect(item.bounds.minX).toBeGreaterThan(resistor.bounds.maxX);
      }
    }
    expect(layout.unplacedNetIds).toEqual(['IO']);
    expect(layout.nets.map((item) => item.id)).not.toContain('N');
    geometry(layout);
  });

  it.each(['unrecognized', 'series'])('aligns a shared input and descends across an LR %s group', (topology) => {
    const model = circuit(`A([A]):::pinIn
${stage(`${declaration('M1', 'nmos')}\n${declaration('M2', 'nmos')}`, 'LR')}
${topology === 'series' ? 'M1 ---|S:D| M2' : ''}
A ---|G| M2
A ---|G| M1`);
    const original = structuredClone(model), layout = layoutCircuit(model);
    const [first, second] = layout.devices;
    expect(layout.stages[0].groups[0].topology).toBe(topology);
    expect(first.position[0]).toBeLessThan(second.position[0]);
    expect(first.position[1]).toBeLessThan(second.position[1]);
    expectPoint(layout.nets[0].anchor!, [layout.nets[0].anchor![0], first.terminals.G[1]]);
    expect(layout.inputTargets).toEqual([{ net: 'A', device: 'M1', terminal: 'G', aligned: true }]);
    expect(model.connections.filter((item) => item.terminal === 'G').map((item) => item.net)).toEqual(['A', 'A']);
    if (topology === 'series') {
      const netAt = (id: string, terminal: string) => model.connections.find((item) => item.device === id && item.terminal === terminal)!.net;
      expect(netAt('M1', 'S')).toBe(netAt('M2', 'D'));
      expect(first.rotation).not.toBe(0);
      expect(second.rotation).not.toBe(0);
      expect(first.terminals.S[1]).toBeLessThan(second.terminals.D[1]);
    }
    expect(layoutCircuit(model)).toEqual(layout);
    expect(model).toEqual(original);
    geometry(layout);
  });

  it.each(['LR', 'stages'])('retains reversed input order with %s device arrangement', (arrangement) => {
    const members = arrangement === 'LR' ? stage(`${declaration('M1', 'nmos')}\n${declaration('M2', 'nmos')}`, 'LR')
      : `${stage(declaration('M1', 'nmos')).replace('network', 'first')}\n${stage(declaration('M2', 'nmos')).replace('network', 'second')}`;
    const layout = layoutCircuit(circuit(`B([B]):::pinIn
A([A]):::pinIn
${members}
A ---|G| M1
B ---|G| M2`));
    expect(layout.nets.map((item) => item.id)).toEqual(['B', 'A']);
    expect(layout.nets[1].anchor![1] - layout.nets[0].anchor![1]).toBeGreaterThanOrEqual(90);
    expect(layout.inputTargets.find((item) => item.net === 'B')!.aligned).toBe(true);
    expect(layout.inputTargets.find((item) => item.net === 'A')!.aligned).toBe(arrangement === 'LR');
    if (arrangement === 'LR') expect(device(layout, 'M1').position[0]).toBeLessThan(device(layout, 'M2').position[0]);
    geometry(layout);
  });

  it('centers XOR sections and places parallel NMOS chains side by side', () => {
    const model = parseCircuit(xor), layout = layoutCircuit(model);
    const stacked = layoutCircuit({ ...model, blocks: [], stages: model.stages.map((stage) => ({ ...stage, block: null })) });
    const [inverters, core] = layout.blocks;
    expect(model.blocks.map((block) => block.name)).toEqual(['inputInverters', 'xorCore']);
    expect(inverters.stages).toEqual([0, 1]);
    expect(core.stages).toEqual([2, 3, 4, 5]);
    expect(inverters.bounds!.maxX).toBeLessThan(core.bounds!.minX);
    expect(inverters.bounds!.minY + inverters.bounds!.maxY).toBe(core.bounds!.minY + core.bounds!.maxY);
    expect(layout.inputTargets).toEqual([
      { net: 'A', device: 'PA', terminal: 'G', aligned: true },
      { net: 'B', device: 'PB', terminal: 'G', aligned: true },
    ]);
    expect(layout.bounds.maxY - layout.bounds.minY).toBeLessThan(stacked.bounds.maxY - stacked.bounds.minY);
    expect(device(layout, 'N0').position[0]).toBeLessThan(device(layout, 'N2').position[0]);
    for (const [upper, lower] of [['N0', 'N1'], ['N2', 'N3']]) {
      expect(device(layout, upper).position[0]).toBe(device(layout, lower).position[0]);
      expect(device(layout, upper).bounds.maxY).toBeLessThan(device(layout, lower).bounds.minY);
    }
    expect(device(layout, 'N0').position[1]).toBe(device(layout, 'N2').position[1]);
    expect(device(layout, 'N1').position[1]).toBe(device(layout, 'N3').position[1]);
    for (const id of ['A', 'B']) {
      expect(layout.nets.filter((net) => net.id === id).map((net) => [net.symbol, net.block, net.role]))
        .toEqual([['pinIn', 0, 'external'], ['pinIn', 1, 'external'], ['pinIn', 1, 'local']]);
    }
    for (const id of ['Abar', 'Bbar']) {
      expect(layout.nets.filter((net) => net.id === id).map((net) => [net.symbol, net.block, net.role]))
        .toEqual([['pinOut', 0, 'boundary'], ['pinIn', 1, 'boundary'], ['pinIn', 1, 'local']]);
      expect(model.nets.filter((net) => net.id === id)).toHaveLength(1);
    }
    for (const stage of layout.stages) {
      const dx = stage.bounds.minX - stacked.stages[stage.stage].bounds.minX;
      const dy = stage.bounds.minY - stacked.stages[stage.stage].bounds.minY;
      for (const id of model.stages[stage.stage].devices) {
        const before = device(stacked, id), after = device(layout, id);
        expect(after.rotation).toBe(before.rotation);
        expectPoint(after.position, [before.position[0] + dx, before.position[1] + dy]);
      }
    }
    geometry(layout);
  });

  it.each([true, false])('recognizes parallel series stages only with both outer nets shared: %s', (shared) => {
    const model = circuit(`OUT([OUT]):::pinOut
VSS{{VSS}}:::ground
OTHER{{OTHER}}:::ground
subgraph block core
${stage(`${declaration('M0', 'nmos')}\n${declaration('M1', 'nmos')}`, 'TB').replace('network', 'high')}
${stage(`${declaration('M2', 'nmos')}\n${declaration('M3', 'nmos')}`, 'TB').replace('network', 'low')}
end
OUT ---|D| M0
OUT ---|D| M2
M0 ---|S:D| M1
M2 ---|S:D| M3
VSS ---|S| M1
${shared ? 'VSS' : 'OTHER'} ---|S| M3`);
    const original = structuredClone(model), layout = layoutCircuit(model);
    if (shared) {
      expect(device(layout, 'M0').position[1]).toBe(device(layout, 'M2').position[1]);
      expect(device(layout, 'M0').position[0]).toBeLessThan(device(layout, 'M2').position[0]);
    } else expect(device(layout, 'M1').bounds.maxY).toBeLessThan(device(layout, 'M2').bounds.minY);
    expect(layout.stages.map((stage) => stage.block)).toEqual([0, 0]);
    expect(model).toEqual(original);
    geometry(layout);
  });

  it('preserves stage order, block membership and the implicit final stage', () => {
    const model = circuit(`${declaration('Loose')}
subgraph block first
subgraph stage empty
end
subgraph stage one
${declaration('R1')}
end
end
subgraph block second
subgraph stage two
${declaration('R2')}
end
end`);
    const layout = layoutCircuit(model);
    expect(model.stages.at(-1)!.implicit).toBe(true);
    expect(layout.stages.map((item) => item.block)).toEqual([0, 0, 1, null]);
    expect(layout.blocks.map((item) => item.stages)).toEqual([[0, 1], [2]]);
    expect(layout.devices.map((item) => [item.id, item.stage])).toEqual([['Loose', 3], ['R1', 1], ['R2', 2]]);
    const [first, second] = layout.blocks;
    expect(first.bounds!.maxX).toBeLessThan(second.bounds!.minX);
    expect(first.bounds!.minY + first.bounds!.maxY).toBe(second.bounds!.minY + second.bounds!.maxY);
    expect(layout.stages[0].bounds.maxY).toBeLessThan(layout.stages[1].bounds.minY);
    expect(layout.stages[3].bounds.minY).toBeGreaterThan(Math.max(first.bounds!.maxY, second.bounds!.maxY));
    geometry(layout);
  });

  it.each(['circuitDiagram A', 'circuitDiagram A\nsubgraph block empty\nend'])('handles empty geometry: %s', (source) => {
    const layout = layoutCircuit(parseCircuit(source));
    expect(layout.devices).toEqual([]);
    expect(layout.nets).toEqual([]);
    expect(Object.values(layout.bounds).every(Number.isFinite)).toBe(true);
    if (layout.blocks.length) expect(layout.blocks[0].bounds).toBeNull();
  });

  it('does not mutate even a frozen model and repeats coordinates, anchors and rotations', () => {
    const model = parseCircuit(nand), original = structuredClone(model);
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    };
    freeze(model);
    const first = layoutCircuit(model), second = layoutCircuit(model);
    expect(second).toEqual(first);
    expect(model).toEqual(original);
    geometry(first);
  });

  it.each(['named', 'implicit'])('ignores equivalent %s connection-statement order', (kind) => {
    const source = kind === 'named' ? nand.replace(/\s*direction (LR|TB)/g, '') : `circuitDiagram A
${declaration('R1')}
${declaration('R2')}
${declaration('R3')}
R1 ---|B:A| R2
R2 ---|B:A| R3`;
    const lines = source.trim().split('\n'), connections = lines.filter((line) => line.includes('---'));
    const reordered = lines.filter((line) => !line.includes('---')).concat(connections.reverse()).join('\n');
    const first = layoutCircuit(parseCircuit(source)), second = layoutCircuit(parseCircuit(reordered));
    expect(second).toEqual(first);
    geometry(second);
  });
});
