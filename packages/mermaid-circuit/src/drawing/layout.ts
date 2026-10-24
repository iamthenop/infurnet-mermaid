import type { CircuitModel, Device, Direction, NetType } from '../circuitTypes.js';
import { Transform, bounds, translateBounds, type Bounds, type Point } from './geometry.js';
import { resolveSymbol, type SymbolId } from './symbols.js';

export type Rotation = 0 | 90 | 180 | 270;
type Arrangement = Exclude<Direction, 'auto'>;
type Topology = 'single' | 'series' | 'parallel' | 'unrecognized';

interface PlacedGeometry {
  readonly symbol: SymbolId;
  readonly position: Point;
  readonly rotation: Rotation;
  readonly reflected: boolean;
  readonly width: number;
  readonly height: number;
  readonly bounds: Bounds;
  readonly transform: Transform;
  readonly svgTransform: string;
  readonly terminals: Readonly<Record<string, Point>>;
  readonly anchor?: Point;
}

export interface PlacedDevice extends PlacedGeometry {
  readonly id: string;
  readonly stage: number;
  readonly region: 'internal' | 'top';
}

export interface PlacedNet extends PlacedGeometry {
  readonly id: string;
  readonly region: 'left' | 'right' | 'top' | 'bottom';
  readonly block?: number;
  readonly occurrence?: string;
  readonly role?: 'boundary' | 'local' | 'external';
}

export interface StageLayout {
  readonly stage: number;
  readonly block: number | null;
  readonly direction: Direction;
  readonly bounds: Bounds;
  readonly groups: readonly {
    readonly topology: Topology;
    readonly direction: Arrangement;
    readonly devices: readonly string[];
  }[];
}

export interface CircuitLayout {
  readonly sectional?: true;
  readonly sections?: readonly { readonly block: number | null; readonly stages: readonly number[]; readonly bounds: Bounds }[];
  readonly devices: readonly PlacedDevice[];
  readonly nets: readonly PlacedNet[];
  readonly stages: readonly StageLayout[];
  readonly blocks: readonly { readonly block: number; readonly stages: readonly number[]; readonly bounds: Bounds | null }[];
  readonly bounds: Bounds;
  readonly inputTargets: readonly { readonly net: string; readonly device: string; readonly terminal: string; readonly aligned: boolean }[];
  readonly unplacedNetIds: readonly string[];
  readonly fallbackStages: readonly number[];
}

type Group = { topology: Topology; devices: Device[] };
const rotations: readonly Rotation[] = [0, 90, 180, 270];
const isPmos = (device: Device) => device.type === 'pmos' || device.type === 'pmosBlk';
const isNmos = (device: Device) => device.type === 'nmos' || device.type === 'nmosBlk';
const isCmos = (device: Device) => isPmos(device) || isNmos(device);
const familyOrder = (device: Device) => isPmos(device) ? 0 : isNmos(device) ? 2 : 1;

function cmosOrder(devices: readonly Device[]): boolean {
  let seenNmos = false;
  for (const device of devices) {
    if (isPmos(device) && seenNmos) return false;
    if (isNmos(device)) seenNmos = true;
  }
  return true;
}

function conduction(device: Device): readonly string[] {
  if (isCmos(device)) return device.terminals.filter((name) => name === 'D' || name === 'S');
  if (device.type === 'inverter' || device.type === 'buffer') return [];
  return device.terminals.length === 2 ? device.terminals : [];
}

function enclose(boxes: readonly Bounds[], padding = 0): Bounds {
  const box = bounds(boxes.flatMap((box): Point[] => [[box.minX, box.minY], [box.maxX, box.maxY]]));
  return { minX: box.minX - padding, minY: box.minY - padding, maxX: box.maxX + padding, maxY: box.maxY + padding };
}

export function place(symbol: SymbolId, position: Point, rotation: Rotation = 0, reflected = false): PlacedGeometry {
  const { width, height } = resolveSymbol(symbol);
  const transform = new Transform({ rotation, reflectVertical: reflected, localOffset: [-width / 2, -height / 2],
    translation: [position[0] + width / 2, position[1] + height / 2] });
  const resolved = resolveSymbol(symbol, transform);
  return { symbol, position, rotation, reflected, width, height, transform, svgTransform: resolved.svgTransform,
    terminals: resolved.terminals, ...('anchor' in resolved ? { anchor: resolved.anchor } : {}),
    bounds: { minX: position[0], minY: position[1], maxX: position[0] + width, maxY: position[1] + height } };
}

