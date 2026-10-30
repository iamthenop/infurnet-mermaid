export type Direction = 'LR' | 'TB';
export type CircuitMode = 'D' | 'A';

export const deviceTypes = ['pmos', 'nmos', 'pmosBlk', 'nmosBlk', 'resistor', 'capacitor',
  'diode', 'voltageSource', 'currentSource', 'inverter', 'buffer', 'motor', 'solenoid', 'fuse', 'nand', 'ic', 'antenna',
  'and', 'or', 'nor', 'xor', 'xnor', 'notNot', 'schmitt', 'schmittNot', 'schmittAnd', 'schmittNand',
  'resistorIEC', 'resistorVar', 'resistorVarIEC', 'thermistor', 'photoresistor', 'photoresistorIEC', 'fuseIEC', 'fuseUs',
  'capacitor2', 'capacitorPolar', 'capacitor2Polar', 'capacitorVar', 'capacitorTrim', 'lamp', 'lamp2', 'breaker', 'diac',
  'diodeFilled', 'schottky', 'diodeTunnel', 'diodeShockley', 'zener', 'diodeTVS', 'varactor', 'led', 'led2', 'photodiode',
  'nmosDiode', 'pmosDiode', 'nmosCircle', 'pmosCircle', 'nmos2Diode', 'pmos2Diode', 'nmos2Circle', 'pmos2Circle',
  'analogNFet', 'analogPFet', 'analogNFetBulk', 'analogPFetBulk', 'analogNFetCenteredGate', 'analogPFetCenteredGate',
  'analogPFetNoArrow', 'analogBiasedFet', 'analogBiasedFetBulk', 'analogBiasedFetCenteredGate', 'analogBiasedFetNoArrow',
  'nfet2', 'pfet2', 'mux', 'demux'] as const;
export const netTypes = ['net', 'supplyNet', 'ground', 'pinIn', 'pinOut', 'pinInOut'] as const;
export type DeviceType = typeof deviceTypes[number];
export const mosfetTypes: readonly DeviceType[] = ['pmos', 'nmos', 'pmosBlk', 'nmosBlk',
  'nmosDiode', 'pmosDiode', 'nmosCircle', 'pmosCircle', 'nmos2Diode', 'pmos2Diode', 'nmos2Circle', 'pmos2Circle',
  'analogNFet', 'analogPFet', 'analogNFetBulk', 'analogPFetBulk', 'analogNFetCenteredGate', 'analogPFetCenteredGate',
  'analogPFetNoArrow', 'analogBiasedFet', 'analogBiasedFetBulk', 'analogBiasedFetCenteredGate', 'analogBiasedFetNoArrow',
  'nfet2', 'pfet2'];

export function mosfetChannel(type: DeviceType): 'P' | 'N' | undefined {
  if (['pmos', 'pmosBlk', 'pmosDiode', 'pmosCircle', 'pmos2Diode', 'pmos2Circle',
    'analogPFet', 'analogPFetBulk', 'analogPFetCenteredGate', 'analogPFetNoArrow', 'pfet2'].includes(type)) return 'P';
  if (['nmos', 'nmosBlk', 'nmosDiode', 'nmosCircle', 'nmos2Diode', 'nmos2Circle',
    'analogNFet', 'analogNFetBulk', 'analogNFetCenteredGate', 'nfet2'].includes(type)) return 'N';
  return undefined;
}

export type NetType = typeof netTypes[number];
export type PinSide = 'T' | 'B' | 'L' | 'R';

export interface Device {
  readonly id: string;
  readonly type: DeviceType;
  readonly label: string;
  readonly terminals: readonly string[];
  readonly stage: number;
  readonly size?: 2 | 4;
  readonly pinSides?: Readonly<Record<string, PinSide>>;
  readonly bulk?: { readonly kind: 'implicit'; readonly sourceTerminal: 'S' }
    | { readonly kind: 'explicit'; readonly terminal: 'B' };
}

export interface Net {
  readonly id: string;
  readonly type: NetType;
  readonly label: string;
  readonly implicit?: true;
}

export interface Connection {
  readonly device: string;
  readonly terminal: string;
  readonly net: string;
}

export interface Stage {
  readonly name: string | null;
  readonly implicit: boolean;
  readonly order: number;
  readonly direction: Direction;
  readonly explicitDirection?: true;
  readonly mode: CircuitMode;
  readonly block: number | null;
  readonly devices: readonly string[];
}

export interface Block {
  readonly name: string;
  readonly mode: CircuitMode;
  readonly stages: readonly number[];
}

export interface CircuitModel {
  readonly mode: CircuitMode;
  readonly devices: readonly Device[];
  readonly nets: readonly Net[];
  readonly connections: readonly Connection[];
  readonly stages: readonly Stage[];
  readonly blocks: readonly Block[];
}
