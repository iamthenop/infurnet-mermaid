/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { deviceTypes, netTypes, type CircuitModel } from '../src/circuitTypes.js';
import { ScaffoldDb } from '../src/db.js';
import { createParser } from '../src/parser.js';
import notation from '../spec/notation.md?raw';

const digital = 'circuitDiagram D\nA(["A"]):::pinIn\nY(["Y"]):::pinOut\nU1["U1"]:::inverter';
const electrical = 'circuitDiagram A\nN(("N")):::net\nM["M"]:::nmos';
const resistors = 'circuitDiagram A\nR1["R1"]:::resistor\nR2["R2"]:::resistor\nR3["R3"]:::resistor';

function topology(model: CircuitModel): string[][] {
  return [...new Set(model.connections.map(({ net }) => net))].map((net) => model.connections
    .filter((connection) => connection.net === net)
    .map(({ device, terminal }) => `${device}.${terminal}`).sort()).sort();
}

describe('circuit parser', () => {
  it.each(['D', 'A'])('parses an empty %s circuit', (mode) => {
    expect(parseCircuit(`\n%% comment\ncircuitDiagram ${mode}\n%% end`))
      .toEqual({ mode, devices: [], nets: [], stages: [], blocks: [], connections: [] });
  });

  it.each(deviceTypes)('retains the approved %s device and its terminal contract', (type) => {
    const mode = ['buffer', 'inverter'].includes(type) ? 'D' : 'A';
    const model = parseCircuit(`circuitDiagram ${mode}\nU1["display<br/>value=1"]:::${type}`);
    const terminals = type.endsWith('Blk') ? ['G', 'D', 'S', 'B']
      : ['pmos', 'nmos'].includes(type) ? ['G', 'D', 'S']
        : type === 'diode' ? ['A', 'K'] : type.endsWith('Source') ? ['P', 'N']
          : ['inverter', 'buffer'].includes(type) ? ['I', 'O'] : ['A', 'B'];
    expect(model.devices[0]).toMatchObject({ id: 'U1', type, label: 'display<br/>value=1', stage: 0 });
    expect([...model.devices[0]!.terminals].sort()).toEqual(terminals.sort());
    expect(model.nets).toEqual([]);
  });

  it.each(netTypes.flatMap((type) => ['D', 'A'].map((mode) => ({ type, mode }))))('accepts shared $type in $mode', ({ type, mode }) => {
    const label = type === 'net' ? '(("label"))' : ['supplyNet', 'ground'].includes(type) ? '{{"label"}}' : '(["label"])';
    const model = parseCircuit(`circuitDiagram ${mode}\nN${label}:::${type}`);
    expect(model.nets).toEqual([{ id: 'N', type, label: 'label' }]);
    expect(model.devices).toEqual([]);
  });

  it.each(deviceTypes)('rejects %s in its ineligible mode', (type) => {
    const mode = ['buffer', 'inverter'].includes(type) ? 'A' : 'D';
    expect(() => parseCircuit(`circuitDiagram ${mode}\nU1["U1"]:::${type}`)).toThrow('Line 2: Type');
  });

  it('normalizes both connection orders and repeated identical assignments', () => {
    const a = parseCircuit(`${digital}\nA ---|I| U1\nU1 ---|O| Y`);
    const b = parseCircuit(`${digital}\nU1 ---|I| A\nY ---|O| U1\nA ---|I| U1`);
    expect(a).toEqual(b);
    expect(a.connections).toEqual([{ device: 'U1', terminal: 'I', net: 'A' }, { device: 'U1', terminal: 'O', net: 'Y' }]);
  });

  it('resolves forward references and shares only explicitly named nets', () => {
    const model = parseCircuit(`circuitDiagram D\nA ---|I| U1\nU2 ---|I| A\nU1[one]:::buffer\nU2[two]:::inverter\nA((same)):::net\nB((same)):::net`);
    expect(model.connections.map((edge) => edge.net)).toEqual(['A', 'A']);
    expect(model.nets.map((net) => net.id)).toEqual(['A', 'B']);
  });

  it('normalizes direct, reversed, repeated and explicit resistor connections equivalently', () => {
    const direct = parseCircuit(`${resistors}\nR1 ---|B:A| R2`);
    const reversed = parseCircuit(`${resistors}\nR2 ---|A:B| R1\nR1 ---|B:A| R2\nR1 ---|B:A| R2`);
    const explicit = parseCircuit(`${resistors}\nn1(("n1")):::net\nR1 ---|B| n1\nn1 ---|A| R2`);
    expect(topology(direct)).toEqual([['R1.B', 'R2.A']]);
    expect(topology(reversed)).toEqual(topology(direct));
    expect(topology(explicit)).toEqual(topology(direct));
    expect(direct.nets).toHaveLength(1);
    expect(reversed.nets).toEqual(direct.nets);
    expect(reversed.connections).toHaveLength(2);
    const net = direct.nets[0]!;
    expect(net).toMatchObject({ type: 'net', label: '', implicit: true });
    expect(net.id).not.toMatch(/^[A-Za-z0-9]+$/u);
    expect(() => parseCircuit(`${resistors}\n${net.id}(("collision")):::net`)).toThrow('Unsupported');
    expect(parseCircuit(`${resistors}\nR1 ---|B:A| R2`)).toEqual(direct);
    expect(explicit.nets).toEqual([{ id: 'n1', type: 'net', label: 'n1' }]);
  });

  it.each([
    ['series', 'R1 ---|B:A| R2\nR2 ---|B:A| R3', [['R1.B', 'R2.A'], ['R2.B', 'R3.A']]],
    ['branch', 'R1 ---|B:A| R2\nR1 ---|B:A| R3', [['R1.B', 'R2.A', 'R3.A']]],
    ['cycle', 'R1 ---|B:A| R2\nR2 ---|A:A| R3\nR3 ---|A:B| R1', [['R1.B', 'R2.A', 'R3.A']]],
  ] as const)('preserves %s topology independently of statement order', (_, links, expected) => {
    const model = parseCircuit(`${resistors}\n${links}`);
    const reordered = parseCircuit(`${resistors}\n${links.split('\n').reverse().join('\n')}`);
    expect(topology(model)).toEqual(expected);
    expect(topology(reordered)).toEqual(expected);
    expect(model.nets).toHaveLength(expected.length);
    expect(new Set(model.nets.map(({ id }) => id)).size).toBe(expected.length);
    expect(reordered.nets).toEqual(model.nets);
  });

  it('resolves forward device references', () => {
    const model = parseCircuit('circuitDiagram A\nR1 ---|B:A| R2\nR2["R2"]:::resistor\nR1["R1"]:::resistor');
    expect(topology(model)).toEqual([['R1.B', 'R2.A']]);
  });

  it.each([
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ])('reconciles named nets and rejects conflicts in statement order %j,%j,%j', (...order) => {
    const declarations = `${resistors}\nn1(("same")):::net\nn2(("same")):::net`;
    const links = ['R1 ---|B:A| R2', 'R1 ---|B| n1', 'n1 ---|A| R2'];
    const model = parseCircuit(`${declarations}\n${order.map((i) => links[i]).join('\n')}`);
    expect(topology(model)).toEqual([['R1.B', 'R2.A']]);
    expect(model.connections).toHaveLength(2);
    expect(model.connections.every(({ net }) => net === 'n1')).toBe(true);
    expect(model.nets).toEqual([
      { id: 'n1', type: 'net', label: 'same' }, { id: 'n2', type: 'net', label: 'same' },
    ]);
    links[2] = 'n2 ---|A| R2';
    const conflict = `${declarations}\n${order.map((i) => links[i]).join('\n')}`;
    expect(() => parseCircuit(conflict)).toThrow(/Line 9:.*(?:conflicts|already connected)/u);
  });

  it('reconciles a named net across joined groups and subsequent connections', () => {
    const model = parseCircuit(`${resistors}\nR4["R4"]:::resistor\nn1(("n1")):::net
R3 ---|A:A| R4
R4 ---|A| n1
R1 ---|B:A| R2
R2 ---|A:A| R3
R4 ---|A:B| R1`);
    expect(topology(model)).toEqual([['R1.B', 'R2.A', 'R3.A', 'R4.A']]);
    expect(model.connections.every(({ net }) => net === 'n1')).toBe(true);
    expect(model.nets).toEqual([{ id: 'n1', type: 'net', label: 'n1' }]);
  });

  it('connects digital devices across stages without changing membership', () => {
    const model = parseCircuit(`circuitDiagram D
subgraph stage first
  U1["U1"]:::inverter
end
subgraph stage second
  U2["U2"]:::buffer
end
U1 ---|O:I| U2`);
    expect(topology(model)).toEqual([['U1.O', 'U2.I']]);
    expect(model.nets).toHaveLength(1);
    expect(model.devices.map(({ stage }) => stage)).toEqual([0, 1]);
    expect(model.stages.map(({ devices }) => devices)).toEqual([['U1'], ['U2']]);
    expect(model.mode).toBe('D');
  });

  it.each([
    ['Missing ---|B:A| R2', 'undeclared'], ['R1 ---|B:A| Missing', 'undeclared'],
    ['R1 ---|X:A| R2', 'Unknown terminal'], ['R1 ---|B:X| R2', 'Unknown terminal'],
    ['n1 ---|B:A| R2', 'two distinct devices'], ['R1 ---|B:A| n1', 'two distinct devices'],
    ['n1 ---|B:A| n2', 'two distinct devices'], ['R1 ---|B:A| R1', 'two distinct devices'],
    ['R1 ---|:A| R2', 'Unsupported'], ['R1 ---|B:| R2', 'Unsupported'],
    ['R1 ---|B:A:B| R2', 'Unsupported'], ['R1 ---|B,A| R2', 'Unsupported'],
    ['R1 ---|B/A| R2', 'Unsupported'], ['R1 --- R2', 'Unsupported'],
    ['L:R1 ---|B:A| R2', 'Unsupported'], ['R1 ---|B:A| R:R2', 'Unsupported'],
  ])('rejects direct shorthand %s', (link, message) => {
    expect(() => parseCircuit(`${resistors}\nn1(("n1")):::net\nn2(("n2")):::net\n${link}`))
      .toThrow(new RegExp(`Line 7: .*${message}`, 'u'));
  });

  it('clears a failed normalization and isolates recovered implicit nets', () => {
    const db = new ScaffoldDb(), other = new ScaffoldDb(), parser = createParser(db);
    parser.parse(`${resistors}\nR1 ---|B:A| R2`);
    const previous = db.getModel();
    createParser(other).parse(digital);
    expect(() => parser.parse(`${resistors}\nn1(("n1")):::net\nn2(("n2")):::net\nR1 ---|B| n1\nR2 ---|A| n2\nR1 ---|B:A| R2`))
      .toThrow('conflicts');
    expect(() => db.getModel()).toThrow('parsed successfully');
    expect(topology(previous)).toEqual([['R1.B', 'R2.A']]);
    parser.parse(`${resistors}\nR2 ---|B:A| R3`);
    expect(topology(db.getModel())).toEqual([['R2.B', 'R3.A']]);
    expect(db.getModel().nets).toHaveLength(1);
    expect(other.getModel()).toEqual(parseCircuit(digital));
  });

  it('records blocks, stage order, membership, directions and the implicit final stage', () => {
    const model = parseCircuit(`circuitDiagram D
Loose["Loose"]:::buffer
subgraph block datapath
  subgraph stage first
    direction TB
    U1["U1"]:::inverter
  end
  subgraph stage second
    U2["U2"]:::buffer
  end
end
subgraph stage third
  direction LR
  U3["U3"]:::buffer
end`);
    expect(model.blocks).toEqual([{ name: 'datapath', mode: 'D', stages: [0, 1] }]);
    expect(model.stages).toEqual([
      { name: 'first', implicit: false, order: 0, mode: 'D', direction: 'TB', block: 0, devices: ['U1'] },
      { name: 'second', implicit: false, order: 1, mode: 'D', direction: 'auto', block: 0, devices: ['U2'] },
      { name: 'third', implicit: false, order: 2, mode: 'D', direction: 'LR', block: null, devices: ['U3'] },
      { name: null, implicit: true, order: 3, mode: 'D', direction: 'auto', block: null, devices: ['Loose'] },
    ]);
    expect(model.devices.map((device) => device.stage)).toEqual([3, 0, 1, 2]);
    expect(model.connections).toEqual([]);
  });

  it('preserves comments, quoted percent signs, escaped quotes and CRLF line numbering', () => {
    const model = parseCircuit('%% comment\r\ncircuitDiagram D %% mode\r\nU1["a %% b \\"quoted\\""]:::buffer %% trailing');
    expect(model.devices[0]!.label).toBe('a %% b "quoted"');
    expect(() => parseCircuit('\n%% comment\ncircuitDiagram D\n\nnope')).toThrow('Line 5');
    expect(parseCircuit('circuitDiagram A\nR[R1<br/>10k (5%)]:::resistor').devices[0]!.label)
      .toBe('R1<br/>10k (5%)');
  });

  it('parses NAND2 with parallel PMOS and series NMOS connections', () => {
    const fixture = notation.split('## NAND2 reference')[1]!.split('```text\n')[1]!.split('```')[0]!;
    const model = parseCircuit(fixture);
    expect(model.mode).toBe('A');
    expect(model.devices).toHaveLength(4);
    expect(model.nets).toHaveLength(6);
    expect(model.connections).toHaveLength(12);
    expect(model.stages.map(({ name, direction }) => [name, direction])).toEqual([['pullUp', 'LR'], ['pullDown', 'TB']]);
    const assignments = Object.fromEntries(model.devices.map((device) => [device.id, Object.fromEntries(
      model.connections.filter((edge) => edge.device === device.id).map((edge) => [edge.terminal, edge.net]),
    )]));
    expect(assignments).toEqual({
      PMOS0: { G: 'A', S: 'VDD', D: 'OUT' }, PMOS1: { G: 'B', S: 'VDD', D: 'OUT' },
      NMOS0: { G: 'A', D: 'OUT', S: 'n01' }, NMOS1: { G: 'B', D: 'n01', S: 'VSS' },
    });
    for (const device of model.devices) expect(device.bulk).toEqual({ kind: 'implicit', sourceTerminal: 'S' });
  });

  it.each(['pmosBlk', 'nmosBlk'])('retains explicit bulk on %s without inventing nets', (type) => {
    const model = parseCircuit(`circuitDiagram A\nM["M"]:::${type}\nN(("N")):::net\nM ---|B| N`);
    expect(model.devices[0]!.bulk).toEqual({ kind: 'explicit', terminal: 'B' });
    expect(model.connections).toEqual([{ device: 'M', terminal: 'B', net: 'N' }]);
    expect(model.nets).toHaveLength(1);
  });

  it.each([
    ['', 'Line 1'], ['circuitDiagram', 'Line 1'], ['circuitDiagram X', 'Line 1'], ['flowchart D', 'Line 1'],
    ['circuitDiagram D extra', 'Line 1'], ['circuitDiagram D\nU["U"]:::ic', 'Unknown authorable'],
    ['circuitDiagram D\nU["U"]:::and', 'Unknown authorable'], ['circuitDiagram A\nU["U"]:::jfet', 'Unknown authorable'],
    ['circuitDiagram D\nM["M"]:::pmos', 'not eligible'], ['circuitDiagram A\nU["U"]:::inverter', 'not eligible'],
    [`${digital}\nU1["again"]:::buffer`, 'Duplicate'], [`${digital}\nU1(("again")):::net`, 'Duplicate'],
    [`${digital}\nA ---|I| Missing`, 'undeclared'], [`${digital}\nMissing ---|I| U1`, 'undeclared'],
    [`${digital}\nA ---|G| U1`, 'Unknown terminal'], [`${electrical}\nM ---|B| N`, 'Unknown terminal'],
    [`${digital}\nA ---|I| Y`, 'one device and one net'], [`${digital}\nU2["U2"]:::buffer\nU1 ---|I| U2`, 'one device and one net'],
    [`${digital}\nA ---|I| U1\nY ---|I| U1`, 'already connected'],
    [`${digital}\nA --> U1`, 'Unsupported'], [`${digital}\nA ---|I| L:U1`, 'Unsupported'],
    [`${digital}\nR:U1 ---|O| Y`, 'Unsupported'], ['circuitDiagram D\nU1(("U1")):::buffer', 'brackets'],
    ['circuitDiagram D\nN["N"]:::net', 'brackets'], ['circuitDiagram D\nU1["bad]:::buffer', 'Malformed'],
    ['circuitDiagram D\nsubgraph old', 'Unsupported'], ['circuitDiagram D\nend', 'Unexpected end'],
    ['circuitDiagram D\nsubgraph stage unfinished', 'Line 2'],
    ['circuitDiagram D\nsubgraph stage first\nsubgraph stage second', 'Stages cannot'],
    ['circuitDiagram D\nsubgraph stage first\nsubgraph block nested', 'Blocks may only'],
    ['circuitDiagram D\nsubgraph block first\nsubgraph block nested', 'Blocks may only'],
    ['circuitDiagram D\nsubgraph block first\nU1["U1"]:::buffer\nend', 'Blocks contain stages'],
    ['circuitDiagram D\nsubgraph stage first\nN(("N")):::net\nend', 'outside subgraphs'],
    ['circuitDiagram D\nsubgraph block first\nN(("N")):::net\nend', 'outside subgraphs'],
    ['circuitDiagram D\ndirection LR', 'inside a stage'],
    ['circuitDiagram D\nsubgraph block first\ndirection TB', 'inside a stage'],
    ['circuitDiagram D\nsubgraph stage first\ndirection RL\nend', 'Unsupported'],
    ['circuitDiagram D\nsubgraph stage first\ndirection auto\nend', 'Unsupported'],
    ['circuitDiagram D\nsubgraph stage first\ncircuitDiagram A\nend', 'Unsupported'],
    ['circuitDiagram D\nsubgraph stage first\nM["M"]:::nmos\nend', 'not eligible'],
  ])('rejects %j', (text, message) => {
    expect(() => parseCircuit(text)).toThrow(message);
    expect(() => parseCircuit(text)).toThrow(/Line \d+:/u);
  });

  it('publishes complete models only and isolates successive databases', () => {
    const db = new ScaffoldDb(), other = new ScaffoldDb(), parser = createParser(db);
    parser.parse(digital);
    expect(() => other.getModel()).toThrow('parsed successfully');
    expect(() => parser.parse(`${digital}\nA ---|bad| U1`)).toThrow();
    expect(() => db.getModel()).toThrow('parsed successfully');
    parser.parse(electrical);
    expect(db.getModel().devices.map(({ id }) => id)).toEqual(['M']);
    createParser(other).parse('circuitDiagram D');
    db.clear();
    expect(() => db.getModel()).toThrow('parsed successfully');
    expect(other.getModel().devices).toEqual([]);
  });
});
