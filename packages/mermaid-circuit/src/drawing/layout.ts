import { mosfetTypes, mosfetChannel, type CircuitModel, type Connection, type Device, type Net, type PinSide } from '../circuitTypes.js';
import { Element, Graphic, type ElementOptions, type PlacedElement } from './core.js';
import { bounds, unionBounds, type Bounds, type Point } from './geometry.js';
import type { SymbolId } from './symbols.js';

export const BLOCK_PADDING = 45;

export interface DevicePlacement {
  readonly device: Device;
  readonly element: Element;
  readonly placed: PlacedElement;
  readonly pane: Bounds;
  readonly rotation: number;
  readonly flip: boolean;
}
export interface Attachment {
  readonly device: string;
  readonly terminal: string;
  readonly net: string;
  readonly point: Point;
  readonly side: PinSide;
  readonly stage: number;
  readonly rotation: number;
}
export interface Frame { readonly kind: 'stage' | 'block'; readonly name: string; readonly bounds: Bounds }
export interface Layout {
  readonly devices: readonly DevicePlacement[];
  readonly attachments: readonly Attachment[];
  readonly frames: readonly Frame[];
  readonly stageBounds: readonly Bounds[];
  readonly nets: readonly Net[];
  readonly bounds: Bounds;
  readonly parallelStages: readonly { stages: readonly number[]; nets: readonly string[] }[];
  readonly proxyPolicy: { readonly inputs: number; readonly devices: number };
  readonly blockProxyPolicies: readonly { readonly block: number; readonly stages: readonly number[]; readonly inputs: number; readonly devices: number }[];
}

export function pad(box: Bounds, amount: number): Bounds {
  return { minX: box.minX - amount, minY: box.minY - amount, maxX: box.maxX + amount, maxY: box.maxY + amount };
}

export function validateOrientation(type: string, rotation: number, reverse = false, flip = false, connectedRotation = 0): void {
  if (['supplyNet', 'ground'].includes(type) && (rotation !== 0 || reverse || flip)) {
    throw new Error('Supply and ground occurrences cannot rotate or reflect.');
  }
  if (['pinIn', 'pinOut', 'pinInOut'].includes(type) && rotation !== 0 && rotation !== connectedRotation) {
    throw new Error('A pin may rotate only with its connected device.');
  }
}

export function localFeedback(devices: readonly Device[], connections: readonly Connection[], nets: readonly Net[]) {
  const netAt = (device: Device, terminal: string) => connections.find((item) => item.device === device.id && item.terminal === terminal)?.net;
  return devices.filter((device) => device.type === 'opamp').flatMap((opamp) => {
    const output = netAt(opamp, 'out'), input = netAt(opamp, 'in1');
    if (output === undefined || input === undefined) return [];
    const candidates = devices.filter((device) => ['resistor', 'capacitor'].includes(device.type)
      && netAt(device, 'A') === output && netAt(device, 'B') === input);
    if (output !== input && candidates.length !== 1) return [];
    const passive = output === input ? undefined : candidates[0];
    const legs = passive ? devices.filter((device) => device !== passive && device.type === 'resistor'
      && netAt(device, 'A') === input && nets.some((net) => net.type === 'ground' && net.id === netAt(device, 'B'))) : [];
    return [{ opamp, output, input, passive, groundLeg: legs.length === 1 ? legs[0] : undefined }];
  });
}

function conduction(device: Device): [string, string] | undefined {
  if (mosfetTypes.includes(device.type)) return mosfetChannel(device.type) === 'P' ? ['S', 'D'] : ['D', 'S'];
  if (['diode', 'diodeFilled', 'schottky', 'diodeTunnel', 'diodeShockley', 'zener', 'diodeTVS',
    'varactor', 'led', 'led2', 'photodiode'].includes(device.type)) return ['K', 'A'];
  if (device.type.endsWith('Source')) return ['P', 'N'];
  if (['resistor', 'capacitor', 'fuse', 'motor', 'solenoid', 'resistorIEC', 'resistorVar', 'resistorVarIEC',
    'thermistor', 'photoresistor', 'photoresistorIEC', 'fuseIEC', 'fuseUs',
    'capacitor2', 'capacitorPolar', 'capacitor2Polar', 'capacitorVar', 'capacitorTrim', 'lamp', 'lamp2', 'breaker', 'diac'].includes(device.type)) return ['A', 'B'];
  return undefined;
}

