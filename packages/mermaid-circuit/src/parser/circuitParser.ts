import catalog from '../../shapes/shapes.json' with { type: 'json' };
import { deviceTypes, netTypes, type CircuitMode, type CircuitModel,
  type Connection, type Device, type DeviceType, type Direction, type Net, type NetType } from '../circuitTypes.js';

type PendingStage = { name: string | null; implicit: boolean; order: number; direction: Direction;
  mode: CircuitMode; block: number | null; devices: string[] };
type PendingBlock = { name: string; mode: CircuitMode; stages: number[] };
type Scope = { kind: 'stage' | 'block'; index: number; line: number };
type Statement = { text: string; line: number };

function fail(line: number, message: string): never {
  throw new Error(`Line ${line}: ${message}`);
}

function statement(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && quoted) { i++; continue; }
    if (line[i] === '"') quoted = !quoted;
    if (!quoted && line.slice(i, i + 2) === '%%') return line.slice(0, i).trim();
  }
  return line.trim();
}

function label(value: string, line: number): string {
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      fail(line, 'Malformed quoted label.');
    }
    fail(line, 'Expected a string label.');
  }
  if (/["\[\]{}]/u.test(value)) fail(line, 'Malformed node label.');
  return value;
}

export function parseCircuit(text: string): CircuitModel {
  const statements: Statement[] = text.split(/\r?\n/u)
    .map((text, index) => ({ text: statement(text), line: index + 1 }))
    .filter(({ text }) => text.length > 0);
  const header = statements[0];
  const mode = header?.text.match(/^circuitDiagram\s+([DA])$/u)?.[1] as CircuitMode | undefined;
  if (!mode) fail(header?.line ?? 1, 'Expected "circuitDiagram D" or "circuitDiagram A".');

  const devices: Device[] = [], nets: Net[] = [], connections: Connection[] = [];
  const stages: PendingStage[] = [], blocks: PendingBlock[] = [], scopes: Scope[] = [];
  const nodes = new Map<string, Device | Net>();
  const deviceIds = new Set<string>();
  const pending: { left: string; right: string; terminal: string; line: number }[] = [];
  const outside: number[] = [];

  for (const { text, line } of statements.slice(1)) {
    const scope = scopes.at(-1);
    const group = text.match(/^subgraph\s+(stage|block)\s+([A-Za-z0-9]+)$/u);
    if (group) {
      const kind = group[1] as 'stage' | 'block', name = group[2]!;
      if (kind === 'block') {
        if (scope) fail(line, 'Blocks may only appear at diagram level.');
        blocks.push({ name, mode, stages: [] });
        scopes.push({ kind, index: blocks.length - 1, line });
      } else {
        if (scope?.kind === 'stage') fail(line, 'Stages cannot contain subgraphs.');
        if (!/^[a-z][A-Za-z0-9]*$/u.test(name)) fail(line, 'Stage names must use camelCase.');
        const index = stages.length;
        stages.push({ name, implicit: false, order: index, direction: 'LR', mode,
          block: scope?.index ?? null, devices: [] });
        if (scope) blocks[scope.index]!.stages.push(index);
        scopes.push({ kind, index, line });
      }
      continue;
    }
    if (text === 'end') {
      if (!scopes.pop()) fail(line, 'Unexpected end without a subgraph.');
      continue;
    }
    const direction = text.match(/^direction\s+(LR|TB)$/u);
    if (direction) {
      if (scope?.kind !== 'stage') fail(line, 'Direction must be declared inside a stage.');
      stages[scope.index]!.direction = direction[1] as Direction;
      continue;
    }
    const connection = text.match(/^([A-Za-z0-9]+)\s*---\|([A-Za-z0-9]+)\|\s*([A-Za-z0-9]+)$/u);
    if (connection) {
      pending.push({ left: connection[1]!, terminal: connection[2]!, right: connection[3]!, line });
      continue;
    }
    const node = text.match(/^([A-Za-z0-9]+)\s*(.*?)\s*:::([A-Za-z0-9]+)$/u);
    if (!node) fail(line, 'Unsupported circuit statement.');
    const [, id, body, type] = node as [string, string, string, string];
    if (nodes.has(id)) fail(line, `Duplicate node identifier "${id}".`);
    const isDevice = (deviceTypes as readonly string[]).includes(type);
    const isNet = (netTypes as readonly string[]).includes(type);
    if (!isDevice && !isNet) fail(line, `Unknown authorable object type "${type}".`);
    const delimiters = isDevice ? ['[', ']'] : type === 'net' ? ['((', '))']
      : type === 'supplyNet' || type === 'ground' ? ['{{', '}}'] : ['([', '])'];
    if (!body.startsWith(delimiters[0]!) || !body.endsWith(delimiters[1]!)) {
      fail(line, `Incorrect declaration brackets for "${type}".`);
    }
    const displayLabel = label(body.slice(delimiters[0]!.length, -delimiters[1]!.length).trim(), line);
    if (type !== 'net') {
      const entry = catalog[type as Exclude<NetType, 'net'> | DeviceType];
      if (!entry.allowedModes.includes(mode)) fail(line, `Type "${type}" is not eligible in mode ${mode}.`);
    }
    if (isDevice) {
      if (scope?.kind === 'block') fail(line, 'Blocks contain stages, not direct device declarations.');
      const deviceType = type as DeviceType;
      const device: Device = { id, type: deviceType, label: displayLabel,
        terminals: Object.keys(catalog[deviceType].terminals), stage: scope?.index ?? -1,
        ...(type === 'pmos' || type === 'nmos' ? { bulk: { kind: 'implicit' as const, sourceTerminal: 'S' as const } }
          : type === 'pmosBlk' || type === 'nmosBlk' ? { bulk: { kind: 'explicit' as const, terminal: 'B' as const } } : {}) };
      if (scope) stages[scope.index]!.devices.push(id);
      else outside.push(devices.length);
      devices.push(device); nodes.set(id, device); deviceIds.add(id);
    } else {
      if (scope) fail(line, 'Nets must be declared outside subgraphs.');
      const net: Net = { id, type: type as NetType, label: displayLabel };
      nets.push(net); nodes.set(id, net);
    }
  }
  if (scopes.length) fail(scopes.at(-1)!.line, 'Unclosed subgraph.');
  if (outside.length) {
    const index = stages.length;
    const ids = outside.map((position) => {
      const device = devices[position]!;
      devices[position] = { ...device, stage: index };
      return device.id;
    });
    stages.push({ name: null, implicit: true, order: index, direction: 'LR', mode, block: null, devices: ids });
  }
  const assignments = new Map<string, string>();
  for (const { left, right, terminal, line } of pending) {
    if (!nodes.has(left) || !nodes.has(right)) fail(line, `Connection references an undeclared object: ${left}, ${right}.`);
    if (deviceIds.has(left) === deviceIds.has(right)) fail(line, 'A connection requires one device and one net.');
    const device = nodes.get(deviceIds.has(left) ? left : right) as Device;
    const net = deviceIds.has(left) ? right : left;
    if (!device.terminals.includes(terminal)) fail(line, `Unknown terminal "${terminal}" on device "${device.id}".`);
    const key = `${device.id}:${terminal}`;
    const previous = assignments.get(key);
    if (previous !== undefined && previous !== net) fail(line, `Terminal "${key}" is already connected to net "${previous}".`);
    if (previous === undefined) connections.push({ device: device.id, terminal, net });
    assignments.set(key, net);
  }
  return { mode, devices, nets, connections, stages, blocks };
}
