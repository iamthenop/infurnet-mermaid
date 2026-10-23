/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { deviceTypes, netTypes } from '../src/circuitTypes.js';
import { ScaffoldDb } from '../src/db.js';
import { createParser } from '../src/parser.js';
import notation from '../spec/notation.md?raw';

const digital = 'circuitDiagram D\nA(["A"]):::pinIn\nY(["Y"]):::pinOut\nU1["U1"]:::inverter';
const electrical = 'circuitDiagram A\nN(("N")):::net\nM["M"]:::nmos';

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
      { name: 'second', implicit: false, order: 1, mode: 'D', direction: 'LR', block: 0, devices: ['U2'] },
      { name: 'third', implicit: false, order: 2, mode: 'D', direction: 'LR', block: null, devices: ['U3'] },
      { name: null, implicit: true, order: 3, mode: 'D', direction: 'LR', block: null, devices: ['Loose'] },
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