export function layoutCircuit(model: CircuitModel): CircuitLayout {
  const build = (sweep: boolean) => model.blocks.filter((block) => block.stages.length).length > 1 ? layoutSections(model, sweep)
    : layoutConnected(model, new Map(), model.blocks.some((block) => block.stages.length > 0), sweep);
  const baseline = build(false);
  if (model.mode !== 'D' || !model.devices.length) return baseline;
  const quality = (layout: CircuitLayout): readonly number[] => {
    const edges: { net: string; a: Point; b: Point }[] = [];
    const blockOf = (device: PlacedDevice) => layout.sectional ? model.stages[device.stage].block : null;
    for (const net of model.nets) {
      const assigned = model.connections.filter((connection) => connection.net === net.id)
        .map((connection) => ({ ...connection, placed: layout.devices.find((device) => device.id === connection.device)! }));
      for (const target of assigned.filter((connection) => connection.terminal !== 'O')) {
        const block = blockOf(target.placed);
        const drivers = assigned.filter((connection) => connection.terminal === 'O' && blockOf(connection.placed) === block);
        const origins = drivers.map((driver) => driver.placed.terminals.O);
        for (const a of origins) edges.push({ net: net.id, a, b: target.placed.terminals[target.terminal] });
      }
    }
    let crossings = 0;
    for (let i = 0; i < edges.length; i++) for (const other of edges.slice(i + 1)) {
      const edge = edges[i];
      if (edge.net === other.net) continue;
      const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross(edge.a, edge.b, other.a) * cross(edge.a, edge.b, other.b) < -1e-7
        && cross(other.a, other.b, edge.a) * cross(other.a, other.b, edge.b) < -1e-7) crossings++;
    }
    const bendEstimate = ({ a, b }: typeof edges[number]) => {
      const escape = (p: Point): Point => {
        const owner = layout.devices.find((d) => Object.values(d.terminals).some((t) => Math.hypot(t[0] - p[0], t[1] - p[1]) < 1e-7))!;
        const sides = [Math.abs(p[0] - owner.bounds.minX), Math.abs(p[0] - owner.bounds.maxX), Math.abs(p[1] - owner.bounds.minY), Math.abs(p[1] - owner.bounds.maxY)];
        const side = sides.indexOf(Math.min(...sides));
        return [p[0] + (side === 0 ? -30 : side === 1 ? 30 : 0), p[1] + (side === 2 ? -30 : side === 3 ? 30 : 0)];
      };
      const start = escape(a), end = escape(b);
      const estimate = (corner: Point) => {
        const points = [a, start, corner, end, b].filter((p, i, all) => !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-7);
        const directions = points.slice(1).map((p, i) => Math.abs(p[0] - points[i][0]) < 1e-7 ? Math.sign(p[1] - points[i][1]) * 2 : Math.sign(p[0] - points[i][0]));
        return directions.slice(1).reduce((sum, d, i) => sum + (d === directions[i] ? 0 : Math.abs(d) === Math.abs(directions[i]) ? 2 : 1), 0);
      };
      return Math.min(estimate([start[0], end[1]]), estimate([end[0], start[1]]));
    };
    const bends = edges.reduce((sum, edge) => sum + bendEstimate(edge), 0);
    const length = edges.reduce((sum, { a, b }) => sum + Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 0);
    return [crossings, bends, length, layout.devices.filter((device) => device.reflected).length + layout.devices.filter((device) => device.rotation !== 0).length];
  };
  const better = (a: readonly number[], b: readonly number[] | undefined) => !b || a.some((value, index) => value < b[index] - 1e-7 && a.slice(0, index).every((prior, i) => Math.abs(prior - b[i]) < 1e-7));
  let best = baseline, score = quality(best);
  for (const initial of [baseline, build(true)]) {
    let candidate = initial, candidateScore = quality(candidate);
    for (let pass = 0; pass < candidate.devices.length; pass++) {
      let changed = false;
      for (const device of candidate.devices) {
        if (!['inverter', 'buffer', 'nand'].includes(device.symbol)) continue;
        for (const rotation of rotations) for (const reflected of [false, true]) {
          const oriented = { ...device, ...place(device.symbol, device.position, rotation, reflected) };
          const trial = { ...candidate, devices: candidate.devices.map((item) => item.id === device.id ? oriented : item) };
          const next = quality(trial);
          if (better(next, candidateScore)) { candidate = trial; candidateScore = next; changed = true; }
        }
      }
      if (!changed) break;
    }
    if (better(candidateScore, score)) { best = candidate; score = candidateScore; }
  }
  return { ...best, inputTargets: best.inputTargets.map((target) => {
    const device = best.devices.find((d) => d.id === target.device)!;
    const pin = best.nets.find((n) => n.id === target.net && (!best.sectional || (n.block ?? null) === model.stages[device.stage].block));
    return { ...target, aligned: !!pin?.anchor && Math.abs(device.terminals[target.terminal][1] - pin.anchor[1]) < 1e-7 };
  }) };
}

