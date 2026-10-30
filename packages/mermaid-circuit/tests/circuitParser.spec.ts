/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { deviceTypes, netTypes, mosfetTypes, type CircuitModel } from '../src/circuitTypes.js';
import { ScaffoldDb } from '../src/db.js';
import { createParser } from '../src/parser.js';
import notation from '../spec/notation.md?raw';

const twoInputLogic = ['nand', 'and', 'or', 'nor', 'xor', 'xnor', 'schmittAnd', 'schmittNand'];
const singleInputLogic = ['inverter', 'buffer', 'notNot', 'schmitt', 'schmittNot'];
const logicTypes = [...twoInputLogic, ...singleInputLogic];
const resistorFuseVariants = ['resistorIEC', 'resistorVar', 'resistorVarIEC', 'thermistor',
  'photoresistor', 'photoresistorIEC', 'fuseIEC', 'fuseUs'];

const capacitorLoadVariants = ['capacitor2', 'capacitorPolar', 'capacitor2Polar', 'capacitorVar',
  'capacitorTrim', 'lamp', 'lamp2', 'breaker', 'diac'];

const diodeTypes = ['diode', 'diodeFilled', 'schottky', 'diodeTunnel', 'diodeShockley',
  'zener', 'diodeTVS', 'varactor', 'led', 'led2', 'photodiode'];

const digital = 'circuitDiagram D\nA(["A"]):::pinIn\nY(["Y"]):::pinOut\nU1["U1"]:::inverter';
const electrical = 'circuitDiagram A\nN(["N"]):::pinInOut\nM["M"]:::nmos';
const resistors = 'circuitDiagram A\nR1["R1"]:::resistor\nR2["R2"]:::resistor\nR3["R3"]:::resistor';
const drawingFixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });

function topology(model: CircuitModel): string[][] {
  return [...new Set(model.connections.map(({ net }) => net))].map((net) => model.connections
    .filter((connection) => connection.net === net)
    .map(({ device, terminal }) => `${device}.${terminal}`).sort()).sort();
}

