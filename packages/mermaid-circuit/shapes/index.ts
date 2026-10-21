// SVG symbol index and terminal mappings.
// Coordinates are in each shape's own viewBox. Shapes with no terminals
// attach to their net at `anchor`.

export type Point = readonly [x: number, y: number];

export interface ShapeEntry {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly terminals: Readonly<Record<string, Point>>;
  readonly anchor?: Point;
}

export const shapes = {
  pmos: { file: 'pmos.svg', width: 120, height: 120, terminals: { G: [0, 60], S: [90, 0], D: [90, 120] } },
  nmos: { file: 'nmos.svg', width: 120, height: 120, terminals: { G: [0, 60], D: [90, 0], S: [90, 120] } },
  pmosBlk: { file: 'pmos4.svg', width: 120, height: 120, terminals: { G: [0, 60], S: [90, 0], D: [90, 120], B: [120, 60] } },
  nmosBlk: { file: 'nmos4.svg', width: 120, height: 120, terminals: { G: [0, 60], D: [90, 0], S: [90, 120], B: [120, 60] } },
  resistor: { file: 'resistor.svg', width: 120, height: 120, terminals: { A: [0, 60], B: [120, 60] } },
  capacitor: { file: 'capacitor.svg', width: 120, height: 120, terminals: { A: [0, 60], B: [120, 60] } },
  diode: { file: 'diode.svg', width: 120, height: 120, terminals: { A: [0, 60], K: [120, 60] } },
  voltageSource: { file: 'vsource.svg', width: 120, height: 120, terminals: { P: [60, 0], N: [60, 120] } },
  currentSource: { file: 'isource.svg', width: 120, height: 120, terminals: { P: [60, 0], N: [60, 120] } },
  inverter: { file: 'inverter.svg', width: 120, height: 120, terminals: { I: [0, 60], O: [120, 60] } },
  buffer: { file: 'buffer.svg', width: 120, height: 120, terminals: { I: [0, 60], O: [120, 60] } },
  supplyNet: { file: 'vdd.svg', width: 120, height: 120, terminals: {}, anchor: [60, 120] },
  ground: { file: 'ground.svg', width: 120, height: 120, terminals: {}, anchor: [60, 0] },
  pinIn: { file: 'pin-in.svg', width: 240, height: 120, terminals: {}, anchor: [240, 60] },
  pinOut: { file: 'pin-out.svg', width: 240, height: 120, terminals: {}, anchor: [0, 60] },
  pinInOut: { file: 'pin-io.svg', width: 240, height: 120, terminals: {}, anchor: [0, 60] },
} as const satisfies Record<string, ShapeEntry>;

export type ShapeType = keyof typeof shapes;