function layoutConnected(model: CircuitModel, appearances: ReadonlyMap<string, NetType> = new Map(), branches = false, sweep = false): CircuitLayout {
  const netType = (id: string) => appearances.get(id) ?? model.nets.find((net) => net.id === id)?.type;
  const pane = resolveSymbol('resistor').width, gap = pane / 2, padding = pane / 4, pitch = pane + gap;
  const internalX = pane * 2;
  const deviceById = new Map(model.devices.map((device) => [device.id, device]));
  const declaration = new Map(model.devices.map((device, index) => [device.id, index]));
  const netById = new Map(model.nets.map((net) => [net.id, net]));
  const inputOrder = new Map(model.nets.filter((net) => netType(net.id) === 'pinIn').map((net, index) => [net.id, index]));
  const assignments = new Map(model.connections.map((connection) => [`${connection.device}:${connection.terminal}`, connection.net]));
  const netCounts = new Map<string, number>();
  for (const connection of model.connections) netCounts.set(connection.net, (netCounts.get(connection.net) ?? 0) + 1);
  const netAt = (device: Device, terminal: string) => assignments.get(`${device.id}:${terminal}`);
  const shared = (left: Device, right: Device) => conduction(left).flatMap((a) => conduction(right)
    .filter((b) => netAt(left, a) !== undefined && netAt(left, a) === netAt(right, b))
    .map((b) => ({ left: a, right: b, net: netAt(left, a)! })));
  const pair = (device: Device) => conduction(device).map((terminal) => netAt(device, terminal));
  const parallel = (a: Device, b: Device): boolean => {
    const x = pair(a), y = pair(b);
    return x.length === 2 && x.every((net) => net !== undefined) && x[0] !== x[1]
      && y.length === 2 && ((x[0] === y[0] && x[1] === y[1]) || (x[0] === y[1] && x[1] === y[0]));
  };
  const seriesLink = (a: Device, b: Device): boolean => {
    const links = shared(a, b);
    return links.length === 1 && netCounts.get(links[0].net) === 2 && netById.get(links[0].net)?.type === 'net' && !appearances.has(links[0].net);
  };

  function recognize(devices: Device[]): Group[] {
    const remaining = new Set(devices), groups: Group[] = [], fallback: Device[] = [];
    for (const device of devices) {
      if (!remaining.has(device)) continue;
      const members = devices.filter((other) => remaining.has(other) && (other === device || parallel(device, other)));
      if (members.length > 1) {
        groups.push({ topology: 'parallel', devices: members });
        members.forEach((member) => remaining.delete(member));
      }
    }
    const neighbors = new Map([...remaining].map((device) => [device, [...remaining].filter((other) => other !== device && seriesLink(device, other))]));
    while (remaining.size) {
      const first = remaining.values().next().value!;
      const component: Device[] = [], queue = [first];
      remaining.delete(first);
      while (queue.length) {
        const next = queue.shift()!;
        component.push(next);
        for (const neighbor of neighbors.get(next)!) {
          if (remaining.delete(neighbor)) queue.push(neighbor);
        }
      }
      const ends = component.filter((device) => neighbors.get(device)!.length === 1)
        .sort((a, b) => declaration.get(a.id)! - declaration.get(b.id)!);
      if (ends.length === 2 && component.every((device) => neighbors.get(device)!.length <= 2)) {
        const chain: Device[] = [];
        let previous: Device | undefined, current: Device | undefined = ends[0];
        while (current) {
          chain.push(current);
          const next: Device | undefined = neighbors.get(current)!.find((device) => device !== previous);
          previous = current; current = next;
        }
        if (cmosOrder(chain) || cmosOrder([...chain].reverse())) groups.push({ topology: 'series', devices: chain });
        else fallback.push(...chain);
      } else fallback.push(...component);
    }
    if (fallback.length) groups.push({ topology: fallback.length === 1 ? 'single' : 'unrecognized',
      devices: fallback.sort((a, b) => familyOrder(a) - familyOrder(b) || declaration.get(a.id)! - declaration.get(b.id)!) });
    return groups.sort((a, b) => Math.min(...a.devices.map(familyOrder)) - Math.min(...b.devices.map(familyOrder))
      || Math.min(...a.devices.map((device) => declaration.get(device.id)!)) - Math.min(...b.devices.map((device) => declaration.get(device.id)!)));
  }

  const localCache = new Map<string, PlacedGeometry>();
  function local(device: Device, rotation: Rotation): PlacedGeometry {
    const key = `${device.type}:${rotation}`;
    if (!localCache.has(key)) localCache.set(key, place(device.type, [0, 0], rotation));
    return localCache.get(key)!;
  }

  function orient(group: Group, direction: Arrangement, automatic: boolean): { rotations: Rotation[]; cost: number } {
    const axis = direction === 'LR' ? 0 : 1;
    let parallelTop: string | undefined;
    if (group.topology === 'parallel') {
      const first = group.devices[0], terminals = conduction(first);
      const reference = local(first, Math.abs(local(first, 0).terminals[terminals[0]][1]
        - local(first, 0).terminals[terminals[1]][1]) > 0 ? 0 : 90);
      parallelTop = netAt(first, reference.terminals[terminals[0]][1] < reference.terminals[terminals[1]][1] ? terminals[0] : terminals[1]);
    }
    let cost = 0;
    const chosen = group.devices.map((device, index): Rotation => {
      if (automatic && (isCmos(device) || group.topology === 'single' || group.topology === 'unrecognized')) return 0;
      const before = index > 0 ? shared(group.devices[index - 1], device) : [];
      const after = index + 1 < group.devices.length ? shared(device, group.devices[index + 1]) : [];
      function score(rotation: Rotation): number {
        const terminals = local(device, rotation).terminals;
        if (group.topology === 'parallel') return conduction(device).reduce((sum, terminal) =>
          sum + (terminals[terminal][1] - (netAt(device, terminal) === parallelTop ? 0 : pane)) ** 2, 0);
        return (before.length === 1 ? terminals[before[0].right][axis] ** 2 : 0)
          + (after.length === 1 ? (pane - terminals[after[0].left][axis]) ** 2 : 0);
      }
      const rotation = rotations.reduce((best, candidate) => score(candidate) < score(best) - 1e-6 ? candidate : best, 0 as Rotation);
      cost += score(rotation);
      return rotation;
    });
    // CMOS defaults remain fixed in auto; their alignment still selects the chain's traversal order.
    if (automatic && group.topology === 'series') {
      group.devices.forEach((device, index) => {
        if (!isCmos(device)) return;
        const terminals = local(device, 0).terminals;
        if (index > 0) cost += terminals[shared(group.devices[index - 1], device)[0].right][axis] ** 2;
        if (index + 1 < group.devices.length) cost += (pane - terminals[shared(device, group.devices[index + 1])[0].left][axis]) ** 2;
      });
    }
    return { rotations: chosen, cost };
  }

  const placed = new Map<string, PlacedDevice>(), placedNets = new Map<string, PlacedNet>();
  const stages: StageLayout[] = [], fallbackStages: number[] = [];
  const voltages = model.devices.filter((device) => device.type === 'voltageSource');
  const supplies = model.nets.filter((net) => netType(net.id) === 'supplyNet');
  voltages.forEach((device, index) => placed.set(device.id, { ...place(device.type, [internalX + index * pitch, 0]),
    id: device.id, stage: device.stage, region: 'top' }));
  const supplyY = voltages.length ? pitch : 0;
  supplies.forEach((net, index) => placedNets.set(net.id, { ...place('supplyNet', [internalX + index * pitch, supplyY]), id: net.id, region: 'top' }));
  let cursorY = Number(voltages.length > 0) * pitch + gap;

  for (const [stageIndex, stage] of model.stages.entries()) {
    const members = stage.devices.map((id) => deviceById.get(id)!).filter((device) => device.type !== 'voltageSource');
    const recognized = recognize(members), automatic = stage.direction === 'auto';
    const groups = automatic ? recognized : members.length ? [{ topology: recognized.length === 1 ? recognized[0].topology : 'unrecognized' as Topology,
      devices: stage.direction === 'TB' ? [...members].sort((a, b) => familyOrder(a) - familyOrder(b)) : members }] : [];
    const stageGroups: { topology: Topology; direction: Arrangement; devices: string[] }[] = [];
    const stageDevices: PlacedDevice[] = [];
    let groupY = cursorY;
    for (let group of groups) {
      const direction: Arrangement = automatic ? group.topology === 'series' ? 'TB' : 'LR' : stage.direction as Arrangement;
      let plan = orient(group, direction, automatic);
      if (automatic && group.topology === 'series') {
        const reversed = { ...group, devices: [...group.devices].reverse() }, reversePlan = orient(reversed, direction, true);
        if (!cmosOrder(group.devices) || (cmosOrder(reversed.devices) && reversePlan.cost < plan.cost - 1e-6)) {
          group = reversed; plan = reversePlan;
        }
      }
      const parallelCmos = group.topology === 'parallel' && (group.devices.every(isPmos) || group.devices.every(isNmos));
      const stagger = direction === 'LR' && parallelCmos;
      const firstInput = (device: Device) => Math.min(...device.terminals.map((terminal) =>
        inputOrder.get(netAt(device, terminal) ?? '') ?? model.nets.length));
      const rows = new Map(group.devices.map((device, index) => ({ device, index }))
        .sort((a, b) => firstInput(a.device) - firstInput(b.device) || a.index - b.index)
        .map(({ device }, row) => [device.id, row]));
      const staggerPitch = parallelCmos ? pitch / 2 : pitch;
      const offsets: Point[] = [];
      group.devices.forEach((device, index) => {
        let x = direction === 'LR' ? index * pitch : 0;
        let y = direction === 'TB' ? index * pitch : stagger ? rows.get(device.id)! * staggerPitch : 0;
        if (index > 0 && group.topology === 'series') {
          const link = shared(group.devices[index - 1], device);
          if (link.length === 1) {
            const previous = local(group.devices[index - 1], plan.rotations[index - 1]).terminals[link[0].left];
            const current = local(device, plan.rotations[index]).terminals[link[0].right];
            if (direction === 'TB') x = offsets[index - 1][0] + previous[0] - current[0];
            else if (!stagger) y = offsets[index - 1][1] + previous[1] - current[1];
          }
        }
        offsets.push([Math.round(x), Math.round(y)]);
      });
      if (model.mode === 'D' && stage.direction === 'LR') {
        const predecessors = new Map(group.devices.map((device) => [device.id, group.devices.filter((source) => {
          const output = netAt(source, 'O');
          return output !== undefined && device.terminals.some((terminal) => terminal !== 'O' && netAt(device, terminal) === output);
        }).map((source) => source.id)]));
        const levels = new Map<string, number>();
        while (levels.size < group.devices.length) {
          const ready = group.devices.filter((device) => !levels.has(device.id) && predecessors.get(device.id)!.every((id) => levels.has(id)));
          if (!ready.length) break;
          for (const device of ready) levels.set(device.id, Math.max(-1, ...predecessors.get(device.id)!.map((id) => levels.get(id)!)) + 1);
        }
        if (levels.size === group.devices.length) {
          const columns = [...new Set(levels.values())].map((level) => group.devices.filter((device) => levels.get(device.id) === level));
          if (sweep) for (let pass = 0; pass < 4; pass++) {
            const ordered = pass % 2 ? [...columns].reverse() : columns;
            for (const column of ordered) {
              const row = (device: Device) => { const peers = columns.find((items) => items.includes(device))!; return peers.indexOf(device) - (peers.length - 1) / 2; };
              const center = (device: Device) => {
                const neighbors = group.devices.filter((other) => pass % 2 ? predecessors.get(other.id)!.includes(device.id) : predecessors.get(device.id)!.includes(other.id));
                return neighbors.length ? neighbors.reduce((sum, other) => sum + row(other), 0) / neighbors.length : row(device);
              };
              const centers = new Map(column.map((device) => [device.id, center(device)]));
              column.sort((a, b) => centers.get(a.id)! - centers.get(b.id)! || declaration.get(a.id)! - declaration.get(b.id)!);
            }
          }
          const rows = Math.max(...columns.map((column) => column.length));
          group.devices.forEach((device, index) => {
            const level = levels.get(device.id)!, column = columns.find((column) => levels.get(column[0].id) === level)!;
            offsets[index] = [level * pitch, ((rows - column.length) / 2 + column.indexOf(device)) * pitch];
          });
        }
      }
      if (direction === 'LR' && group.devices.some(isPmos)) {
        const belowPmos = Math.max(...offsets.filter((_, index) => isPmos(group.devices[index])).map((point) => point[1])) + pitch;
        group.devices.forEach((device, index) => { if (isNmos(device)) offsets[index] = [offsets[index][0], Math.max(offsets[index][1], belowPmos)]; });
      }
      const minX = Math.min(...offsets.map((point) => point[0])), minY = Math.min(...offsets.map((point) => point[1]));
      const groupDevices = group.devices.map((device, index): PlacedDevice => ({
        ...place(device.type, [internalX + offsets[index][0] - minX, groupY + offsets[index][1] - minY], plan.rotations[index]),
        id: device.id, stage: stageIndex, region: 'internal',
      }));
      groupDevices.forEach((device) => placed.set(device.id, device));
      stageDevices.push(...groupDevices);
      groupY = Math.max(...groupDevices.map((device) => device.bounds.maxY)) + gap;
      stageGroups.push({ topology: group.topology, direction, devices: group.devices.map((device) => device.id) });
    }
    const stageBounds = enclose(stageDevices.length ? stageDevices.map((device) => device.bounds)
      : [{ minX: internalX, minY: cursorY, maxX: internalX + pane, maxY: cursorY + pane }], padding);
    stages.push({ stage: stageIndex, block: stage.block, direction: stage.direction, bounds: stageBounds, groups: stageGroups });
    if (automatic && stageGroups.some((group) => group.topology === 'unrecognized')) fallbackStages.push(stageIndex);
    cursorY = stageBounds.maxY + padding + gap;
  }

  const stageWidth = Math.max(0, ...stages.map((stage) => stage.bounds.maxX - stage.bounds.minX));
  const stageCenterX = internalX - padding + stageWidth / 2;
  for (const [index, stage] of stages.entries()) {
    const dx = stageCenterX - (stage.bounds.minX + stage.bounds.maxX) / 2;
    for (const id of model.stages[index].devices) {
      const device = placed.get(id)!;
      if (device.region === 'internal') placed.set(id, { ...device,
        ...place(device.symbol, [device.position[0] + dx, device.position[1]], device.rotation) });
    }
    stages[index] = { ...stage, bounds: translateBounds(stage.bounds, [dx, 0]) };
  }
  for (let index = 1; index < stages.length; index++) {
    const above = [...placed.values()].filter((device) => device.stage === index - 1 && device.region === 'internal');
    const below = [...placed.values()].filter((device) => device.stage === index && device.region === 'internal');
    const facing = above.some((upper) => below.some((lower) => Object.entries(upper.terminals).some(([a, p]) =>
      Math.abs(p[1] - upper.bounds.maxY) < 1e-7 && Object.entries(lower.terminals).some(([b, q]) =>
        Math.abs(q[1] - lower.bounds.minY) < 1e-7
        && q[1] - p[1] < gap * 3 && netAt(deviceById.get(upper.id)!, a) !== undefined
        && netAt(deviceById.get(lower.id)!, b) !== undefined
        && netAt(deviceById.get(upper.id)!, a) !== netAt(deviceById.get(lower.id)!, b)))));
    if (!facing) continue;
    for (const device of placed.values()) if (device.region === 'internal' && device.stage >= index)
      placed.set(device.id, { ...device, ...place(device.symbol, [device.position[0], device.position[1] + gap], device.rotation) });
    for (let later = index; later < stages.length; later++) stages[later] = { ...stages[later], bounds: translateBounds(stages[later].bounds, [0, gap]) };
  }
  if (branches) {
    const move = (index: number, dx: number, dy: number) => {
      for (const id of model.stages[index].devices) {
        const device = placed.get(id)!;
        placed.set(id, { ...device, ...place(device.symbol, [device.position[0] + dx, device.position[1] + dy], device.rotation) });
      }
      stages[index] = { ...stages[index], bounds: translateBounds(stages[index].bounds, [dx, dy]) };
    };
    const branchEnds = (stage: StageLayout): readonly string[] | undefined => {
      if (stage.groups.length !== 1 || stage.groups[0].topology !== 'series' || stage.groups[0].direction !== 'TB') return;
      const devices = stage.groups[0].devices.map((id) => deviceById.get(id)!);
      if (devices.length < 2 || !devices.every(isNmos) || devices.some((device) => placed.get(device.id)!.rotation !== 0)) return;
      const top = netAt(devices[0], 'D'), bottom = netAt(devices.at(-1)!, 'S');
      if (top && bottom && top !== bottom) return [top, bottom];
    };
    for (let first = 0; first < stages.length; first++) {
      const ends = branchEnds(stages[first]);
      if (!ends) continue;
      let last = first;
      while (last + 1 < stages.length && stages[last + 1].block === stages[first].block && branchEnds(stages[last + 1])?.every((net, index) => net === ends[index])) last++;
      if (last === first) continue;
      const oldBottom = stages[last].bounds.maxY;
      let right = stages[first].bounds.maxX;
      for (let next = first + 1; next <= last; next++) {
        move(next, right + pitch - stages[next].bounds.minX, stages[first].bounds.minY - stages[next].bounds.minY);
        right = stages[next].bounds.maxX;
      }
      const row = enclose(stages.slice(first, last + 1).map((stage) => stage.bounds));
      const dx = stageCenterX - (row.minX + row.maxX) / 2;
      for (let next = first; next <= last; next++) move(next, dx, 0);
      for (let next = last + 1; next < stages.length; next++) move(next, 0, row.maxY - oldBottom);
      first = last;
    }
  }
  if (stages.length) cursorY = stages.at(-1)!.bounds.maxY + padding + gap;
  const blockColumns = model.blocks.filter((block) => block.stages.length > 0);
  const blockPadding = blockColumns.length > 1 ? gap : padding;
  if (blockColumns.length > 1) {
    const top = Math.min(...stages.map((stage) => stage.bounds.minY)) - blockPadding;
    const blockBoxes = blockColumns.map((block) => enclose(block.stages.map((index) => stages[index].bounds), blockPadding));
    const height = Math.max(...blockBoxes.map((box) => box.maxY - box.minY));
    let left = internalX - padding;
    const bottom = top + height;
    const translateStage = (index: number, dx: number, dy: number) => {
      for (const id of model.stages[index].devices) {
        const device = placed.get(id)!;
        if (device.region === 'internal') placed.set(id, { ...device,
          ...place(device.symbol, [device.position[0] + dx, device.position[1] + dy], device.rotation) });
      }
      stages[index] = { ...stages[index], bounds: translateBounds(stages[index].bounds, [dx, dy]) };
    };
    for (const [column, block] of blockColumns.entries()) {
      const box = blockBoxes[column];
      const dy = top + (height - (box.maxY - box.minY)) / 2 - box.minY;
      for (const index of block.stages) translateStage(index, left - box.minX, dy);
      left += box.maxX - box.minX + pitch;
    }
    const ungrouped = stages.filter((stage) => stage.block === null);
    if (ungrouped.length) {
      const box = enclose(ungrouped.map((stage) => stage.bounds));
      const dx = (internalX - padding + left - pitch) / 2 - (box.minX + box.maxX) / 2;
      for (const stage of ungrouped) translateStage(stage.stage, dx, bottom + gap - box.minY);
    }
    cursorY = Math.max(...stages.map((stage) => stage.bounds.maxY)) + blockPadding + gap;
  }
  const nonemptyStages = stages.filter((stage) => stage.groups.length > 0);
  const conductionXs = [...placed.values()].filter((device) => isCmos(deviceById.get(device.id)!) && device.rotation === 0)
    .flatMap((device) => [device.terminals.D[0], device.terminals.S[0]]);
  const powerCenterX = conductionXs.length ? (Math.min(...conductionXs) + Math.max(...conductionXs)) / 2 : stageCenterX;
  if (supplies.length === 1) {
    const supply = placedNets.get(supplies[0].id)!;
    placedNets.set(supply.id, { ...supply, ...place('supplyNet', [powerCenterX - resolveSymbol('supplyNet').anchor![0], supplyY]) });
  }
  const outputCenterY = nonemptyStages.length ? (Math.min(...nonemptyStages.map((stage) => stage.bounds.minY))
    + Math.max(...nonemptyStages.map((stage) => stage.bounds.maxY))) / 2 : undefined;

  const groundNets = model.nets.filter((net) => netType(net.id) === 'ground');
  const occupiedRight = Math.max(internalX + pane, internalX + Math.max(0, groundNets.length - 1) * pitch + pane,
    ...[...placed.values(), ...placedNets.values()].map((symbol) => symbol.bounds.maxX), ...stages.map((stage) => stage.bounds.maxX));
  const inputTargets: { net: string; device: string; terminal: string; aligned: boolean }[] = [];
  for (const type of ['pinIn', 'pinOut'] as const) {
    let previousBottom = -gap;
    const nets = model.nets.filter((net) => netType(net.id) === type);
    for (const [index, net] of nets.entries()) {
      const column = (id: string) => blockColumns.length > 1
        ? model.stages[deviceById.get(id)!.stage].block ?? model.blocks.length : 0;
      const recipients = model.devices.flatMap((device) => device.terminals.filter((terminal) => netAt(device, terminal) === net.id)
        .map((terminal) => ({ device: device.id, terminal, point: placed.get(device.id)!.terminals[terminal] })))
        .sort((a, b) => (type === 'pinIn' ? column(a.device) - column(b.device) : 0)
          || a.point[1] - b.point[1] || a.point[0] - b.point[0] || declaration.get(a.device)! - declaration.get(b.device)!);
      const first = recipients[0], anchor = resolveSymbol(type).anchor!;
      let outputY = outputCenterY;
      if (type === 'pinOut' && (nets.length === 1 || appearances.size) && recipients.every((recipient) => recipient.terminal === 'D'
        && isCmos(deviceById.get(recipient.device)!) && placed.get(recipient.device)!.rotation === 0)) {
        const pullUp = recipients.filter((recipient) => isPmos(deviceById.get(recipient.device)!));
        const pullDown = recipients.filter((recipient) => isNmos(deviceById.get(recipient.device)!));
        const upper = Math.max(...pullUp.map((recipient) => recipient.point[1]));
        const lower = Math.min(...pullDown.map((recipient) => recipient.point[1]));
        if (pullUp.length && pullDown.length && upper < lower) outputY = (upper + lower) / 2;
      }
      const y = type === 'pinOut' && outputY !== undefined
        ? appearances.size ? Math.max(outputY - anchor[1], previousBottom + gap)
          : outputY + (index - (nets.length - 1) / 2) * pitch - anchor[1]
        : Math.max(0, Math.round(first?.point[1] ?? gap + anchor[1]) - anchor[1], previousBottom + (type === 'pinIn' ? pitch / 2 - pane : gap));
      const symbol: PlacedNet = { ...place(type, [type === 'pinIn' ? 0 : occupiedRight + gap, y]), id: net.id, region: type === 'pinIn' ? 'left' : 'right' };
      placedNets.set(net.id, symbol); previousBottom = symbol.bounds.maxY;
      if (type === 'pinIn' && first) inputTargets.push({ net: net.id, device: first.device, terminal: first.terminal,
        aligned: Math.abs(symbol.anchor![1] - first.point[1]) < 1e-6 });
    }
  }
  const bottomY = Math.max(cursorY, ...[...placed.values(), ...placedNets.values()].map((symbol) => symbol.bounds.maxY + gap));
  groundNets.forEach((net, index) => placedNets.set(net.id, { ...place('ground', [groundNets.length === 1
    ? powerCenterX - resolveSymbol('ground').anchor![0] : internalX + index * pitch, bottomY]), id: net.id, region: 'bottom' }));
  const blocks = model.blocks.map((block, index) => ({ block: index, stages: [...block.stages],
    bounds: block.stages.length ? enclose(block.stages.map((stage) => stages[stage].bounds), blockPadding) : null }));
  const boxes = [...placed.values(), ...placedNets.values()].map((symbol) => symbol.bounds)
    .concat(stages.map((stage) => stage.bounds), blocks.flatMap((block) => block.bounds ? [block.bounds] : []));
  return { devices: model.devices.map((device) => placed.get(device.id)!), nets: model.nets.flatMap((net) => placedNets.has(net.id) ? [placedNets.get(net.id)!] : []),
    stages, blocks, bounds: boxes.length ? enclose(boxes) : { minX: 0, minY: 0, maxX: 0, maxY: 0 }, inputTargets,
    unplacedNetIds: model.nets.filter((net) => net.type === 'pinInOut').map((net) => net.id), fallbackStages };
}