describe('circuit parser', () => {
  it('preserves the controller topology and IC pin sides and antenna connection', () => {
    const source = drawingFixtures['../examples/fixtures/wireless-solenoid.mmd'];
    const model = parseCircuit(source);
    expect(topology(model)).toEqual([
      ['Antenna.A', 'Remote.A'], ['Source.P', 'Fuse.A'], ['Fuse.B', 'Remote.v+', 'Remote.ctl'],
      ['Source.N', 'Remote.v-', 'Solenoid.B', 'Diode.A'], ['Remote.no', 'Solenoid.A', 'Diode.K'],
    ].map((group) => group.sort()).sort());
    expect(model.devices.find((device) => device.id === 'Remote')!.pinSides)
      .toEqual({ 'v+': 'T', ctl: 'L', A: 'L', 'v-': 'B', no: 'R' });
    expect(model.nets.every((net) => net.type === 'net' && net.implicit)).toBe(true);
    expect(model.devices.map((device) => device.id).sort()).toEqual(['Antenna', 'Diode', 'Fuse', 'Remote', 'Solenoid', 'Source']);
    expect(parseCircuit(source.replace('L:Remote', 'T:Remote')).devices.find((device) => device.id === 'Remote')!.pinSides!.ctl).toBe('T');
    expect(() => parseCircuit(source.replace('T:Remote', 'Remote'))).toThrow('side qualifier');
    expect(() => parseCircuit(source + '\nVDD --- |v+| R:Remote')).toThrow('conflicting sides');
    expect(() => parseCircuit('circuitDiagram A\nRemote[Remote]:::ic')).toThrow('at least one named pin');
  });

  it('places IC side markers next to the connection according to written direction', () => {
    const declarations = 'circuitDiagram A\nU[U]:::ic\nN([N]):::pinInOut';
    expect(parseCircuit(`${declarations}\nU:R |out| --- N`).devices[0].pinSides).toEqual({ out: 'R' });
    expect(parseCircuit(`${declarations}\nN --- |in| L:U`).devices[0].pinSides).toEqual({ in: 'L' });
    for (const link of ['R:U |out| --- N', 'N --- |in| U:L']) {
      expect(() => parseCircuit(`${declarations}\n${link}`)).toThrow('Unsupported');
    }
  });

  it('infers the sole antenna terminal in either position, including forward declarations', () => {
    for (const link of ['A --- |in| L:U', 'U:R |out| --- A']) {
      const model = parseCircuit(`circuitDiagram A\n${link}\nA[A]:::antenna\nU[U]:::ic`);
      expect(model.connections.find((connection) => connection.device === 'A')!.terminal).toBe('A');
      expect(model.nets).toHaveLength(1);
    }
    for (const link of ['A --- N', 'N --- A']) {
      expect(parseCircuit(`circuitDiagram A\n${link}\nA[A]:::antenna\nN([N]):::pinInOut`).connections)
        .toEqual([{ device: 'A', terminal: 'A', net: 'N' }]);
    }
    expect(() => parseCircuit('circuitDiagram A\nA[A]:::antenna\nU[U]:::ic\nA |B| --- |in| L:U')).toThrow('Unknown terminal');
  });

  it('keeps direct block devices in a shared implicit stage inside that block', () => {
    const model = parseCircuit(`circuitDiagram A
subgraph block load
R1[R1]:::resistor
subgraph stage named
R2[R2]:::resistor
end
R3[R3]:::resistor
end`);
    expect(model.blocks[0].stages).toEqual([0, 1]);
    expect(model.stages[0]).toMatchObject({ name: null, implicit: true, block: 0, devices: ['R1', 'R3'] });
    expect(model.stages[1]).toMatchObject({ name: 'named', block: 0, devices: ['R2'] });
    expect(model.devices.map((device) => device.stage)).toEqual([0, 1, 0]);
  });

  it('retains all twelve XOR devices and the specified terminal groups', () => {
    const model = parseCircuit(drawingFixtures['../examples/fixtures/cmos-xor12.mmd']);
    expect(model.devices).toHaveLength(12);
    expect(model.stages.map((stage) => stage.name)).toEqual(['invertA', 'invertB', 'pullUpInputs', 'pullUpComplements', 'pullDownHigh', 'pullDownLow']);
    expect(topology(model)).toEqual([
      ['PA.G', 'NA.G', 'P0.G', 'N0.G'], ['PB.G', 'NB.G', 'P1.G', 'N1.G'],
      ['PA.S', 'PB.S', 'P0.S', 'P1.S'], ['NA.S', 'NB.S', 'N1.S', 'N3.S'],
      ['PA.D', 'NA.D', 'P2.G', 'N2.G'], ['PB.D', 'NB.D', 'P3.G', 'N3.G'],
      ['P0.D', 'P1.D', 'P2.S', 'P3.S'], ['P2.D', 'P3.D', 'N0.D', 'N2.D'],
      ['N0.S', 'N1.D'], ['N2.S', 'N3.D'],
    ].map((group) => group.sort()).sort());
  });

  it.each([false, true].flatMap((a) => [false, true].map((b) => [a, b] as const)))('verifies NAND and both XOR truth tables for A=%s B=%s', (a, b) => {
    for (const [name, expected] of [['cmos-inverter', !a], ['cmos-nand2', !(a && b)], ['cmos-xor12', a !== b], ['xor-nand4', a !== b]] as const) {
      const model = parseCircuit(drawingFixtures[`../examples/fixtures/${name}.mmd`]);
      const terminals = new Map(model.connections.map((connection) => [`${connection.device}.${connection.terminal}`, connection.net]));
      const values = new Map<string, boolean>([['A', a], ['B', b], ['VDD', true], ['VSS', false]]);
      for (let pass = 0; pass < model.devices.length + 1; pass++) {
        const conductive: [string, string][] = [];
        for (const device of model.devices) {
          const net = (terminal: string) => terminals.get(`${device.id}.${terminal}`)!;
          if (device.type === 'nand') {
            const first = values.get(net('I1')), second = values.get(net('I2'));
            if (first !== undefined && second !== undefined) values.set(net('O'), !(first && second));
          } else {
            const gate = values.get(net('G'));
            if (gate !== undefined && (device.type === 'pmos' ? !gate : gate)) conductive.push([net('S'), net('D')]);
          }
        }
        for (let propagation = 0; propagation < model.nets.length; propagation++) {
          for (const [first, second] of conductive) {
            if (values.has(first) && values.has(second)) expect(values.get(first), name).toBe(values.get(second));
            else if (values.has(first)) values.set(second, values.get(first)!);
            else if (values.has(second)) values.set(first, values.get(second)!);
          }
        }
      }
      expect(values.get(name === 'xor-nand4' ? 'Y' : 'OUT'), name).toBe(expected);
    }
  });

  it.each(['D', 'A'])('parses an empty %s circuit', (mode) => {
    expect(parseCircuit(`\n%% comment\ncircuitDiagram ${mode}\n%% end`))
      .toEqual({ mode, devices: [], nets: [], stages: [], blocks: [], connections: [] });
  });

  it.each(deviceTypes.filter((type) => !['ic', 'mux', 'demux'].includes(type)))('retains the approved %s device and its terminal contract', (type) => {
    const mode = logicTypes.includes(type) ? 'D' : 'A';
    const model = parseCircuit(`circuitDiagram ${mode}\nU1["display<br/>value=1"]:::${type}`);
    const terminals = type.endsWith('Blk') || type.endsWith('Bulk') ? ['G', 'D', 'S', 'B']
      : mosfetTypes.includes(type) ? ['G', 'D', 'S']
        : type === 'antenna' ? ['A'] : diodeTypes.includes(type) ? ['A', 'K'] : type.endsWith('Source') ? ['P', 'N']
          : twoInputLogic.includes(type) ? ['I1', 'I2', 'O'] : singleInputLogic.includes(type) ? ['I', 'O'] : ['A', 'B'];
    expect(model.devices[0]).toMatchObject({ id: 'U1', type, label: 'display<br/>value=1', stage: 0 });
    expect([...model.devices[0]!.terminals].sort()).toEqual(terminals.sort());
    expect(model.nets).toEqual([]);
  });

  it.each([
    ['mux', 2, ['I0', 'I1', 'O', 'S0']],
    ['mux', 4, ['I0', 'I1', 'I2', 'I3', 'O', 'S0', 'S1']],
    ['demux', 2, ['I', 'O0', 'O1', 'S0']],
    ['demux', 4, ['I', 'O0', 'O1', 'O2', 'O3', 'S0', 'S1']],
  ] as const)('preserves the fixed %s size=%s terminals even when unconnected', (type, size, terminals) => {
    const declaration = `circuitDiagram D\nU["U<br/>size=${size}"]:::${type}`;
    const model = parseCircuit(declaration);
    expect(model.devices[0]).toMatchObject({ type, size, terminals, label: `U<br/>size=${size}` });
    expect(model.devices[0].pinSides).toEqual(Object.fromEntries(terminals.map((terminal) =>
      [terminal, terminal.startsWith('I') ? 'L' : terminal.startsWith('O') ? 'R' : 'B'])));
    expect(model.connections).toEqual([]);
    expect(model.nets).toEqual([]);
    const links = terminals.map((terminal) => `N${terminal}([${terminal}]):::pinInOut\nU |${terminal}| --- N${terminal}`);
    const connected = parseCircuit(`${declaration}\n${links.join('\n')}\nU |${terminals[0]}| --- N${terminals[0]}`);
    expect(connected.connections).toEqual(terminals.map((terminal) => ({ device: 'U', terminal, net: `N${terminal}` })));
    expect(new Set(connected.connections.map(({ net }) => net)).size).toBe(terminals.length);
    for (const invalid of ['EN', 'CLK', 'RESET', 'S', 'S2', 'I4', 'O4', ...(size === 2 ? ['S1', 'I2', 'O2'] : []),
      ...(type === 'mux' ? ['I', 'O0'] : ['I0', 'O'])]) {
      expect(() => parseCircuit(`${declaration}\nX([X]):::pinInOut\nU |${invalid}| --- X`)).toThrow('Unknown terminal');
    }
    expect(() => parseCircuit(`${declaration}\nU:L |${terminals[0]}| --- X`)).toThrow('side qualifier');
    expect(() => parseCircuit(`${declaration}\nU |S0| --- Missing`)).toThrow('Declare endpoint');
    expect(() => parseCircuit(declaration.replace('circuitDiagram D', 'circuitDiagram A'))).toThrow('not eligible');
    expect(parseCircuit(declaration.replace('size=', 'size = ')).devices[0].size).toBe(size);
  });

  it.each(['mux', 'demux'])('rejects missing, malformed, conflicting and unsupported %s sizes', (type) => {
    for (const label of ['U', 'size=2', 'U<br/>size=', 'U<br/>size=1', 'U<br/>size=3', 'U<br/>size=8',
      'U<br/>size=02', 'U<br/>size=2.0', 'U<br/>size=2x', 'U<br/>size=2<br/>size=4', 'U<br/>size=2<br/>size=bad']) {
      expect(() => parseCircuit(`circuitDiagram D\nU["${label}"]:::${type}`)).toThrow('size=2 or size=4');
    }
    expect(parseCircuit(`circuitDiagram D\nU["U<br/>size=2<br/>size=2"]:::${type}`).devices[0].size).toBe(2);
    expect(parseCircuit(`circuitDiagram D\nU["U<br/>gain=10<br/>size=4"]:::${type}`).devices[0].label).toBe('U<br/>gain=10<br/>size=4');
    expect(parseCircuit('circuitDiagram D\nU["U<br/>size=bad"]:::buffer').devices[0].size).toBeUndefined();
  });

  it('retains separate data and select nets across the four MUX/DEMUX configurations', () => {
    const model = parseCircuit(drawingFixtures['../examples/fixtures/mux-demux.mmd']);
    expect(model.devices.map(({ type, size }) => [type, size])).toEqual([['mux', 2], ['demux', 4], ['mux', 4], ['demux', 2]]);
    expect(topology(model)).toEqual([
      ['M2.I0'], ['M2.I1'], ['M2.O', 'D4.I'], ...[0, 1, 2, 3].map((i) => [`D4.O${i}`, `M4.I${i}`]),
      ['M4.O', 'D2.I'], ['D2.O0'], ['D2.O1'], ['M2.S0'], ['D4.S0'], ['D4.S1'], ['M4.S0'], ['M4.S1'], ['D2.S0'],
    ].map((group) => group.sort()).sort());
    expect(model.connections).toHaveLength(22);
  });

  it.each(netTypes.filter((type) => type !== 'net').flatMap((type) => ['D', 'A'].map((mode) => ({ type, mode }))))('accepts shared $type in $mode', ({ type, mode }) => {
    const label = ['supplyNet', 'ground'].includes(type) ? '{{"label"}}' : '(["label"])';
    const model = parseCircuit(`circuitDiagram ${mode}\nN${label}:::${type}`);
    expect(model.nets).toEqual([{ id: 'N', type, label: 'label' }]);
    expect(model.devices).toEqual([]);
  });

  it.each(logicTypes)('preserves each %s terminal connection and rejects invalid terminal names', (type) => {
    const terminals = twoInputLogic.includes(type) ? ['I1', 'I2', 'O'] : ['I', 'O'];
    const declarations = `circuitDiagram D\nU[U]:::${type}\n${terminals.map((terminal) => `N${terminal}([${terminal}]):::pinInOut`).join('\n')}`;
    const source = `${declarations}\n${terminals.map((terminal) => `U |${terminal}| --- N${terminal}`).join('\n')}`;
    expect(parseCircuit(source).connections).toEqual(terminals.map((terminal) => ({ device: 'U', terminal, net: `N${terminal}` })));
    for (const terminal of ['G', 'bad', ...(twoInputLogic.includes(type) ? ['I', 'I3'] : ['I1', 'I2'])]) {
      expect(() => parseCircuit(`${declarations}\nU |${terminal}| --- NO`)).toThrow('Unknown terminal');
    }
  });

  it.each([
    { name: 'logic-variants', types: ['and', 'or', 'nor', 'xor', 'xnor', 'notNot'], groups: [
      ['U1.I1'], ['U1.I2'], ['U2.I1'], ['U2.I2'], ['U3.I1'], ['U3.I2'], ['U6.O'],
      ['U1.O', 'U4.I1'], ['U2.O', 'U4.I2'], ['U4.O', 'U5.I1'], ['U3.O', 'U5.I2'], ['U5.O', 'U6.I'],
    ] },
    { name: 'schmitt-variants', types: ['schmitt', 'schmittNot', 'schmittAnd', 'schmittNand'], groups: [
      ['U1.I'], ['U2.I'], ['U4.O'], ['U1.O', 'U3.I1'], ['U2.O', 'U3.I2'], ['U3.O', 'U4.I1', 'U4.I2'],
    ] },
  ])('connects every terminal in $name without merging distinct signals', ({ name, types, groups }) => {
    const model = parseCircuit(drawingFixtures[`../examples/fixtures/${name}.mmd`]);
    expect(model.devices.map((device) => device.type)).toEqual(types);
    expect(topology(model)).toEqual(groups.map((group) => group.sort()).sort());
    const netAt = (device: string, terminal: string) => model.connections.find((item) => item.device === device && item.terminal === terminal)!.net;
    for (const device of model.devices) {
      const connections = model.connections.filter((item) => item.device === device.id);
      expect(connections.map((item) => item.terminal).sort()).toEqual([...device.terminals].sort());
    }
    expect(netAt('U1', name === 'logic-variants' ? 'I1' : 'I')).toBe('A');
    expect(netAt(model.devices.at(-1)!.id, 'O')).toBe('Y');
  });

  it.each(deviceTypes)('rejects %s in its ineligible mode', (type) => {
    const mode = [...logicTypes, 'mux', 'demux'].includes(type) ? 'A' : 'D';
    expect(() => parseCircuit(`circuitDiagram ${mode}\nU1["U1"]:::${type}`)).toThrow('Line 2: Type');
  });

  it('normalizes membership for either written direction and deduplicates assignments', () => {
    const a = parseCircuit(`${digital}\nA ---|I| U1\nU1 |O| --- Y`);
    const b = parseCircuit(`${digital}\nU1 |I| --- A\nY ---|O| U1\nA ---|I| U1`);
    expect(a).toEqual(b);
    expect(a.connections).toEqual([{ device: 'U1', terminal: 'I', net: 'A' }, { device: 'U1', terminal: 'O', net: 'Y' }]);
  });

  it('resolves forward references and shares only explicitly named nets', () => {
    const model = parseCircuit(`circuitDiagram D\nA ---|I| U1\nU2 |I| --- A\nU1[one]:::buffer\nU2[two]:::inverter\nA([same]):::pinInOut\nB([same]):::pinInOut`);
    expect(model.connections.map((edge) => edge.net)).toEqual(['A', 'A']);
    expect(model.nets.map((net) => net.id)).toEqual(['A', 'B']);
  });

  it.each(['resistor', ...resistorFuseVariants, ...capacitorLoadVariants])('normalizes %s terminal membership independently of endpoint order and duplicate statements', (type) => {
    const declarations = resistors.replaceAll(':::resistor', `:::${type}`);
    const direct = parseCircuit(`${declarations}\nR1 |B| --- |A| R2`);
    const reversed = parseCircuit(`${declarations}\nR2 |A| --- |B| R1\nR1 |B| --- |A| R2\nR1 |B| --- |A| R2`);
    for (const terminal of ['W', 'C', 'I', 'K', 'bad']) {
      expect(() => parseCircuit(`${declarations}\nR1 |${terminal}| --- |A| R2`)).toThrow('Unknown terminal');
      expect(() => parseCircuit(`${declarations}\nR1 |B| --- |${terminal}| R2`)).toThrow('Unknown terminal');
    }
    expect(topology(direct)).toEqual([['R1.B', 'R2.A']]);
    expect(topology(reversed)).toEqual(topology(direct));
    expect(direct.nets).toHaveLength(1);
    expect(parseCircuit(`${declarations}\nR1 |B| --- R2 |A|`)).toEqual(direct);
    expect(reversed.nets).toEqual(direct.nets);
    expect(reversed.connections).toHaveLength(2);
    const net = direct.nets[0]!;
    expect(net).toMatchObject({ type: 'net', label: '', implicit: true });
    expect(net.id).not.toMatch(/^[A-Za-z0-9]+$/u);
    expect(parseCircuit(`${declarations}\nR1 |B| --- |A| R2`)).toEqual(direct);
  });

  it('implies a junction from a shared terminal without a net declaration', () => {
    const declarations = 'circuitDiagram A\n' + ['P0', 'P1', 'P2', 'P3']
      .map((id) => `${id}["${id}"]:::pmos`).join('\n');
    const links = ['P0 |D| --- |S| P1', 'P0 |D| --- |S| P2', 'P0 |D| --- |S| P3'];
    for (const statements of [links, [...links].reverse(), [...links, links[0]!]]) {
      const model = parseCircuit(`${declarations}\n${statements.join('\n')}`);
      expect(topology(model)).toEqual([['P0.D', 'P1.S', 'P2.S', 'P3.S']]);
      expect(model.connections).toHaveLength(4);
      expect(model.nets).toHaveLength(1);
    }
    expect(() => parseCircuit(`${declarations}\nP0 |S| --- |S| P1`)).toThrow('source-to-source');
  });

  it('preserves the resistor and fuse fixture series links and parallel terminal groups', () => {
    const model = parseCircuit(drawingFixtures['../examples/fixtures/resistor-fuse-variants.mmd']);
    expect(model.devices.map((device) => device.type).sort()).toEqual([...resistorFuseVariants].sort());
    expect(model.devices.every((device) => device.terminals.join(',') === 'A,B')).toBe(true);
    expect(model.connections).toHaveLength(16);
    expect(topology(model)).toEqual([
      ['F1.A'], ['F1.B', 'F2.A'], ['F2.B', 'R1.A', 'R2.A'],
      ['R1.B', 'R2.B', 'R3.A', 'R4.A'], ['R3.B', 'R4.B', 'R5.A', 'R6.A'], ['R5.B', 'R6.B'],
    ].map((group) => group.sort()).sort());
    expect(model.connections.find((item) => item.device === 'F1' && item.terminal === 'A')!.net).toBe('VDD');
    expect(model.connections.filter((item) => item.net === 'GND').map((item) => `${item.device}.${item.terminal}`).sort())
      .toEqual(['R5.B', 'R6.B']);
  });

  it('connects motor and solenoid terminals through one implied net without adding endpoint inference', () => {
    const declarations = 'circuitDiagram A\nM1["M1"]:::motor\nS1["S1"]:::solenoid';
    const model = parseCircuit(`${declarations}\nM1 |B| --- |A| S1`);
    expect(topology(model)).toEqual([['M1.B', 'S1.A']]);
    expect(model.nets).toHaveLength(1);
    expect(model.nets[0]).toMatchObject({ type: 'net', implicit: true });
    expect(model.devices.map(({ terminals }) => terminals)).toEqual([['A', 'B'], ['A', 'B']]);
    for (const connection of ['M1 |G| --- |A| S1', 'M1 |B| --- |S| S1']) {
      expect(() => parseCircuit(`${declarations}\n${connection}`)).toThrow('Unknown terminal');
    }
    expect(() => parseCircuit(`${declarations}\nVDD --- M1 |A|`)).toThrow('Declare endpoint "VDD" explicitly');
  });

  it('preserves capacitor and load series links, parallel groups, and DIAC terminal identity', () => {
    const model = parseCircuit(drawingFixtures['../examples/fixtures/capacitor-load-variants.mmd']);
    expect(model.devices.map((device) => device.type).sort()).toEqual([...capacitorLoadVariants].sort());
    expect(model.connections).toHaveLength(18);
    expect(topology(model)).toEqual([
      ['C1.A'], ['C1.B', 'C2.A', 'C3.A'], ['C2.B', 'C3.B', 'C4.A', 'C5.A'],
      ['C4.B', 'C5.B', 'L1.A', 'L2.A'], ['L1.B', 'L2.B', 'B1.A'], ['B1.B', 'D1.A'], ['D1.B'],
    ].map((group) => group.sort()).sort());
    expect(model.connections.find((item) => item.device === 'C1' && item.terminal === 'A')!.net).toBe('VDD');
    expect(model.connections.filter((item) => item.net === 'GND')).toEqual([{ device: 'D1', terminal: 'B', net: 'GND' }]);
  });

  it.each(['opamp'])('keeps %s catalog-only', (type) => {
    for (const mode of ['A', 'D']) {
      expect(() => parseCircuit(`circuitDiagram ${mode}\nU1["U1"]:::${type}`)).toThrow('Unknown authorable');
    }
  });

  it.each(diodeTypes)('preserves %s anode and cathode connections and rejects non-diode terminal names', (type) => {
    const declarations = `circuitDiagram A\nD1[D1]:::${type}\nD2[D2]:::${type}\nHigh([High]):::pinInOut\nLow([Low]):::pinInOut`;
    const model = parseCircuit(`${declarations}\nHigh --- |K| D1\nD1 |A| --- |K| D2\nD2 |A| --- Low`);
    expect(topology(model)).toEqual([['D1.A', 'D2.K'], ['D1.K'], ['D2.A']]);
    expect(model.connections).toHaveLength(4);
    expect(model.connections).toEqual(expect.arrayContaining([
      { device: 'D1', terminal: 'K', net: 'High' }, { device: 'D2', terminal: 'A', net: 'Low' },
    ]));
    for (const terminal of ['B', 'I', 'W', 'bad']) {
      expect(() => parseCircuit(`${declarations}\nD1 |${terminal}| --- |K| D2`)).toThrow('Unknown terminal');
      expect(() => parseCircuit(`${declarations}\nD1 |A| --- |${terminal}| D2`)).toThrow('Unknown terminal');
    }
  });

  it('preserves diode fixture polarity across series links and parallel groups', () => {
    const model = parseCircuit(drawingFixtures['../examples/fixtures/diode-variants.mmd']);
    expect(model.devices.map((device) => device.type).sort()).toEqual(diodeTypes.slice(1).sort());
    expect(model.connections).toHaveLength(20);
    expect(topology(model)).toEqual([
      ['D1.K'], ['D1.A', 'D2.K', 'D3.K'], ['D2.A', 'D3.A', 'D4.K', 'D5.K'],
      ['D4.A', 'D5.A', 'D6.K', 'D7.K'], ['D6.A', 'D7.A', 'D8.K', 'D9.K'],
      ['D8.A', 'D9.A', 'D10.K'], ['D10.A'],
    ].map((group) => group.sort()).sort());
    expect(model.connections.find((item) => item.device === 'D1' && item.terminal === 'K')!.net).toBe('VDD');
    expect(model.connections.filter((item) => item.net === 'GND')).toEqual([{ device: 'D10', terminal: 'A', net: 'GND' }]);
  });

  it.each(mosfetTypes)('requires drain-to-source written order for direct %s connections', (type) => {
    const source = `circuitDiagram A\nP0["P0"]:::${type}\nP1["P1"]:::${type}`;
    for (const link of ['P0 |D| --- |S| P1', 'P0 |D| --- P1 |S|']) {
      expect(topology(parseCircuit(`${source}\n${link}`))).toEqual([['P0.D', 'P1.S']]);
    }
    for (const link of ['P1 |S| --- |D| P0', 'P1 |S| --- P0 |D|']) {
      expect(() => parseCircuit(`${source}\n${link}`)).toThrow('Line 4: Direct source-to-drain');
      expect(() => parseCircuit(`${source}\nP0 |D| --- |S| P1\n${link}`))
        .toThrow('Line 5: Direct source-to-drain');
    }
  });

  it.each(mosfetTypes)('preserves independent %s terminal nets and bulk semantics', (type) => {
    const explicit = ['pmosBlk', 'nmosBlk', 'analogNFetBulk', 'analogPFetBulk', 'analogBiasedFetBulk'].includes(type);
    const terminals = explicit ? ['G', 'D', 'S', 'B'] : ['G', 'D', 'S'];
    const declaration = `circuitDiagram A\nM[M]:::${type}`;
    const empty = parseCircuit(declaration);
    expect(empty.connections).toEqual([]);
    expect(empty.nets).toEqual([]);
    expect(empty.devices[0].bulk).toEqual(explicit ? { kind: 'explicit', terminal: 'B' } : { kind: 'implicit', sourceTerminal: 'S' });
    const source = `${declaration}\n${terminals.map((terminal) => `N${terminal}([${terminal}]):::pinInOut\nM |${terminal}| --- N${terminal}`).join('\n')}`;
    expect(parseCircuit(source).connections).toEqual(terminals.map((terminal) => ({ device: 'M', terminal, net: `N${terminal}` })));
    expect(topology(parseCircuit(`${source}\nM |G| --- NG`))).toEqual(terminals.map((terminal) => [`M.${terminal}`]).sort());
    for (const terminal of ['A', 'K', 'bad', ...(explicit ? [] : ['B'])]) {
      expect(() => parseCircuit(`${source}\nM |${terminal}| --- NG`)).toThrow('Unknown terminal');
    }
    expect(() => parseCircuit(`${declaration}\nM2[M2]:::${type}\nM |S| --- |S| M2`)).toThrow('source-to-source');
    expect(() => parseCircuit(`${declaration}\nM |D| --- Missing |S|`)).toThrow('undeclared device');
    for (const [first, second, inferred] of [['G', 'D', 'pinIn'], ['D', 'G', 'pinOut']]) {
      const shared = `${declaration}\nM |${first}| --- X\nM |${second}| --- X`;
      expect(parseCircuit(shared).nets).toEqual([{ id: 'X', type: inferred, label: 'X', implicit: true }]);
      expect(parseCircuit(`${shared}\nX([explicit]):::pinInOut`).nets).toEqual([{ id: 'X', type: 'pinInOut', label: 'explicit' }]);
    }
  });

  it('preserves the MOSFET fixture gate, source, drain and independent bulk nets', () => {
    const model = parseCircuit(drawingFixtures['../examples/fixtures/mosfet-variants.mmd']);
    expect(topology(model)).toEqual([['N0.G', 'P0.G'], ['N0.D', 'P0.D'], ['P0.S'], ['N0.S'], ['P0.B']].sort());
    expect(model.connections.find((connection) => connection.terminal === 'B')!.net).toBe('Bias');
  });

  it('rejects retired direct syntax and authored generic nets', () => {
    expect(() => parseCircuit(`${resistors}\nR1 ---|B:A| R2`)).toThrow('Unsupported');
    expect(() => parseCircuit(`${resistors}\nn1(("n1")):::net`)).toThrow('Unknown authorable');
  });

  it.each(mosfetTypes.filter((type) => !type.startsWith('analogBiased')))('infers endpoints from %s terminals, not identifier names or written side', (type) => {
    const sourceType = ['pmos', 'pmosBlk', 'pmosDiode', 'pmosCircle', 'pmos2Diode', 'pmos2Circle',
      'analogPFet', 'analogPFetBulk', 'analogPFetCenteredGate', 'analogPFetNoArrow', 'pfet2'].includes(type) ? 'supplyNet' : 'ground';
    for (const links of ['GND --- M |S|\nVDD --- |G| M\nM |D| --- A', 'M |S| --- GND\nM |G| --- VDD\nA --- M |D|']) {
      const model = parseCircuit(`circuitDiagram A\nM["M"]:::${type}\n${links}`);
      expect(model.nets).toEqual([
        { id: 'GND', type: sourceType, label: 'GND', implicit: true },
        { id: 'VDD', type: 'pinIn', label: 'VDD', implicit: true },
        { id: 'A', type: 'pinOut', label: 'A', implicit: true },
      ]);
      expect(model.connections).toEqual([
        { device: 'M', terminal: 'S', net: 'GND' },
        { device: 'M', terminal: 'G', net: 'VDD' },
        { device: 'M', terminal: 'D', net: 'A' },
      ]);
    }
  });

  it('shares inferred endpoints across an inverter and resolves declarations before inference', () => {
    const source = `circuitDiagram A
P0["P0"]:::pmos
N1["N1"]:::nmos
VDD --- |S| P0
A --- |G| P0
P0 |D| --- B
B --- |D| N1
A --- |G| N1
N1 |S| --- GND`;
    const model = parseCircuit(source);
    expect(model.nets.map(({ id, type }) => [id, type])).toEqual([
      ['VDD', 'supplyNet'], ['A', 'pinIn'], ['B', 'pinOut'], ['GND', 'ground'],
    ]);
    expect(topology(model)).toEqual([['N1.D', 'P0.D'], ['N1.G', 'P0.G'], ['N1.S'], ['P0.S']]);
    expect(model.connections).toHaveLength(6);
    const declared = parseCircuit(`${source}\nB(["Output"]):::pinInOut`);
    expect(declared.nets.find(({ id }) => id === 'B')).toEqual({ id: 'B', type: 'pinInOut', label: 'Output' });
    expect(topology(declared)).toEqual(topology(model));
  });

  it('reuses one supply endpoint for repeated branches', () => {
    const model = parseCircuit(`circuitDiagram A
P0["P0"]:::pmos
P1["P1"]:::pmos
P2["P2"]:::pmos
VDD --- P0 |S|
VDD --- P1 |S|
VDD --- P2 |S|
VDD --- P0 |S|`);
    expect(model.nets).toEqual([{ id: 'VDD', type: 'supplyNet', label: 'VDD', implicit: true }]);
    expect(topology(model)).toEqual([['P0.S', 'P1.S', 'P2.S']]);
    expect(model.connections).toHaveLength(3);
  });

  it('resolves inferred endpoint types before normalizing connections in any statement order', () => {
    const source = 'circuitDiagram A\nM["M"]:::nmos\nR["R"]:::resistor';
    const links = ['X --- R |A|', 'X --- M |G|'];
    for (const statements of [links, [...links].reverse()]) {
      const model = parseCircuit(`${source}\n${statements.join('\n')}`);
      expect(model.nets).toEqual([{ id: 'X', type: 'pinIn', label: 'X', implicit: true }]);
      expect(topology(model)).toEqual([['M.G', 'R.A']]);
    }
  });

  it.each([
    ['X --- P0 |S|', 'N0 |S| --- X', 'supplyNet'],
    ['N0 |S| --- X', 'X --- P0 |S|', 'ground'],
    ['X --- P0 |G|', 'P0 |D| --- X', 'pinIn'],
    ['P0 |D| --- X', 'X --- P0 |G|', 'pinOut'],
  ])('retains the type inferred by %s when followed by %s', (first, second, type) => {
    const source = `circuitDiagram A\nP0["P0"]:::pmos\nN0["N0"]:::nmos\n${first}\n${second}\n${first}`;
    const model = parseCircuit(source);
    expect(model.nets).toEqual([{ id: 'X', type, label: 'X', implicit: true }]);
    expect(model.connections).toHaveLength(2);
    expect(model.connections.every(({ net }) => net === 'X')).toBe(true);
    const declared = parseCircuit(`${source}\nX(["Shared"]):::pinInOut`);
    expect(declared.nets).toEqual([{ id: 'X', type: 'pinInOut', label: 'Shared' }]);
    expect(topology(declared)).toEqual(topology(model));
  });

  it.each([
    ['pmosBlk', 'B'], ['nmosBlk', 'B'], ['analogNFetBulk', 'B'], ['analogPFetBulk', 'B'], ['analogBiasedFetBulk', 'B'],
    ['analogBiasedFet', 'S'], ['analogBiasedFetBulk', 'S'], ['analogBiasedFetCenteredGate', 'S'], ['analogBiasedFetNoArrow', 'S'], ['resistor', 'A'], ['capacitor', 'B'],
    ['diode', 'K'], ['voltageSource', 'P'], ['currentSource', 'N'], ['inverter', 'I'], ['buffer', 'O'],
  ])('requires an explicit endpoint type outside the approved inference mapping: %s.%s', (type, terminal) => {
    const mode = type === 'buffer' || type === 'inverter' ? 'D' : 'A';
    const source = `circuitDiagram ${mode}\nU["U"]:::${type}\nX --- U |${terminal}|`;
    expect(() => parseCircuit(source)).toThrow('Declare endpoint "X" explicitly');
    expect(parseCircuit(`${source}\nX(["X"]):::pinInOut`).connections)
      .toEqual([{ device: 'U', terminal, net: 'X' }]);
  });

  it.each([
    ['series', 'R1 |B| --- |A| R2\nR2 |B| --- |A| R3', [['R1.B', 'R2.A'], ['R2.B', 'R3.A']]],
    ['branch', 'R1 |B| --- |A| R2\nR1 |B| --- |A| R3', [['R1.B', 'R2.A', 'R3.A']]],
    ['cycle', 'R1 |B| --- |A| R2\nR2 |A| --- |A| R3\nR3 |A| --- |B| R1', [['R1.B', 'R2.A', 'R3.A']]],
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
    const model = parseCircuit('circuitDiagram A\nR1 |B| --- |A| R2\nR2["R2"]:::resistor\nR1["R1"]:::resistor');
    expect(topology(model)).toEqual([['R1.B', 'R2.A']]);
  });

  it.each([
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ])('reconciles named nets and rejects conflicts in statement order %j,%j,%j', (...order) => {
    const declarations = `${resistors}\nn1(["same"]):::pinInOut\nn2(["same"]):::pinInOut`;
    const links = ['R1 |B| --- |A| R2', 'R1 |B| --- n1', 'n1 ---|A| R2'];
    const model = parseCircuit(`${declarations}\n${order.map((i) => links[i]).join('\n')}`);
    expect(topology(model)).toEqual([['R1.B', 'R2.A']]);
    expect(model.connections).toHaveLength(2);
    expect(model.connections.every(({ net }) => net === 'n1')).toBe(true);
    expect(model.nets).toEqual([
      { id: 'n1', type: 'pinInOut', label: 'same' }, { id: 'n2', type: 'pinInOut', label: 'same' },
    ]);
    links[2] = 'n2 ---|A| R2';
    const conflict = `${declarations}\n${order.map((i) => links[i]).join('\n')}`;
    expect(() => parseCircuit(conflict)).toThrow(/Line 9:.*(?:conflicts|already connected)/u);
  });

  it('reconciles a named net across joined groups and subsequent connections', () => {
    const model = parseCircuit(`${resistors}\nR4["R4"]:::resistor\nn1(["n1"]):::pinInOut
R3 |A| --- |A| R4
R4 |A| --- n1
R1 |B| --- |A| R2
R2 |A| --- |A| R3
R4 |A| --- |B| R1`);
    expect(topology(model)).toEqual([['R1.B', 'R2.A', 'R3.A', 'R4.A']]);
    expect(model.connections.every(({ net }) => net === 'n1')).toBe(true);
    expect(model.nets).toEqual([{ id: 'n1', type: 'pinInOut', label: 'n1' }]);
  });

  it('connects digital devices across stages without changing membership', () => {
    const model = parseCircuit(`circuitDiagram D
subgraph stage first
  U1["U1"]:::inverter
end
subgraph stage second
  U2["U2"]:::buffer
end
U1 |O| --- |I| U2`);
    expect(topology(model)).toEqual([['U1.O', 'U2.I']]);
    expect(model.nets).toHaveLength(1);
    expect(model.devices.map(({ stage }) => stage)).toEqual([0, 1]);
    expect(model.stages.map(({ devices }) => devices)).toEqual([['U1'], ['U2']]);
    expect(model.mode).toBe('D');
  });

  it.each([
    ['Missing |B| --- |A| R2', 'undeclared'], ['R1 |B| --- |A| Missing', 'undeclared'],
    ['R1 |X| --- |A| R2', 'Unknown terminal'], ['R1 |B| --- |X| R2', 'Unknown terminal'],
    ['n1 |B| --- |A| R2', 'two distinct devices'], ['R1 |B| --- |A| n1', 'two distinct devices'],
    ['n1 |B| --- |A| n2', 'two distinct devices'], ['R1 |B| --- |A| R1', 'two distinct devices'],
    ['R1 ---|:A| R2', 'Unsupported'], ['R1 ---|B:| R2', 'Unsupported'],
    ['R1 ---|B:A:B| R2', 'Unsupported'], ['R1 ---|B,A| R2', 'Unsupported'],
    ['R1 ---|B/A| R2', 'Unsupported'], ['R1 --- R2', 'terminal label'],
    ['R1 |B| --- |A| R2 |B|', 'exactly one terminal label'],
    ['L:R1 |B| --- |A| R2', 'Unsupported'], ['R1 |B| --- |A| R:R2', 'Unsupported'],
  ])('rejects direct shorthand %s', (link, message) => {
    expect(() => parseCircuit(`${resistors}\nn1(["n1"]):::pinInOut\nn2(["n2"]):::pinInOut\n${link}`))
      .toThrow(new RegExp(`Line 7: .*${message}`, 'u'));
  });

  it('clears a failed normalization and isolates recovered implicit nets', () => {
    const db = new ScaffoldDb(), other = new ScaffoldDb(), parser = createParser(db);
    parser.parse(`${resistors}\nR1 |B| --- |A| R2`);
    const previous = db.getModel();
    createParser(other).parse(digital);
    expect(() => parser.parse(`${resistors}\nn1(["n1"]):::pinInOut\nn2(["n2"]):::pinInOut\nR1 |B| --- n1\nR2 |A| --- n2\nR1 |B| --- |A| R2`))
      .toThrow('conflicts');
    expect(() => db.getModel()).toThrow('parsed successfully');
    expect(topology(previous)).toEqual([['R1.B', 'R2.A']]);
    parser.parse(`${resistors}\nR2 |B| --- |A| R3`);
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
      { name: 'first', implicit: false, order: 0, mode: 'D', direction: 'TB', explicitDirection: true, block: 0, devices: ['U1'] },
      { name: 'second', implicit: false, order: 1, mode: 'D', direction: 'LR', block: 0, devices: ['U2'] },
      { name: 'third', implicit: false, order: 2, mode: 'D', direction: 'LR', explicitDirection: true, block: null, devices: ['U3'] },
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
      NMOS0: { G: 'A', D: 'OUT', S: '@implicit:NMOS0:S' }, NMOS1: { G: 'B', D: '@implicit:NMOS0:S', S: 'VSS' },
    });
    for (const device of model.devices) expect(device.bulk).toEqual({ kind: 'implicit', sourceTerminal: 'S' });
  });

  it.each(['pmosBlk', 'nmosBlk', 'analogNFetBulk', 'analogPFetBulk', 'analogBiasedFetBulk'])('retains explicit bulk on %s without inventing nets', (type) => {
    const model = parseCircuit(`circuitDiagram A\nM["M"]:::${type}\nN(["N"]):::pinInOut\nM |B| --- N`);
    expect(model.devices[0]!.bulk).toEqual({ kind: 'explicit', terminal: 'B' });
    expect(model.connections).toEqual([{ device: 'M', terminal: 'B', net: 'N' }]);
    expect(model.nets).toHaveLength(1);
  });

  it.each([
    ['', 'Line 1'], ['circuitDiagram', 'Line 1'], ['circuitDiagram X', 'Line 1'], ['flowchart D', 'Line 1'],
    ['circuitDiagram D extra', 'Line 1'], ['circuitDiagram D\nU["U"]:::ic', 'not eligible'],
    ['circuitDiagram D\nU["U"]:::tgate', 'Unknown authorable'], ['circuitDiagram A\nU["U"]:::jfet', 'Unknown authorable'],
    ['circuitDiagram D\nM["M"]:::pmos', 'not eligible'], ['circuitDiagram A\nU["U"]:::inverter', 'not eligible'],
    [`${digital}\nU1["again"]:::buffer`, 'Duplicate'], [`${digital}\nU1(["again"]):::pinInOut`, 'Duplicate'],
    [`${digital}\nA ---|I| Missing`, 'undeclared'], [`${digital}\nMissing ---|I| U1`, 'Declare endpoint'],
    [`${digital}\nA ---|G| U1`, 'Unknown terminal'], [`${electrical}\nM |B| --- N`, 'Unknown terminal'],
    [`${digital}\nA ---|I| Y`, 'terminal label'], [`${digital}\nU2["U2"]:::buffer\nU1 |I| --- U2`, 'terminal label'],
    [`${digital}\nA ---|I| U1\nY ---|I| U1`, 'already connected'],
    [`${digital}\nA --> U1`, 'Unsupported'], [`${digital}\nA ---|I| L:U1`, 'Unsupported'],
    [`${digital}\nR:U1 |O| --- Y`, 'Unsupported'], ['circuitDiagram D\nU1(("U1")):::buffer', 'brackets'],
    ['circuitDiagram D\nN["N"]:::net', 'Unknown authorable'], ['circuitDiagram D\nU1["bad]:::buffer', 'Malformed'],
    ['circuitDiagram D\nsubgraph old', 'Unsupported'], ['circuitDiagram D\nend', 'Unexpected end'],
    ['circuitDiagram D\nsubgraph stage unfinished', 'Line 2'],
    ['circuitDiagram D\nsubgraph stage first\nsubgraph stage second', 'Stages cannot'],
    ['circuitDiagram D\nsubgraph stage first\nsubgraph block nested', 'Blocks may only'],
    ['circuitDiagram D\nsubgraph block first\nsubgraph block nested', 'Blocks may only'],
    ['circuitDiagram D\nsubgraph stage first\nN(["N"]):::pinInOut\nend', 'outside subgraphs'],
    ['circuitDiagram D\nsubgraph block first\nN(["N"]):::pinInOut\nend', 'outside subgraphs'],
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