function defaultRotation(device: Device): number {
  if (['nmos2Diode', 'pmos2Diode', 'nmos2Circle', 'pmos2Circle', 'nfet2'].includes(device.type)) return 90;
  if (device.type === 'pfet2') return 270;
  if (conduction(device)?.[0] === 'K') return 270;
  return conduction(device)?.[0] === 'A' ? 90 : 0;
}

export function icGeometry(device: Device): { width: number; height: number; anchors: Record<string, Point> } {
  const pins = (side: PinSide) => device.terminals.filter((name) => device.pinSides?.[name] === side);
  const width = Math.max(120, (Math.max(pins('T').length, pins('B').length) + 1) * 60) + 60;
  const height = Math.max(120, (Math.max(pins('L').length, pins('R').length) + 1) * 60) + 60;
  const anchors: Record<string, Point> = { center: [width / 2, height / 2] };
  for (const side of ['T', 'B', 'L', 'R'] as const) {
    const names = pins(side);
    names.forEach((name, index) => {
      const along = (side === 'T' || side === 'B' ? width : height) / 2 + (index - (names.length - 1) / 2) * 60;
      anchors[name] = side === 'T' ? [along, 0] : side === 'B' ? [along, height] : side === 'L' ? [0, along] : [width, along];
    });
  }
  return { width, height, anchors };
}

export function deviceElement(device: Device, options: ElementOptions): Element {
  if (!['ic', 'mux', 'demux'].includes(device.type)) return new Element(device.type as SymbolId, options);
  const { width, height, anchors } = icGeometry(device);
  const mux = device.type === 'mux', demux = device.type === 'demux';
  const leftInset = demux ? 60 : 0, rightInset = mux ? 60 : 0;
  return new Graphic([
    { kind: 'polyline', points: [[30, 30 + leftInset], [width - 30, 30 + rightInset],
      [width - 30, height - 30 - rightInset], [30, height - 30 - leftInset], [30, 30 + leftInset]] },
    ...device.terminals.map((name) => {
      const start = anchors[name], side = device.pinSides![name];
      const bottom = height - 30 - leftInset + (leftInset - rightInset) * (start[0] - 30) / (width - 60);
      const end: Point = side === 'T' ? [start[0], 30] : side === 'B' ? [start[0], bottom]
        : side === 'L' ? [30, start[1]] : [width - 30, start[1]];
      return { kind: 'line' as const, start, end };
    }),
  ], anchors, options);
}

function placement(device: Device, at: Point, rotation: number, anchor: string, flip = false): DevicePlacement {
  const element = deviceElement(device, { at, rotation, anchor, flip });
  const placed = element.place();
  const { width, height } = ['ic', 'mux', 'demux'].includes(device.type) ? icGeometry(device) : { width: 120, height: 120 };
  const pane = bounds(placed.transform.applyAll([[0, 0], [width, 0], [width, height], [0, height]]));
  return { device, element, placed, pane, rotation, flip };
}

function levels(edges: readonly (readonly number[])[]): number[] {
  const state = edges.map(() => 0), result = edges.map(() => 0);
  function visit(index: number): number {
    if (state[index] === 1) throw new Error('Unsupported cyclic placement dependency.');
    if (state[index] === 2) return result[index];
    state[index] = 1;
    result[index] = Math.max(0, ...edges[index].map((parent) => visit(parent) + 1));
    state[index] = 2;
    return result[index];
  }
  return edges.map((_, index) => visit(index));
}

