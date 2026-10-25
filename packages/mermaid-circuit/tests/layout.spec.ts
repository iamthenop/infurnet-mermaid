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

  it('uses the approved fixed IC body and one centered terminal per side', () => {
    const layout = floorplan(fixture('wireless-solenoid'));
    const remote = layout.devices.find((item) => item.device.id === 'remote')!;
    expect(remote.pane.maxX - remote.pane.minX).toBe(180);
    expect(remote.pane.maxY - remote.pane.minY).toBe(180);
    const center = remote.placed.anchors.center;
    expect(remote.placed.anchors['v+']).toEqual([center[0], center[1] - 90]);
    expect(remote.placed.anchors.ctl).toEqual([center[0] - 90, center[1]]);
    expect(remote.placed.anchors['v-']).toEqual([center[0], center[1] + 90]);
    expect(remote.placed.anchors.no).toEqual([center[0] + 90, center[1]]);
    const diode = layout.devices.find((item) => item.device.id === 'Diode')!;
    expect(diode.placed.anchors.K[1]).toBeLessThan(diode.placed.anchors.A[1]);
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
