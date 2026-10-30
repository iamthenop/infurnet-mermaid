/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { floorplan, validateOrientation } from '../src/drawing/layout.js';

const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
const fixture = (name: string) => parseCircuit(fixtures[`../examples/fixtures/${name}.mmd`]);

describe('basic floorplanning', () => {
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