function refineAnalogPlacement(model: CircuitModel, devices: DevicePlacement[], netAt: (device: Device, terminal: string) => string | undefined): void {
  const move = (item: DevicePlacement, dx: number, dy: number) => {
    const center = item.placed.anchors.center;
    devices[devices.indexOf(item)] = placement(item.device, [center[0] + dx, center[1] + dy], item.rotation, 'center', item.flip);
  };
  for (const fuse of devices.filter((item) => ['fuse', 'fuseIEC', 'fuseUs'].includes(item.device.type))) {
    const source = devices.find((item) => item.device.type === 'voltageSource'
      && netAt(item.device, 'P') !== undefined && netAt(item.device, 'P') === netAt(fuse.device, 'A'));
    if (!source || model.stages[fuse.device.stage].explicitDirection) continue;
    devices[devices.indexOf(fuse)] = placement(fuse.device, fuse.placed.anchors.center, 0, 'center');
  }
  for (const controller of devices.filter((item) => item.device.type === 'ic')) {
    const topPins = controller.device.terminals.filter((pin) => controller.device.pinSides![pin] === 'T' && netAt(controller.device, pin) !== undefined);
    const inputs = topPins.flatMap((pin) => devices.filter((item) => item.device.stage !== controller.device.stage)
      .flatMap((item) => item.device.terminals.filter((terminal) => netAt(item.device, terminal) === netAt(controller.device, pin))
        .map((terminal) => item.placed.anchors[terminal])));
    if (!inputs.length) continue;
    const dy = Math.max(0, Math.max(...inputs.map((point) => point[1])) + 90 - controller.pane.minY);
    for (const item of devices.filter((item) => item.device.stage === controller.device.stage)) move(item, 0, dy);
  }
  for (const stage of model.stages) {
    const members = devices.filter((item) => stage.devices.includes(item.device.id));
    if (members.length < 2 || !members.every((item) => item.device.terminals.length === 2 && conduction(item.device))) continue;
    const nets = members.map((item) => conduction(item.device)!.map((terminal) => netAt(item.device, terminal)));
    if (!nets[0].every((net) => net !== undefined) || !nets.every((pair) => pair.every((net, i) => net === nets[0][i]))) continue;
    const tops = members.map((item) => item.placed.anchors[conduction(item.device)![0]]);
    if (!tops.every((point, i) => Math.abs(point[1] - members[i].pane.minY) < 1e-7)) continue;
    const feeds = devices.flatMap((item) => item.device.type === 'ic'
      ? item.device.terminals.filter((terminal) => item.device.pinSides?.[terminal] === 'R' && netAt(item.device, terminal) === nets[0][0])
        .map((terminal) => item.placed.anchors[terminal]) : []);
    if (feeds.length !== 1 || feeds[0][0] >= Math.min(...tops.map((point) => point[0]))) continue;
    const dy = feeds[0][1] + 150 - Math.min(...tops.map((point) => point[1]));
    for (const item of members) move(item, 0, dy);
  }
  for (const source of devices.filter((item) => item.device.type === 'voltageSource')) {
    const connected = new Set([source.device.id]);
    let previousSize = 0;
    while (previousSize !== connected.size) {
      previousSize = connected.size;
      const nets = new Set(model.connections.filter((item) => connected.has(item.device)).map((item) => item.net));
      for (const connection of model.connections) if (nets.has(connection.net)) connected.add(connection.device);
    }
    const peers = devices.filter((item) => connected.has(item.device.id) && item !== source);
    if (!peers.length || peers.some((item) => item.device.type === 'voltageSource') || source.rotation !== 0) continue;
    const box = unionBounds(peers.map((item) => item.pane)), centerY = (box.minY + box.maxY) / 2;
    const positive = netAt(source.device, 'P'), negative = netAt(source.device, 'N');
    const targets = (net: string | undefined) => peers.flatMap((item) => item.device.terminals
      .filter((terminal) => net !== undefined && netAt(item.device, terminal) === net).map((terminal) => item.placed.anchors[terminal]));
    const outgoing = targets(positive), returning = targets(negative);
    if (!outgoing.length || !returning.length || outgoing.some((point) => point[1] > centerY - 60)
      || returning.some((point) => point[1] < centerY + 60)) continue;
    const labelRoom = Math.ceil(Math.max(...source.device.label.split(/<br\s*\/?\s*>/iu).map((line) => line.length * 8 + 24)) / 30) * 30;
    move(source, box.minX - Math.max(240, labelRoom + 120) - source.placed.anchors.center[0], centerY - source.placed.anchors.center[1]);
  }
}

