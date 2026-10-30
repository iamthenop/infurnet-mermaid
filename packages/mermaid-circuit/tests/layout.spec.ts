/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { floorplan, validateOrientation, icGeometry } from '../src/drawing/layout.js';
import { mosfetTypes } from '../src/circuitTypes.js';
import catalog from '../shapes/shapes.json' with { type: 'json' };

const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
const fixture = (name: string) => parseCircuit(fixtures[`../examples/fixtures/${name}.mmd`]);

describe('basic floorplanning', () => {
  it('preserves the op-amp orientation and five registered attachment positions', () => {
    const model = fixture('opamp-open-loop'), layout = floorplan(model);
    const placed = layout.devices[0];
    expect(placed.rotation).toBe(0);
    expect(placed.flip).toBe(false);
    const terminals = { in1: [0, 40], in2: [0, 80], out: [120, 60], vd: [60, 0], vs: [60, 120] } as const;
    const sides = { in1: 'L', in2: 'L', out: 'R', vd: 'T', vs: 'B' };
    for (const terminal of Object.keys(terminals) as (keyof typeof terminals)[]) {
      expect(placed.placed.anchors[terminal]).toEqual(placed.placed.transform.apply(terminals[terminal]));
      expect(layout.attachments.find((item) => item.terminal === terminal)).toMatchObject({
        device: 'U1', point: placed.placed.anchors[terminal], side: sides[terminal], rotation: 0,
      });
    }
    expect(layout.attachments.map(({ device, terminal, net }) => ({ device, terminal, net }))).toEqual(model.connections);
  });

  it('does not classify op-amp signal or supply connections as conduction pairs', () => {
    const declaration = 'circuitDiagram A\nU1[U1]:::opamp\nU2[U2]:::opamp';
    const baseline = floorplan(parseCircuit(declaration)).devices.map((item) => item.placed.anchors);
    for (const links of ['U1 |out| --- |in1| U2', 'U1 |vd| --- |vd| U2\nU1 |vs| --- |vs| U2',
      'U1 |in1| --- |in1| U2\nU1 |out| --- |out| U2']) {
      const layout = floorplan(parseCircuit(`${declaration}\n${links}`));
      expect(layout.devices.map((item) => item.placed.anchors)).toEqual(baseline);
      expect(layout.devices.every((item) => item.rotation === 0)).toBe(true);
    }
  });

  it('derives parallel and series placement from conduction terminals', () => {
    const source = fixtures['../examples/fixtures/cmos-nand2.mmd'];
    const layout = floorplan(parseCircuit(source.replace('N0["N0"]:::nmos\n    N1["N1"]:::nmos', 'N1["N1"]:::nmos\n    N0["N0"]:::nmos')));
    const at = (id: string) => layout.devices.find((item) => item.device.id === id)!;
    expect(at('P0').pane.maxX).toBeLessThan(at('P1').pane.minX);
    expect(at('N0').pane.maxY).toBeLessThan(at('N1').pane.minY);
    expect(at('N0').placed.anchors.S[0]).toBe(at('N1').placed.anchors.D[0]);
    expect(at('N0').placed.anchors.D[0]).toBe((at('P0').placed.anchors.D[0] + at('P1').placed.anchors.D[0]) / 2);
    expect(layout.frames.filter((frame) => frame.kind === 'stage').map((frame) => frame.name)).toEqual(['pullUp', 'pullDown']);
  });

  it('does not infer parallel membership from only a shared input net', () => {
    const model = parseCircuit('circuitDiagram A\nV{{"V"}}:::supplyNet\nP0[P0]:::pmos\nP1[P1]:::pmos\nV --- P0 |S|\nV --- P1 |S|');
    const layout = floorplan(model);
    expect(layout.devices[0].pane.minX).toBeLessThan(layout.devices[1].pane.minX);
    expect(layout.devices[0].pane.minY).toBeLessThan(layout.devices[1].pane.minY);
    expect(layout.attachments).toHaveLength(2);
  });

  it.each(['resistorIEC', 'resistorVar', 'resistorVarIEC', 'thermistor', 'photoresistor', 'photoresistorIEC', 'fuseIEC', 'fuseUs',
    'capacitor2', 'capacitorPolar', 'capacitor2Polar', 'capacitorVar', 'capacitorTrim', 'lamp', 'lamp2', 'breaker', 'diac'])
  ('uses existing series and parallel placement for %s with default and explicit directions', (type) => {
    for (const parallel of [false, true]) for (const direction of ['', 'LR', 'TB']) {
      const links = parallel ? 'R1 |A| --- |A| R2\nR1 |B| --- |B| R2' : 'R1 |B| --- |A| R2';
      const source = `circuitDiagram A\nsubgraph stage pair\n${direction ? `direction ${direction}\n` : ''}R1[R1]:::resistor\nR2[R2]:::resistor\nend\n${links}`;
      const baseline = floorplan(parseCircuit(source));
      const model = parseCircuit(source.replaceAll(':::resistor', `:::${type}`)), layout = floorplan(model);
      expect(layout.devices.map((item) => item.placed.anchors)).toEqual(baseline.devices.map((item) => item.placed.anchors));
      const axis = parallel ? direction === 'TB' ? 1 : 0 : direction === 'LR' ? 0 : 1;
      const [first, second] = layout.devices.map((item) => item.placed.anchors.center);
      expect(first[axis]).toBeLessThan(second[axis]);
      expect(first[1 - axis]).toBe(second[1 - axis]);
      expect(layout.attachments.map(({ device, terminal, net }) => ({ device, terminal, net }))).toEqual(model.connections);
    }
    const partial = floorplan(parseCircuit(`circuitDiagram A\nR1[R1]:::${type}\nR2[R2]:::${type}\nR1 |A| --- |A| R2`));
    const [first, second] = partial.devices.map((item) => item.placed.anchors.center);
    expect(first[0]).toBeLessThan(second[0]);
    expect(first[1]).toBeLessThan(second[1]);
  });

  it.each(['fuse', 'fuseIEC', 'fuseUs'])('applies the positive-source fuse orientation to %s while respecting explicit stage directions', (type) => {
    const source = fixtures['../examples/fixtures/wireless-solenoid.mmd'].replace(':::fuse', `:::${type}`);
    for (const direction of ['', 'LR', 'TB']) {
      const directed = source.replace('subgraph stage protection\n', `subgraph stage protection\n${direction ? `direction ${direction}\n` : ''}`);
      const fuse = floorplan(parseCircuit(directed)).devices.find((item) => item.device.id === 'Fuse')!;
      expect(fuse.rotation).toBe(direction === 'TB' ? 90 : 0);
      const axis = direction === 'TB' ? 1 : 0;
      expect(fuse.placed.anchors.A[axis]).toBeLessThan(fuse.placed.anchors.B[axis]);
      expect(fuse.placed.anchors.A[1 - axis]).toBeCloseTo(fuse.placed.anchors.B[1 - axis], 10);
    }
    const negative = floorplan(parseCircuit(source.replace('Source |P| --- |A| Fuse', 'Source |N| --- |A| Fuse')));
    expect(negative.devices.find((item) => item.device.id === 'Fuse')!.rotation).toBe(90);
  });

  it.each(['diode', 'diodeFilled', 'schottky', 'diodeTunnel', 'diodeShockley', 'zener', 'diodeTVS', 'varactor', 'led', 'led2', 'photodiode'])
  ('preserves %s polarity in series and parallel layouts with default and explicit directions', (type) => {
    for (const parallel of [false, true]) for (const direction of ['', 'LR', 'TB']) {
      const links = parallel ? 'D1 |K| --- |K| D2\nD1 |A| --- |A| D2' : 'D1 |A| --- |K| D2';
      const source = `circuitDiagram A\nsubgraph stage pair\n${direction ? `direction ${direction}\n` : ''}D1[D1]:::diode\nD2[D2]:::diode\nend\n${links}`;
      const baseline = floorplan(parseCircuit(source));
      const model = parseCircuit(source.replaceAll(':::diode', `:::${type}`)), layout = floorplan(model);
      expect(layout.devices.map((item) => item.placed.anchors)).toEqual(baseline.devices.map((item) => item.placed.anchors));
      const horizontal = parallel ? direction === 'TB' : direction === 'LR';
      for (const item of layout.devices) {
        expect(item.rotation).toBe(horizontal ? 180 : 270);
        expect(item.placed.anchors.K[horizontal ? 0 : 1]).toBeLessThan(item.placed.anchors.A[horizontal ? 0 : 1]);
        expect(item.placed.anchors.A).toEqual(item.placed.transform.apply([0, 60]));
        expect(item.placed.anchors.K).toEqual(item.placed.transform.apply([120, 60]));
      }
      const axis = parallel ? horizontal ? 1 : 0 : horizontal ? 0 : 1;
      const [first, second] = layout.devices.map((item) => item.placed.anchors.center);
      expect(first[axis]).toBeLessThan(second[axis]);
      expect(first[1 - axis]).toBeCloseTo(second[1 - axis], 10);
      expect(layout.attachments.map(({ device, terminal, net }) => ({ device, terminal, net }))).toEqual(model.connections);
    }
  });

  it.each(mosfetTypes)('places %s from both conduction nets and preserves registered attachments', (type) => {
    const pChannel = ['pmos', 'pmosBlk', 'pmosDiode', 'pmosCircle', 'pmos2Diode', 'pmos2Circle',
      'analogPFet', 'analogPFetBulk', 'analogPFetCenteredGate', 'analogPFetNoArrow', 'pfet2'].includes(type);
    const [incoming, outgoing] = pChannel ? ['S', 'D'] : ['D', 'S'];
    const declarations = `M1[M1]:::${type}\nM2[M2]:::${type}`;
    for (const parallel of [false, true]) for (const direction of ['', 'LR', 'TB']) {
      const links = parallel ? 'M1 |D| --- |D| M2\nV{{V}}:::supplyNet\nV --- M1 |S|\nV --- M2 |S|'
        : pChannel ? 'M1 |D| --- |S| M2' : 'M2 |D| --- |S| M1';
      const model = parseCircuit(`circuitDiagram A\nsubgraph stage pair\n${direction ? `direction ${direction}\n` : ''}${declarations}\nend\n${links}`);
      const layout = floorplan(model);
      const horizontal = parallel ? direction === 'TB' : direction === 'LR';
      const axis = horizontal ? 0 : 1;
      const [first, second] = layout.devices.map((item) => item.placed.anchors[incoming]);
      expect(first[parallel ? 1 - axis : axis]).toBeLessThan(second[parallel ? 1 - axis : axis]);
      expect(second[parallel ? axis : 1 - axis] - first[parallel ? axis : 1 - axis]).toBeCloseTo(parallel ? 90 : 0, 8);
      for (const item of layout.devices) {
        expect(item.placed.anchors[incoming][axis]).toBeLessThan(item.placed.anchors[outgoing][axis]);
        for (const [terminal, point] of Object.entries(catalog[type as keyof typeof catalog].terminals)) {
          expect(item.placed.anchors[terminal]).toEqual(item.placed.transform.apply(point as [number, number]));
        }
      }
      expect(layout.attachments.map(({ device, terminal, net }) => ({ device, terminal, net }))).toEqual(model.connections);
    }
    for (const shared of ['G', 'D', 'S']) {
      const partial = floorplan(parseCircuit(`circuitDiagram A\n${declarations}\nX([X]):::pinInOut\nX --- M1 |${shared}|\nX --- M2 |${shared}|`));
      const [first, second] = partial.devices.map((item) => item.placed.anchors[incoming]);
      expect(second[0] - first[0]).toBeCloseTo(300, 8);
      expect(second[1] - first[1]).toBeCloseTo(90, 8);
    }
  });

  it.each(['mux', 'demux'].flatMap((type) => [2, 4].map((size) => ({ type, size }))))
  ('draws the $type size=$size trapezoid with fixed, ordered attachments', ({ type, size }) => {
    for (const direction of ['LR', 'TB']) {
      const model = parseCircuit(`circuitDiagram D\nsubgraph stage selection\ndirection ${direction}\nU["U<br/>size=${size}"]:::${type}\nend`);
      const item = floorplan(model).devices[0], geometry = icGeometry(item.device);
      const width = size === 2 ? 180 : 240, height = size === 2 ? 240 : 360;
      expect([geometry.width, geometry.height]).toEqual([width, height]);
      const leftInset = type === 'demux' ? 60 : 0, rightInset = type === 'mux' ? 60 : 0;
      expect(item.placed.primitives[0]).toMatchObject({ kind: 'polyline', points: [
        [30, 30 + leftInset], [width - 30, 30 + rightInset], [width - 30, height - 30 - rightInset],
        [30, height - 30 - leftInset], [30, 30 + leftInset],
      ] });
      expect(item.placed.primitives.every((primitive) => ['line', 'polyline'].includes(primitive.kind))).toBe(true);
      expect(item.placed.primitives).toHaveLength(item.device.terminals.length + 1);
      expect(item.rotation).toBe(direction === 'TB' ? 90 : 0);
      const data = Array.from({ length: size }, (_, index) => `${type === 'mux' ? 'I' : 'O'}${index}`);
      data.forEach((name, index) => expect(geometry.anchors[name]).toEqual([type === 'mux' ? 0 : width, 90 + 60 * index]));
      expect(geometry.anchors[type === 'mux' ? 'O' : 'I']).toEqual([type === 'mux' ? width : 0, height / 2]);
      expect(geometry.anchors.S0).toEqual([90, height]);
      if (size === 4) expect(geometry.anchors.S1).toEqual([150, height]);
      for (const [index, terminal] of item.device.terminals.entries()) {
        const anchor = geometry.anchors[terminal];
        expect(item.placed.anchors[terminal]).toEqual(item.placed.transform.apply(anchor));
        const lead = item.placed.primitives[index + 1];
        expect(lead).toMatchObject({ kind: 'line', start: anchor });
        if (lead.kind === 'line' && terminal.startsWith('S')) {
          expect(lead.end).toEqual([anchor[0], height - 30 - leftInset + (leftInset - rightInset) * (anchor[0] - 30) / (width - 60)]);
          expect(anchor[1] - lead.end[1]).toBeGreaterThanOrEqual(30);
        }
      }
      expect(floorplan(model).attachments).toEqual([]);
    }
  });

  it.each([2, 4])('uses every size=%s DEMUX output for dependency levels and avoids overlapping larger bodies', (size) => {
    for (const direction of ['LR', 'TB']) {
      const source = `circuitDiagram D\nsubgraph stage data\ndirection ${direction}\n${Array.from({ length: size }, (_, i) => `B${i}[B${i}]:::buffer`).join('\n')}\nD["D<br/>size=${size}"]:::demux\nend\n${Array.from({ length: size }, (_, i) => `D |O${i}| --- |I| B${i}`).join('\n')}`;
      const layout = floorplan(parseCircuit(source)), demux = layout.devices.find((item) => item.device.id === 'D')!;
      const axis = direction === 'TB' ? 1 : 0;
      for (const buffer of layout.devices.filter((item) => item !== demux)) {
        expect(buffer.placed.anchors.center[axis]).toBeGreaterThan(demux.placed.anchors.center[axis]);
      }
      const peers = floorplan(parseCircuit(`circuitDiagram D\nsubgraph stage data\ndirection ${direction}\nD1["D1<br/>size=${size}"]:::demux\nD2["D2<br/>size=${size}"]:::demux\nend`)).devices;
      expect(direction === 'TB' ? peers[0].pane.maxX < peers[1].pane.minX : peers[0].pane.maxY < peers[1].pane.minY).toBe(true);
    }
    const outputsOnly = floorplan(parseCircuit(`circuitDiagram D\nD["D<br/>size=${size}"]:::demux\nM["M<br/>size=2"]:::mux\nD |O0| --- |O| M`));
    expect(outputsOnly.devices[0].placed.anchors.center[0]).toBe(outputsOnly.devices[1].placed.anchors.center[0]);
  });

  it('preserves explicit TB parallel and LR series stage directions', () => {
    const source = fixtures['../examples/fixtures/cmos-nand2.mmd'].replace('direction LR', 'direction TB').replace('stage pullDown\n    direction TB', 'stage pullDown\n    direction LR');
    const layout = floorplan(parseCircuit(source));
    const at = (id: string) => layout.devices.find((item) => item.device.id === id)!;
    expect(at('P0').pane.maxY).toBeLessThan(at('P1').pane.minY);
    expect(at('N0').pane.maxX).toBeLessThan(at('N1').pane.minX);
    expect(at('N0').placed.anchors.S[1]).toBeCloseTo(at('N1').placed.anchors.D[1]);
  });

  it('places four NAND gates in three dependency columns', () => {
    const layout = floorplan(fixture('xor-nand4'));
    const center = (id: string) => layout.devices.find((item) => item.device.id === id)!.placed.anchors.center;
    expect(center('N1')[0]).toBeLessThan(center('N2')[0]);
    expect(center('N2')[0]).toBe(center('N3')[0]);
    expect(center('N3')[0]).toBeLessThan(center('N4')[0]);
    expect(center('N2')[1]).toBeLessThan(center('N3')[1]);
    expect(center('N1')[1]).toBe((center('N2')[1] + center('N3')[1]) / 2);
    expect(center('N4')[1]).toBe(center('N1')[1]);
    const upper = layout.devices.find((item) => item.device.id === 'N2')!.placed.anchors;
    const lower = layout.devices.find((item) => item.device.id === 'N3')!.placed.anchors;
    expect(upper.I1[1]).toBeLessThan(upper.I2[1]);
    expect(lower.I1[1]).toBeGreaterThan(lower.I2[1]);
    expect(lower.O[1]).toBe(lower.center[1]);
  });

  it.each(['logic-variants', 'schmitt-variants'].flatMap((name) => ['LR', 'TB'].map((direction) => ({ name, direction }))))
  ('places connected $name by dependency in $direction regardless of declaration order', ({ name, direction }) => {
    const source = fixtures[`../examples/fixtures/${name}.mmd`].replace('direction LR', `direction ${direction}`);
    const declarations = source.match(/^    U\d+.*$/gmu)!;
    const reordered = source.replace(declarations.join('\n'), [...declarations].reverse().join('\n'));
    const model = parseCircuit(reordered), layout = floorplan(model);
    const axis = direction === 'LR' ? 0 : 1;
    const at = (id: string) => layout.devices.find((item) => item.device.id === id)!;
    for (let index = 1; index <= declarations.length; index++) {
      const item = at(`U${index}`);
      expect(item.rotation).toBe(direction === 'LR' ? 0 : 90);
      expect(item.flip).toBe(false);
      for (const terminal of item.device.terminals.filter((terminal) => terminal !== 'O')) {
        expect(item.placed.anchors[terminal][axis]).toBeLessThan(item.placed.anchors.O[axis]);
      }
    }
    expect(at('U1').placed.anchors.center[axis]).toBe(at('U2').placed.anchors.center[axis]);
    expect(at('U1').placed.anchors.center[1 - axis]).toBeGreaterThan(at('U2').placed.anchors.center[1 - axis]);
    for (const output of model.connections.filter((item) => item.terminal === 'O')) {
      for (const input of model.connections.filter((item) => item.net === output.net && item.terminal !== 'O')) {
        expect(at(output.device).placed.anchors.center[axis]).toBeLessThan(at(input.device).placed.anchors.center[axis]);
      }
    }
    expect(layout.attachments.map(({ device, terminal, net }) => ({ device, terminal, net })))
      .toEqual(model.connections);
  });

  it('preserves blocks and centers the input-inverter block beside the XOR core', () => {
    const model = fixture('cmos-xor12'), layout = floorplan(model);
    const blocks = layout.frames.filter((frame) => frame.kind === 'block');
    expect(blocks.map((frame) => frame.name)).toEqual(['inputInverters', 'xorCore']);
    expect(blocks[0].bounds.maxX).toBeLessThan(blocks[1].bounds.minX);
    expect(blocks[0].bounds.minY + blocks[0].bounds.maxY).toBe(blocks[1].bounds.minY + blocks[1].bounds.maxY);
    expect(layout.devices.map((item) => item.device)).toEqual(model.devices);
    const high = layout.stageBounds[4], low = layout.stageBounds[5];
    expect(high.maxX).toBeLessThan(low.minX);
    expect(high.minY).toBe(low.minY);
    expect(high.maxY).toBe(low.maxY);
    expect(layout.parallelStages).toEqual([{ stages: [4, 5], nets: ['OUT', 'VSS'] }]);
  });

  it('expands the IC body for multiple pins and preserves parallel load alignment', () => {
    const layout = floorplan(fixture('wireless-solenoid'));
    const fuse = layout.devices.find((item) => item.device.type === 'fuse')!;
    expect(fuse.placed.anchors.A[1]).toBe(fuse.placed.anchors.B[1]);
    expect(fuse.placed.anchors.A[0]).toBeLessThan(fuse.placed.anchors.B[0]);
    const remote = layout.devices.find((item) => item.device.id === 'Remote')!;
    expect(remote.pane.maxX - remote.pane.minX).toBe(180);
    expect(remote.pane.maxY - remote.pane.minY).toBe(240);
    const center = remote.placed.anchors.center;
    expect(remote.placed.anchors['v+']).toEqual([center[0], center[1] - 120]);
    expect(remote.placed.anchors.ctl).toEqual([center[0] - 90, center[1] - 30]);
    expect(remote.placed.anchors['v-']).toEqual([center[0], center[1] + 120]);
    expect(remote.placed.anchors.no).toEqual([center[0] + 90, center[1]]);
    expect(remote.placed.anchors.A).toEqual([center[0] - 90, center[1] + 30]);
    const diode = layout.devices.find((item) => item.device.id === 'Diode')!;
    expect(diode.placed.anchors.K[1]).toBeLessThan(diode.placed.anchors.A[1]);
    const load = layout.devices.find((item) => item.device.id === 'Solenoid')!;
    expect(load.placed.anchors.A[1]).toBeCloseTo(diode.placed.anchors.K[1]);
    expect(load.placed.anchors.B[1]).toBeCloseTo(diode.placed.anchors.A[1]);
    expect(load.placed.anchors.A[1]).toBeGreaterThan(remote.placed.anchors.no[1]);
  });

  it('retains the fixed four-pin IC geometry when each side has one pin', () => {
    const model = parseCircuit('circuitDiagram A\nU[U]:::ic\nN([N]):::pinInOut\nN --- |top| T:U\nN --- |left| L:U\nU:B |bottom| --- N\nU:R |right| --- N');
    const ic = floorplan(model).devices[0];
    const [x, y] = ic.placed.anchors.center;
    expect(ic.pane.maxX - ic.pane.minX).toBe(180);
    expect(ic.pane.maxY - ic.pane.minY).toBe(180);
    expect(ic.placed.anchors).toMatchObject({ top: [x, y - 90], bottom: [x, y + 90], left: [x - 90, y], right: [x + 90, y] });
  });

  it('centers a voltage source left of its connected local circuit without changing polarity', () => {
    const source = fixtures['../examples/fixtures/wireless-solenoid.mmd'];
    const layout = floorplan(parseCircuit(source));
    const supply = layout.devices.find((item) => item.device.type === 'voltageSource')!;
    const peers = layout.devices.filter((item) => item !== supply);
    expect(supply.pane.maxX).toBeLessThan(Math.min(...peers.map((item) => item.pane.minX)));
    expect(supply.placed.anchors.center[1]).toBe((Math.min(...peers.map((item) => item.pane.minY))
      + Math.max(...peers.map((item) => item.pane.maxY))) / 2);
    expect(supply.placed.anchors.P[1]).toBeLessThan(supply.placed.anchors.N[1]);
    const disconnected = floorplan(parseCircuit(source + '\nsubgraph block separate\nsubgraph stage unused\nR[R]:::resistor\nend\nend'));
    expect(disconnected.devices.find((item) => item.device.id === supply.device.id)!.placed.anchors).toEqual(supply.placed.anchors);
  });

  it('rejects prohibited symbol orientation and permits pins only with device rotation', () => {
    for (const type of ['supplyNet', 'ground']) {
      expect(() => validateOrientation(type, 90)).toThrow('cannot rotate');
      expect(() => validateOrientation(type, 0, true)).toThrow('cannot rotate');
      expect(() => validateOrientation(type, 0, false, true)).toThrow('cannot rotate');
    }
    expect(() => validateOrientation('pinIn', 90)).toThrow('connected device');
    expect(() => validateOrientation('pinIn', 90, false, false, 90)).not.toThrow();
    expect(() => validateOrientation('nmos', 90, true, true)).not.toThrow();
  });
});
