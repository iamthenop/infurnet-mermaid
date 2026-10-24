/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import notation from '../spec/notation.md?raw';
import { layoutCircuit, type CircuitLayout, type PlacedDevice } from '../src/drawing/layout.js';
import type { Bounds, Point } from '../src/drawing/geometry.js';
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

function geometry(layout: CircuitLayout): void {
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
    for (const point of [...Object.values(symbol.terminals), ...(symbol.anchor ? [symbol.anchor] : [])]) {
      for (const coordinate of point) {
        const phase = ((coordinate % 120) + 120) % 120;
        expect(Math.min(...[0, 30, 40, 60, 80, 90, 120].map((snap) => Math.abs(phase - snap)))).toBeLessThan(1e-8);
      }
    }
    for (const other of symbols.slice(index + 1)) {
      const xOverlap = Math.min(symbol.bounds.maxX, other.bounds.maxX) - Math.max(symbol.bounds.minX, other.bounds.minX);
      const yOverlap = Math.min(symbol.bounds.maxY, other.bounds.maxY) - Math.max(symbol.bounds.minY, other.bounds.minY);
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
    expect(p0.position[1]).toBeLessThan(p1.position[1]);
    expect(Math.max(p0.bounds.maxY, p1.bounds.maxY)).toBeLessThan(n0.bounds.minY);
    expect(n0.bounds.maxY).toBeLessThan(n1.bounds.minY);
    expect(n0.terminals.S[0]).toBeCloseTo(n1.terminals.D[0]);
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

  it('aligns a shared input with the top-left recipient and descends across LR', () => {
    const layout = layoutCircuit(circuit(`A([A]):::pinIn
${stage(`${declaration('M1', 'nmos')}\n${declaration('M2', 'nmos')}`, 'LR')}
A ---|G| M2
A ---|G| M1`));
    const [first, second] = layout.devices;
    expect(first.position[0]).toBeLessThan(second.position[0]);
    expect(first.position[1]).toBeLessThan(second.position[1]);
    expectPoint(layout.nets[0].anchor!, [layout.nets[0].anchor![0], first.terminals.G[1]]);
    expect(layout.inputTargets).toEqual([{ net: 'A', device: 'M1', terminal: 'G', aligned: true }]);
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
    expect(layout.nets[0].bounds.maxY).toBeLessThan(layout.nets[1].bounds.minY);
    expect(layout.inputTargets.find((item) => item.net === 'B')!.aligned).toBe(true);
    expect(layout.inputTargets.find((item) => item.net === 'A')!.aligned).toBe(arrangement === 'LR');
    if (arrangement === 'LR') expect(device(layout, 'M1').position[0]).toBeLessThan(device(layout, 'M2').position[0]);
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
    for (let index = 1; index < layout.stages.length; index++) {
      expect(layout.stages[index - 1].bounds.maxY).toBeLessThan(layout.stages[index].bounds.minY);
    }
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