export function floorplan(model: CircuitModel): Layout {
  const deviceById = new Map(model.devices.map((device) => [device.id, device]));
  const membership = new Map(model.connections.map((connection) => [`${connection.device}:${connection.terminal}`, connection.net]));
  const netAt = (device: Device, terminal: string) => membership.get(`${device.id}:${terminal}`);
  const feedback = localFeedback(model.devices, model.connections, model.nets);
  const feedbackDevices = new Set(feedback.flatMap(({ passive, groundLeg }) => [passive?.id, groundLeg?.id]));
  const ordinaryConduction = (device: Device) => feedbackDevices.has(device.id) ? undefined : conduction(device);
  const stageLayouts = model.stages.map((stage) => {
    const devices = stage.devices.map((id) => deviceById.get(id)!);
    if (model.mode === 'D') {
      const outputs = (device: Device) => device.type === 'demux'
        ? device.terminals.filter((terminal) => /^O[0-3]$/u.test(terminal)) : ['O'];
      const edges = devices.map((target) => devices.flatMap((source, index) => source !== target
        && outputs(source).some((output) => netAt(source, output) !== undefined
          && target.terminals.some((terminal) => !outputs(target).includes(terminal)
            && netAt(target, terminal) === netAt(source, output))) ? [index] : []));
      const sizes = devices.map((device) => device.type === 'mux' || device.type === 'demux'
        ? icGeometry(device) : { width: 120, height: 120 });
      const columnStep = Math.max(120, ...sizes.map((size) => size.width)) + 240;
      const rowStep = Math.max(120, ...sizes.map((size) => size.height)) + 120;
      const depth = levels(edges), maxRows = Math.max(1, ...depth.map((level) => depth.filter((value) => value === level).length));
      return devices.map((device, index) => {
        const row = depth.slice(0, index).filter((value) => value === depth[index]).length;
        const count = depth.filter((value) => value === depth[index]).length;
        const x = depth[index] * columnStep, y = (row - (count - 1) / 2) * rowStep + (maxRows - 1) * rowStep / 2;
        const peers = devices.filter((_, other) => depth[other] === depth[index]);
        const sharedInput = netAt(device, 'I2');
        const flip = device.type === 'nand' && count === 2 && row === 1 && sharedInput !== undefined
          && peers.every((peer) => peer.type === 'nand' && netAt(peer, 'I2') === sharedInput);
        return placement(device, stage.direction === 'TB' ? [y, x] : [x, y], stage.direction === 'TB' ? 90 : 0, 'center', flip);
      });
    }
    const groups: Device[][] = [];
    const keys = new Map<string, number>();
    for (const device of devices) {
      const pair = ordinaryConduction(device), first = pair && netAt(device, pair[0]), second = pair && netAt(device, pair[1]);
      const key = first && second ? JSON.stringify([first, second]) : device.id;
      let group = keys.get(key);
      if (group === undefined) { group = groups.length; keys.set(key, group); groups.push([]); }
      groups[group].push(device);
    }
    const edges = groups.map(([target], i) => groups.flatMap(([source], j) => {
      const from = ordinaryConduction(source), to = ordinaryConduction(target);
      return i !== j && from && to && netAt(source, from[1]) !== undefined
        && netAt(source, from[1]) === netAt(target, to[0]) ? [j] : [];
    }));
    const linked = edges.some((edge) => edge.length), depth = levels(edges);
    if (!linked && groups.every((group) => group.length === 1)) {
      return devices.map((device, index) => placement(device,
        stage.direction === 'TB' ? [0, index * 300] : [index * 300, index * 90],
        devices.length === 1 && stage.explicitDirection && stage.direction === 'LR' && ordinaryConduction(device)?.[0] === 'A'
          ? 0 : defaultRotation(device), ordinaryConduction(device)?.[0] ?? 'center'));
    }
    const transpose = stage.explicitDirection && (linked ? stage.direction === 'LR' : stage.direction === 'TB');
    const occupied = new Map<number, number>();
    const rows = groups.map((group, index) => {
      const row = occupied.get(depth[index]) ?? 0;
      occupied.set(depth[index], row + group.length);
      return row;
    });
    return groups.flatMap((group, index) => group.map((device, member) => {
      const cross = (rows[index] + member - ((occupied.get(depth[index]) ?? 1) - 1) / 2) * 300;
      const along = depth[index] * 360 + (group.length > 1 && group.some((item) => item.terminals.length > 2) ? member * 90 : 0);
      return placement(device, transpose ? [along, cross] : [cross, along],
        (defaultRotation(device) + (transpose ? 270 : 0)) % 360, ordinaryConduction(device)?.[0] ?? 'center');
    }));
  });
  if (model.mode === 'A') for (const local of stageLayouts) {
    for (const antenna of local.filter((item) => item.device.type === 'antenna')) {
      const net = netAt(antenna.device, 'A');
      const target = local.find((item) => item.device.type === 'ic' && item.device.terminals.some((pin) => net !== undefined
        && netAt(item.device, pin) === net && item.device.pinSides![pin] === 'L'));
      if (!target) continue;
      const pin = target.device.terminals.find((pin) => netAt(target.device, pin) === net)!;
      const labelWidth = Math.max(...antenna.device.label.split(/<br\s*\/?\s*>/iu).map((line) => line.length * 8));
      const distance = Math.max(180, Math.ceil((labelWidth + 180) / 30) * 30);
      local[local.indexOf(antenna)] = placement(antenna.device, [target.pane.minX - distance, target.placed.anchors[pin][1] - 60], 0, 'A');
    }
  }
  const groupStages: number[][] = model.blocks.map((block) => [...block.stages]);
  const ungrouped = model.stages.flatMap((stage, index) => stage.block === null ? [index] : []);
  if (ungrouped.length) groupStages.push(ungrouped);
  const stageBoxes = stageLayouts.map((items) => unionBounds(items.map((item) => item.pane)));
  const stageEnds = model.stages.map((stage) => {
    const members = stage.devices.map((id) => deviceById.get(id)!);
    if (!members.length || !members.every((device) => device.type === members[0].type)
      || !members.every((device) => conduction(device))) return undefined;
    const first = members.map((device) => netAt(device, conduction(device)![0]));
    const last = members.map((device) => netAt(device, conduction(device)![1]));
    const incoming = [...new Set(first.filter((net) => net !== undefined && !last.includes(net)))];
    const outgoing = [...new Set(last.filter((net) => net !== undefined && !first.includes(net)))];
    return incoming.length === 1 && outgoing.length === 1 ? [incoming[0]!, outgoing[0]!] : undefined;
  });
  const parallelStages: { stages: number[]; nets: string[] }[] = [];
  const groupRows = groupStages.map((indices) => {
    const rows: number[][] = [];
    for (const index of indices) {
      const ends = stageEnds[index];
      const same = ends && rows.find((row) => stageEnds[row[0]]?.every((net, i) => net === ends[i]));
      if (same) same.push(index); else rows.push([index]);
    }
    for (const row of rows) if (row.length > 1) parallelStages.push({ stages: row, nets: stageEnds[row[0]]! });
    return rows;
  });
  const rowWidth = (row: readonly number[]) => row.reduce((width, index) => width + stageBoxes[index].maxX - stageBoxes[index].minX, 0) + (row.length - 1) * 300;
  const rowHeight = (row: readonly number[]) => Math.max(0, ...row.map((index) => stageBoxes[index].maxY - stageBoxes[index].minY));
  const hasNetType = (row: readonly number[], type: Net['type']) => model.connections.some((connection) =>
    row.includes(deviceById.get(connection.device)!.stage) && model.nets.some((net) => net.id === connection.net && net.type === type));
  const rowGap = (row: readonly number[], next: readonly number[] = []) =>
    hasNetType(row, 'ground') && hasNetType(next, 'supplyNet') ? 300 : 240;
  const groupHeights = groupRows.map((rows) => rows.reduce((height, row, index) => height + rowHeight(row) + rowGap(row, rows[index + 1]), 0));
  const fullHeight = Math.max(0, ...groupHeights);
  const devices: DevicePlacement[] = [], frames: Frame[] = [], stageBounds: Bounds[] = [];
  let groupX = 0;
  groupRows.forEach((rows, groupIndex) => {
    const groupWidth = Math.max(0, ...rows.map(rowWidth));
    let y = (fullHeight - groupHeights[groupIndex]) / 2;
    for (const [rowIndex, row] of rows.entries()) {
      let x = groupX + (groupWidth - rowWidth(row)) / 2;
      for (const index of row) {
        const local = stageLayouts[index], box = stageBoxes[index];
        const dx = x - box.minX, dy = y - box.minY;
        for (const item of local) {
          const anchor = conduction(item.device)?.[0] ?? 'center';
          const point = item.placed.anchors[anchor];
          devices.push(placement(item.device, [point[0] + dx, point[1] + dy], item.rotation, anchor, item.flip));
        }
        stageBounds[index] = pad({ minX: x, maxX: box.maxX + dx, minY: y, maxY: y + box.maxY - box.minY }, 30);
        const labelRoom = Math.ceil(Math.max(60, ...local.flatMap((item) => item.device.label.split(/<br\s*\/?\s*>/iu)
          .map((line) => line.length * 8 + 24))) / 30) * 30;
        stageBounds[index] = { ...stageBounds[index], maxX: box.maxX + dx + labelRoom };
        if (!model.stages[index].implicit) frames.push({ kind: 'stage', name: model.stages[index].name!, bounds: stageBounds[index] });
        x += box.maxX - box.minX + 300;
      }
      y += rowHeight(row) + rowGap(row, rows[rowIndex + 1]);
    }
    if (groupIndex < model.blocks.length) frames.push({ kind: 'block', name: model.blocks[groupIndex].name,
      bounds: pad(unionBounds(groupStages[groupIndex].map((index) => stageBounds[index])), BLOCK_PADDING) });
    groupX += groupWidth + 300;
  });
  if (model.mode === 'A') {
    refineAnalogPlacement(model, devices, netAt);
    for (const { opamp, passive, groundLeg } of feedback) {
      const amplifier = devices.find((item) => item.device.id === opamp.id)!;
      const [x, y] = amplifier.placed.anchors.in1;
      if (passive) {
        const index = devices.findIndex((item) => item.device.id === passive.id);
        devices[index] = placement(passive, [x + 120, amplifier.pane.minY - 180], 180, 'A');
      }
      if (groundLeg) {
        const index = devices.findIndex((item) => item.device.id === groundLeg.id);
        devices[index] = placement(groundLeg, [x - 360, y + 120], 90, 'A');
      }
    }
    for (const moved of devices.filter((item) => feedbackDevices.has(item.device.id))) {
      const box = moved.placed.bounds;
      if (devices.some((other) => other !== moved && box.minX < other.placed.bounds.maxX && box.maxX > other.placed.bounds.minX
        && box.minY < other.placed.bounds.maxY && box.maxY > other.placed.bounds.minY)) {
        throw new Error(`Unsupported local feedback placement: ${moved.device.id} overlaps another device.`);
      }
    }
    model.stages.forEach((stage, index) => {
      const members = devices.filter((item) => stage.devices.includes(item.device.id));
      if (!members.length) return;
      const box = unionBounds(members.map((item) => item.pane));
      const labelRoom = Math.ceil(Math.max(60, ...members.flatMap((item) => item.device.label.split(/<br\s*\/?\s*>/iu)
        .map((line) => line.length * 8 + 24))) / 30) * 30;
      stageBounds[index] = { ...pad(box, 30), maxX: box.maxX + labelRoom };
    });
    frames.forEach((frame, index) => {
      const box = frame.kind === 'stage' ? stageBounds[model.stages.findIndex((stage) => stage.name === frame.name)]
        : pad(unionBounds(model.blocks.find((block) => block.name === frame.name)!.stages.map((stage) => stageBounds[stage])), BLOCK_PADDING);
      frames[index] = { ...frame, bounds: box };
    });
  }
  const positioned = new Map(devices.map((item) => [item.device.id, item]));
  const attachments = model.connections.map((connection): Attachment => {
    const item = positioned.get(connection.device)!, point = item.placed.anchors[connection.terminal], box = item.pane;
    if (!point) throw new Error(`Missing placed terminal ${connection.device}.${connection.terminal}.`);
    const distances: [PinSide, number][] = [['T', Math.abs(point[1] - box.minY)], ['B', Math.abs(point[1] - box.maxY)],
      ['L', Math.abs(point[0] - box.minX)], ['R', Math.abs(point[0] - box.maxX)]];
    distances.sort((a, b) => a[1] - b[1]);
    return { ...connection, point, side: distances[0][0], stage: item.device.stage, rotation: item.rotation };
  });
  const blockProxyPolicies = model.blocks.map((block, index) => {
    const members = model.devices.filter((device) => block.stages.includes(device.stage));
    const connected = new Set(model.connections.filter((item) => members.some((device) => device.id === item.device)).map((item) => item.net));
    const nets = model.nets.filter((net) => connected.has(net.id));
    return { block: index, stages: block.stages, inputs: nets.filter((net) => net.type === 'pinIn').length,
      devices: members.length + nets.filter((net) => net.type === 'pinInOut').length };
  });
  return { devices, attachments, frames, stageBounds, nets: model.nets, parallelStages, blockProxyPolicies,
    proxyPolicy: { inputs: model.nets.filter((net) => net.type === 'pinIn').length,
      devices: model.devices.length + model.nets.filter((net) => net.type === 'pinInOut').length },
    bounds: unionBounds([...devices.map((item) => item.pane), ...frames.map((frame) => frame.bounds)]) };
}
