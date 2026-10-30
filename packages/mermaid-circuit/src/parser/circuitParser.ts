import catalog from '../../shapes/shapes.json' with { type: 'json' };
import { deviceTypes, netTypes, mosfetTypes, mosfetChannel, type CircuitMode, type CircuitModel,
  type Connection, type Device, type DeviceType, type Direction, type Net, type NetType, type PinSide } from '../circuitTypes.js';

type PendingStage = { name: string | null; implicit: boolean; order: number; direction: Direction;
  explicitDirection?: true; mode: CircuitMode; block: number | null; devices: string[] };
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
  const pending: { left: string; right: string; leftSide?: PinSide; rightSide?: PinSide;
    leftTerminal: string | undefined; rightTerminal: string | undefined; line: number }[] = [];
  const outside: number[] = [];
  const blockDefaults = new Map<number, number>();

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
      stages[scope.index]!.explicitDirection = true;
      continue;
    }
    const connection = text.match(/^([A-Za-z0-9]+(?::[TBLR])?)(?:\s*\|([A-Za-z0-9+\-]+)\|)?\s*---\s*(?:\|([A-Za-z0-9+\-]+)\|\s*)?((?:[TBLR]:)?[A-Za-z0-9]+)(?:\s*\|([A-Za-z0-9+\-]+)\|)?$/u);
    if (connection) {
      const leftTerminal = connection[2], rightTerminal = connection[3] ?? connection[5];
      if (connection[3] && connection[5]) {
        fail(line, 'A device endpoint requires exactly one terminal label.');
      }
      const leftValue = connection[1]!, rightValue = connection[4]!;
      const left = leftValue.includes(':') ? { id: leftValue.slice(0, -2), side: leftValue.at(-1) as PinSide }
        : { id: leftValue, side: undefined };
      const right = rightValue.includes(':') ? { id: rightValue.slice(2), side: rightValue[0] as PinSide }
        : { id: rightValue, side: undefined };
      pending.push({ left: left.id, leftSide: left.side, right: right.id, rightSide: right.side,
        leftTerminal, rightTerminal, line });
      continue;
    }
    const node = text.match(/^([A-Za-z0-9]+)\s*(.*?)\s*:::([A-Za-z0-9]+)$/u);
    if (!node) fail(line, 'Unsupported circuit statement.');
    const [, id, body, type] = node as [string, string, string, string];
    if (nodes.has(id)) fail(line, `Duplicate node identifier "${id}".`);
    const isDevice = (deviceTypes as readonly string[]).includes(type);
    const isNet = type !== 'net' && (netTypes as readonly string[]).includes(type);
    if (!isDevice && !isNet) fail(line, `Unknown authorable object type "${type}".`);
    const delimiters = isDevice ? ['[', ']']
      : type === 'supplyNet' || type === 'ground' ? ['{{', '}}'] : ['([', '])'];
    if (!body.startsWith(delimiters[0]!) || !body.endsWith(delimiters[1]!)) {
      fail(line, `Incorrect declaration brackets for "${type}".`);
    }
    const displayLabel = label(body.slice(delimiters[0]!.length, -delimiters[1]!.length).trim(), line);
    const selector = type === 'mux' || type === 'demux';
    const entry = type === 'ic' || selector ? undefined : catalog[type as Exclude<NetType, 'net'> | Exclude<DeviceType, 'ic' | 'mux' | 'demux'>];
    if (type === 'ic' ? mode !== 'A' : selector ? mode !== 'D' : !entry!.allowedModes.includes(mode)) fail(line, `Type "${type}" is not eligible in mode ${mode}.`);
    if (isDevice) {
      let stageIndex = scope?.index ?? -1;
      if (scope?.kind === 'block') {
        if (!blockDefaults.has(scope.index)) {
          const index = stages.length;
          blockDefaults.set(scope.index, index);
          stages.push({ name: null, implicit: true, order: index, direction: 'LR', mode, block: scope.index, devices: [] });
          blocks[scope.index]!.stages.push(index);
        }
        stageIndex = blockDefaults.get(scope.index)!;
      }
      let size: 2 | 4 | undefined;
      let pinSides: Record<string, PinSide> | undefined;
      if (selector) {
        const parameters = displayLabel.split(/<br\s*\/?\s*>/iu).slice(1).map((part) => part.trim())
          .filter((part) => /^size\b/u.test(part));
        const values = parameters.map((part) => part.match(/^size\s*=\s*([24])$/u)?.[1]);
        if (!values.length || values.some((value) => value === undefined) || new Set(values).size !== 1) {
          fail(line, 'MUX/DEMUX requires a non-conflicting size=2 or size=4 label parameter.');
        }
        size = values[0] === '2' ? 2 : 4;
        const data = Array.from({ length: size }, (_, index) => `${type === 'mux' ? 'I' : 'O'}${index}`);
        const select = size === 2 ? ['S0'] : ['S0', 'S1'];
        pinSides = Object.fromEntries([
          ...(type === 'mux' ? data.map((name) => [name, 'L']) : [['I', 'L']]),
          ...(type === 'mux' ? [['O', 'R']] : data.map((name) => [name, 'R'])),
          ...select.map((name) => [name, 'B']),
        ]) as Record<string, PinSide>;
      }
      const deviceType = type as DeviceType;
      const device: Device = { id, type: deviceType, label: displayLabel,
        terminals: entry ? Object.keys(entry.terminals) : pinSides ? Object.keys(pinSides) : [], stage: stageIndex,
        ...(size ? { size, pinSides } : {}),
        ...(type === 'ic' ? { pinSides: {} } : {}),
        ...(mosfetTypes.includes(deviceType) ? { bulk: entry && 'B' in entry.terminals
          ? { kind: 'explicit' as const, terminal: 'B' as const }
          : { kind: 'implicit' as const, sourceTerminal: 'S' as const } } : {}) };
      if (scope) stages[stageIndex]!.devices.push(id);
      else outside.push(devices.length);
      devices.push(device); nodes.set(id, device); deviceIds.add(id);
    } else {
      if (scope) fail(line, 'Nets must be declared outside subgraphs.');
      const net: Net = { id, type: type as NetType, label: displayLabel };
      nets.push(net); nodes.set(id, net);
    }
  }
  if (scopes.length) fail(scopes.at(-1)!.line, 'Unclosed subgraph.');
  for (const connection of pending) {
    if (connection.leftTerminal === undefined && nodes.get(connection.left)?.type === 'antenna') connection.leftTerminal = 'A';
    if (connection.rightTerminal === undefined && nodes.get(connection.right)?.type === 'antenna') connection.rightTerminal = 'A';
    if (!connection.leftTerminal && !connection.rightTerminal) fail(connection.line, 'A device endpoint requires exactly one terminal label.');
    for (const [id, terminal, side] of [[connection.left, connection.leftTerminal, connection.leftSide],
      [connection.right, connection.rightTerminal, connection.rightSide]] as const) {
      const device = nodes.get(id) as Device | undefined;
      if (side && device?.type !== 'ic') fail(connection.line, 'Unsupported side qualifier on a non-IC endpoint.');
      if (device?.type !== 'ic') continue;
      if (!side || !terminal) fail(connection.line, 'IC terminals require a named pin and side qualifier.');
      const pins = device.pinSides as Record<string, PinSide>;
      if (pins[terminal] && pins[terminal] !== side) fail(connection.line, `IC pin "${terminal}" has conflicting sides.`);
      if (!pins[terminal]) { pins[terminal] = side; (device.terminals as string[]).push(terminal); }
    }
  }
  for (const device of devices) {
    if (device.type === 'ic' && device.terminals.length === 0) fail(header!.line, 'An IC requires at least one named pin connection.');
  }
  if (outside.length) {
    const index = stages.length;
    const ids = outside.map((position) => {
      const device = devices[position]!;
      devices[position] = { ...device, stage: index };
      return device.id;
    });
    stages.push({ name: null, implicit: true, order: index, direction: 'LR', mode, block: null, devices: ids });
  }
  for (const { left, right, leftTerminal, rightTerminal } of pending) {
    if (leftTerminal !== undefined && rightTerminal !== undefined) continue;
    const device = leftTerminal !== undefined ? left : right;
    const net = leftTerminal !== undefined ? right : left;
    if (nodes.has(net) || !deviceIds.has(device)) continue;
    const connected = nodes.get(device) as Device;
    const terminal = leftTerminal ?? rightTerminal;
    const channel = mosfetChannel(connected.type);
    let type: NetType | undefined;
    if (mosfetTypes.includes(connected.type)) {
      if (terminal === 'G') type = 'pinIn';
      else if (terminal === 'D') type = 'pinOut';
      else if (terminal === 'S' && channel) type = channel === 'P' ? 'supplyNet' : 'ground';
    }
    if (type === undefined) continue;
    const inferred: Net = { id: net, type, label: net, implicit: true };
    nodes.set(net, inferred);
    nets.push(inferred);
  }
  const parents = new Map<string, string>();
  const namedNets = new Map<string, string>();
  const endpoints = new Map<string, { device: string; terminal: string }>();
  function root(key: string): string {
    let current = key;
    while (parents.get(current)! !== current) {
      const parent = parents.get(current)!;
      parents.set(current, parents.get(parent)!);
      current = parent;
    }
    return current;
  }
  function endpoint(id: string, terminal: string, line: number): string {
    const device = nodes.get(id) as Device;
    if (!device.terminals.includes(terminal)) fail(line, `Unknown terminal "${terminal}" on device "${id}".`);
    const key = `${id}:${terminal}`;
    if (!parents.has(key)) {
      parents.set(key, key);
      endpoints.set(key, { device: id, terminal });
    }
    return root(key);
  }
  for (const { left, right, leftTerminal, rightTerminal, line } of pending) {
    if (leftTerminal !== undefined && rightTerminal !== undefined) {
      if (!nodes.has(left) || !nodes.has(right)) fail(line, `Connection references an undeclared device: ${left}, ${right}.`);
      if (!deviceIds.has(left) || !deviceIds.has(right) || left === right) {
        fail(line, 'A direct connection requires two distinct devices.');
      }
      const first = endpoint(left, leftTerminal, line), second = endpoint(right, rightTerminal, line);
      if (leftTerminal === 'S' && rightTerminal === 'S') fail(line, 'Direct source-to-source connections are not supported.');
      if (leftTerminal === 'S' && rightTerminal === 'D') fail(line, 'Direct source-to-drain connections are not supported; write drain-to-source.');
      const firstNet = namedNets.get(first), secondNet = namedNets.get(second);
      if (firstNet !== undefined && secondNet !== undefined && firstNet !== secondNet) {
        fail(line, `Direct connection conflicts with named nets "${firstNet}" and "${secondNet}".`);
      }
      const canonical = first < second ? first : second;
      parents.set(first, canonical);
      parents.set(second, canonical);
      const net = firstNet ?? secondNet;
      if (net !== undefined) namedNets.set(canonical, net);
      continue;
    }
    const device = leftTerminal !== undefined ? left : right;
    const net = leftTerminal !== undefined ? right : left;
    if (!nodes.has(device)) fail(line, `Connection references an undeclared device: ${device}.`);
    if (!deviceIds.has(device)) fail(line, 'The terminal label must belong to the device endpoint.');
    if (deviceIds.has(net)) fail(line, 'Each device endpoint requires its own terminal label.');
    const terminal = (leftTerminal ?? rightTerminal)!;
    const key = endpoint(device, terminal, line);
    if (!nodes.has(net)) fail(line, `Declare endpoint "${net}" explicitly; no connected terminal defines its inferred type.`);
    const previous = namedNets.get(key);
    if (previous !== undefined && previous !== net) fail(line, `Terminal "${key}" is already connected to net "${previous}".`);
    namedNets.set(key, net);
  }
  const implicit = new Map<string, Net>();
  for (const [key, endpoint] of endpoints) {
    const group = root(key);
    let net = namedNets.get(group);
    if (net === undefined) {
      net = `@implicit:${group}`;
      implicit.set(net, { id: net, type: 'net', label: '', implicit: true });
    }
    connections.push({ ...endpoint, net });
  }
  nets.push(...[...implicit.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { mode, devices, nets, connections, stages, blocks };
}