function layoutSections(model: CircuitModel, sweep = false): CircuitLayout {
  const scopes = model.blocks.flatMap((block, index) => block.stages.length ? [{ block: index as number | null, stages: block.stages }] : []);
  const ungrouped = model.stages.flatMap((stage, index) => stage.block === null ? [index] : []);
  if (ungrouped.length) scopes.push({ block: null, stages: ungrouped });
  const deviceScope = new Map(model.devices.map((device) => [device.id, scopes.findIndex((scope) => scope.stages.includes(device.stage))]));
  const memberships = new Map(model.nets.map((net) => [net.id, [...new Set(model.connections.filter((c) => c.net === net.id)
    .map((c) => deviceScope.get(c.device)!))].sort((a, b) => a - b)]));
  const locals = scopes.map((scope, scopeIndex) => {
    const devices = model.devices.filter((device) => scope.stages.includes(device.stage));
    const connections = model.connections.filter((connection) => deviceScope.get(connection.device) === scopeIndex);
    const nets = model.nets.filter((net) => memberships.get(net.id)!.includes(scopeIndex) || !memberships.get(net.id)!.length && scopeIndex === 0);
    const appearances = new Map<string, NetType>();
    for (const net of nets) {
      const members = memberships.get(net.id)!;
      if (members.length < 2 || net.type === 'supplyNet' || net.type === 'ground' || net.type === 'pinInOut') continue;
      if (net.implicit) throw new Error(`Section-boundary net ${net.id} requires an explicit net declaration for its label.`);
      appearances.set(net.id, scopeIndex === members[0] && net.type !== 'pinIn' ? 'pinOut' : 'pinIn');
    }
    const localModel: CircuitModel = { ...model, devices: devices.map((device) => ({ ...device, stage: scope.stages.indexOf(device.stage) })),
      connections, nets, blocks: [], stages: scope.stages.map((index, order) => ({ ...model.stages[index], block: null, order })) };
    const layout = layoutConnected(localModel, appearances, scope.block !== null, sweep);
    const symbols: PlacedNet[] = layout.nets.map((net) => ({ ...net, ...(scope.block !== null ? { block: scope.block } : {}),
      occurrence: `${scopeIndex}:${net.id}:${net.symbol}`, role: appearances.has(net.id) && model.nets.find((item) => item.id === net.id)!.type !== 'pinIn'
        ? 'boundary'
        : net.symbol === 'supplyNet' || net.symbol === 'ground' ? 'local' : 'external' }));
    let outputBottom = -Infinity;
    const outgoing = nets.filter((net) => {
      const members = memberships.get(net.id)!;
      return net.type !== 'pinIn' && members.length > 1 && symbols.some((symbol) => symbol.id === net.id && symbol.symbol === 'pinIn')
        && (scopeIndex !== members.at(-1) || net.type === 'pinOut');
    });
    const right = Math.max(...layout.stages.map((stage) => stage.bounds.maxX)) + 60;
    for (const net of outgoing) {
      const input = symbols.find((symbol) => symbol.id === net.id)!;
      let y = Math.max(input.position[1], outputBottom + 60);
      while (symbols.some((symbol) => symbol.region === 'right' && y < symbol.bounds.maxY + 60 && y + 120 > symbol.bounds.minY - 60)) y += 60;
      const symbol = place('pinOut', [right, y]);
      symbols.push({ ...symbol, id: net.id, region: 'right', ...(scope.block !== null ? { block: scope.block } : {}),
        occurrence: `${scopeIndex}:${net.id}:pinOut`, role: net.type === 'pinOut' && scopeIndex === memberships.get(net.id)!.at(-1) ? 'external' : 'boundary' });
      outputBottom = symbol.bounds.maxY;
    }
    const box = enclose(layout.devices.map((item) => item.bounds).concat(layout.stages.map((stage) => stage.bounds)), 360);
    return { scope, layout, symbols, box };
  });
  const height = Math.max(...locals.filter((item) => item.scope.block !== null).map((item) => item.box.maxY - item.box.minY));
  let left = 0;
  const devices: PlacedDevice[] = [], nets: PlacedNet[] = [], stages: StageLayout[] = [], sections: NonNullable<CircuitLayout['sections']>[number][] = [];
  const inputTargets: CircuitLayout['inputTargets'][number][] = [], fallbackStages: number[] = [];
  for (const { scope, layout, symbols, box } of locals) {
    const dx = scope.block === null ? -box.minX : left - box.minX;
    const dy = scope.block === null ? height + 120 - box.minY : (height - (box.maxY - box.minY)) / 2 - box.minY;
    const moved = <T extends PlacedGeometry>(item: T): T => ({ ...item,
      ...place(item.symbol, [item.position[0] + dx, item.position[1] + dy], item.rotation) });
    devices.push(...layout.devices.map((device) => ({ ...moved(device), stage: scope.stages[device.stage] })));
    nets.push(...symbols.map(moved));
    stages.push(...layout.stages.map((stage) => ({ ...stage, stage: scope.stages[stage.stage], block: scope.block, bounds: translateBounds(stage.bounds, [dx, dy]) })));
    sections.push({ ...scope, bounds: translateBounds(box, [dx, dy]) });
    inputTargets.push(...layout.inputTargets.filter((target) => model.nets.find((net) => net.id === target.net)!.type === 'pinIn'
      && !inputTargets.some((previous) => previous.net === target.net)));
    fallbackStages.push(...layout.fallbackStages.map((index) => scope.stages[index]));
    left += box.maxX - box.minX + 120;
  }
  return { sectional: true, sections, devices: model.devices.map((device) => devices.find((placed) => placed.id === device.id)!), nets,
    stages: stages.sort((a, b) => a.stage - b.stage), blocks: model.blocks.map((block, index) => ({ block: index, stages: block.stages,
      bounds: sections.find((section) => section.block === index)?.bounds ?? null })), bounds: enclose(sections.map((section) => section.bounds)),
    inputTargets, fallbackStages, unplacedNetIds: model.nets.filter((net) => net.type === 'pinInOut').map((net) => net.id) };
}
