import type { CircuitModel } from '../circuitTypes.js';
import type { Bounds, Point } from './geometry.js';
import { place, type CircuitLayout, type PlacedNet, type Rotation } from './layout.js';

export interface WireSegment { readonly a: Point; readonly b: Point }
export interface Attachment { readonly device?: string; readonly terminal?: string; readonly occurrence?: string; readonly point: Point }
interface LeadAttachment extends Attachment { stub: WireSegment; lead?: WireSegment[] }
export interface RoutedComponent {
  readonly block: number | null;
  readonly attachments: readonly Attachment[];
  readonly segments: readonly WireSegment[];
  readonly junctions: readonly Point[];
}
export interface RoutedNet {
  readonly components: readonly RoutedComponent[];
  readonly net: string;
  readonly attachments: readonly Attachment[];
  readonly segments: readonly WireSegment[];
  readonly junctions: readonly Point[];
}
export interface RouteBranch {
  readonly net: string;
  readonly kind: 'ordinary' | 'shared' | 'local';
  readonly segments: readonly WireSegment[];
  readonly bends: number;
  readonly crossings: number;
  readonly occurrence?: string;
}
export interface CircuitRouting {
  readonly layout: CircuitLayout;
  readonly branches: readonly RouteBranch[];
  readonly nets: readonly RoutedNet[];
  readonly crossings: readonly { readonly point: Point; readonly over: string; readonly under: string; readonly horizontal: boolean }[];
}

const epsilon = 1e-7;
const frameClearance = 20;
const gridPitch = 10;
const snap = (value: number) => Math.round(value / gridPitch) * gridPitch;
const near = (a: number, b: number) => Math.abs(a - b) < epsilon;
const equal = (a: Point, b: Point) => near(a[0], b[0]) && near(a[1], b[1]);
const horizontal = (s: WireSegment) => near(s.a[1], s.b[1]);
const distance = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const on = (p: Point, s: WireSegment) => Math.abs(distance(s.a, p) + distance(p, s.b) - distance(s.a, s.b)) < epsilon
  && (horizontal(s) ? near(p[1], s.a[1]) : near(p[0], s.a[0]));

export function routingQuality(routing: CircuitRouting): readonly [number, number, number] {
  let bends = 0, length = 0;
  for (const net of routing.nets) for (const component of net.components) {
    const vertices = new Map<string, boolean[]>();
    for (const segment of component.segments) {
      length += distance(segment.a, segment.b);
      for (const point of [segment.a, segment.b]) {
        const key = point.map((value) => value.toFixed(7)).join(',');
        vertices.set(key, [...vertices.get(key) ?? [], horizontal(segment)]);
      }
    }
    bends += [...vertices.values()].filter((directions) => directions.length === 2 && directions[0] !== directions[1]).length;
  }
  return [routing.crossings.length, bends, length];
}

function intersection(a: WireSegment, b: WireSegment): Point | undefined {
  if (horizontal(a) === horizontal(b)) return undefined;
  const h = horizontal(a) ? a : b, v = horizontal(a) ? b : a;
  const p: Point = [v.a[0], h.a[1]];
  return on(p, a) && on(p, b) ? p : undefined;
}

function overlap(a: WireSegment, b: WireSegment): boolean {
  if (horizontal(a) !== horizontal(b)) return false;
  const axis = horizontal(a) ? 0 : 1, other = 1 - axis;
  return near(a.a[other], b.a[other]) && Math.min(Math.max(a.a[axis], a.b[axis]), Math.max(b.a[axis], b.b[axis]))
    - Math.max(Math.min(a.a[axis], a.b[axis]), Math.min(b.a[axis], b.b[axis])) > epsilon;
}

function collinearTouch(a: WireSegment, b: WireSegment): boolean {
  return horizontal(a) === horizontal(b) && [a.a, a.b].some((p) => on(p, b));
}

function blocks(segment: WireSegment, box: Bounds): boolean {
  return horizontal(segment) ? segment.a[1] > box.minY - 6 && segment.a[1] < box.maxY + 6
    && Math.max(segment.a[0], segment.b[0]) > box.minX - 6 && Math.min(segment.a[0], segment.b[0]) < box.maxX + 6
    : segment.a[0] > box.minX - 6 && segment.a[0] < box.maxX + 6
    && Math.max(segment.a[1], segment.b[1]) > box.minY - 6 && Math.min(segment.a[1], segment.b[1]) < box.maxY + 6;
}

function crowdsFrame(segment: WireSegment, box: Bounds): boolean {
  const axis = horizontal(segment) ? 0 : 1;
  const low = axis === 0 ? box.minX : box.minY, high = axis === 0 ? box.maxX : box.maxY;
  const sides = axis === 0 ? [box.minY, box.maxY] : [box.minX, box.maxX];
  return Math.max(segment.a[axis], segment.b[axis]) > low && Math.min(segment.a[axis], segment.b[axis]) < high
    && sides.some((side) => Math.abs(segment.a[1 - axis] - side) < frameClearance - epsilon);
}

function escape(point: Point, box: Bounds): Point {
  const sides = [Math.abs(point[0] - box.minX), Math.abs(point[0] - box.maxX), Math.abs(point[1] - box.minY), Math.abs(point[1] - box.maxY)];
  const side = sides.indexOf(Math.min(...sides));
  if (sides[side] > epsilon) throw new Error(`Attachment ${point} is not on its symbol pane boundary.`);
  return side === 0 ? [point[0] - 30, point[1]] : side === 1 ? [point[0] + 30, point[1]]
    : side === 2 ? [point[0], point[1] - 30] : [point[0], point[1] + 30];
}

function simplify(points: Point[]): WireSegment[] {
  const result: WireSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const next = { a: points[i - 1], b: points[i] };
    if (equal(next.a, next.b)) continue;
    const last = result.at(-1);
    if (last && horizontal(last) === horizontal(next)) result[result.length - 1] = { a: last.a, b: next.b };
    else result.push(next);
  }
  return result;
}

function split(segments: readonly WireSegment[], attachments: readonly Attachment[]): WireSegment[] {
  const points = [...attachments.map((item) => item.point), ...segments.flatMap((s) => [s.a, s.b])];
  for (let i = 0; i < segments.length; i++) for (const other of segments.slice(i + 1)) {
    const p = intersection(segments[i], other);
    if (p) points.push(p);
  }
  const result: WireSegment[] = [];
  for (const segment of segments) {
    const cuts = points.filter((p) => on(p, segment)).sort((a, b) => distance(segment.a, a) - distance(segment.a, b));
    for (let i = 1; i < cuts.length; i++) if (!equal(cuts[i - 1], cuts[i])) {
      const next = { a: cuts[i - 1], b: cuts[i] };
      if (!result.some((s) => equal(s.a, next.a) && equal(s.b, next.b) || equal(s.a, next.b) && equal(s.b, next.a))) result.push(next);
    }
  }
  return result;
}

class Queue {
  private items: { state: number; cost: number; priority: number }[] = [];
  private before(a: { state: number; cost: number; priority: number }, b: { state: number; cost: number; priority: number }): boolean {
    return a.priority < b.priority || a.priority === b.priority && (a.cost > b.cost || a.cost === b.cost && a.state < b.state);
  }
  push(item: { state: number; cost: number; priority: number }): void {
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(item, this.items[parent])) break;
      this.items[i] = this.items[parent]; i = parent;
    }
    this.items[i] = item;
  }
  pop(): { state: number; cost: number; priority: number } | undefined {
    const root = this.items[0], last = this.items.pop();
    if (this.items.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.before(this.items[child + 1], this.items[child])) child++;
        if (!this.before(this.items[child], last)) break;
        this.items[i] = this.items[child]; i = child;
      }
      this.items[i] = last;
    }
    return root;
  }
}

export function routeCircuit(model: CircuitModel, layout: CircuitLayout): CircuitRouting {
  if (!layout.sectional) return routeConnected(model, layout);
  for (const connection of model.connections) {
    const device = layout.devices.find((device) => device.id === connection.device);
    if (!device?.terminals[connection.terminal] || layout.sections!.filter((section) => section.stages.includes(device.stage)).length !== 1)
      throw new Error(`Missing sectional attachment for ${connection.device}.${connection.terminal} on net ${connection.net}.`);
  }
  const routes = layout.sections!.map((section, index) => {
    const devices = layout.devices.filter((device) => section.stages.includes(device.stage));
    const ids = new Set(devices.map((device) => device.id));
    const connections = model.connections.filter((connection) => ids.has(connection.device));
    const nets = layout.nets.filter((net) => (net.block ?? null) === section.block);
    const netIds = new Set([...connections.map((connection) => connection.net), ...nets.map((net) => net.id)]);
    const localModel = { ...model, devices: model.devices.filter((device) => ids.has(device.id)), connections, nets: model.nets.filter((net) => netIds.has(net.id) || index === 0 && !model.connections.some((connection) => connection.net === net.id)) };
    const localLayout = { ...layout, sectional: undefined, devices, nets, blocks: [], stages: layout.stages.filter((stage) => section.stages.includes(stage.stage)), bounds: section.bounds,
      inputTargets: layout.inputTargets.filter((target) => ids.has(target.device)) };
    const routed = routeConnected(localModel, localLayout, section.bounds);
    for (const net of routed.nets) if (net.segments.some((segment) => [segment.a, segment.b].some((point) =>
      point[0] < section.bounds.minX + frameClearance || point[0] > section.bounds.maxX - frameClearance
      || point[1] < section.bounds.minY + frameClearance || point[1] > section.bounds.maxY - frameClearance)))
      throw new Error(`Net ${net.net} escapes section ${section.block ?? 'ungrouped'}.`);
    return { block: section.block, routed };
  });
  return { layout: { ...layout, nets: routes.flatMap(({ routed }) => routed.layout.nets) }, branches: routes.flatMap(({ routed }) => routed.branches), nets: model.nets.map((net) => {
    const components = routes.flatMap(({ block, routed }) => routed.nets.filter((item) => item.net === net.id)
      .flatMap((item) => item.components.map((component) => ({ ...component, block }))));
    if (!components.length) throw new Error(`No sectional route for net ${net.id}.`);
    if (components.length > 1 && components.some((component) => !component.attachments.some((attachment) => attachment.occurrence)))
      throw new Error(`Net ${net.id} has a section without a named endpoint.`);
    return { net: net.id, components, attachments: components.flatMap((component) => component.attachments),
      segments: components.flatMap((component) => component.segments), junctions: components.flatMap((component) => component.junctions) };
  }), crossings: routes.flatMap(({ routed }) => routed.crossings) };
}

function routeConnected(model: CircuitModel, layout: CircuitLayout, limit?: Bounds): CircuitRouting {
  if (layout.unplacedNetIds.length) throw new Error(`Unsupported pinInOut placement: ${layout.unplacedNetIds.join(', ')}.`);
  const pins: PlacedNet[] = [];
  const panes = [...layout.devices] as (CircuitLayout['devices'][number] | PlacedNet)[];
  const frames = layout.stages.map((stage) => stage.bounds);
  const entries = model.nets.map((net) => ({ net, endpoints: model.connections.filter((c) => c.net === net.id).map((c): LeadAttachment => {
    const device = layout.devices.find((d) => d.id === c.device);
    const point = device?.terminals[c.terminal];
    if (!device || !point) throw new Error(`Missing attachment ${c.device}.${c.terminal} on net ${net.id}.`);
    return { device: c.device, terminal: c.terminal, point, stub: { a: point, b: escape(point, device.bounds) } };
  }).sort((a, b) => model.devices.findIndex((d) => d.id === a.device) - model.devices.findIndex((d) => d.id === b.device)
    || model.devices.find((d) => d.id === a.device)!.terminals.indexOf(a.terminal!) - model.devices.find((d) => d.id === b.device)!.terminals.indexOf(b.terminal!)) }));
  for (const entry of entries) for (const endpoint of entry.endpoints) {
    if (!endpoint.device || horizontal(endpoint.stub)) continue;
    const device = layout.devices.find((device) => device.id === endpoint.device)!;
    const frame = layout.stages.find((stage) => stage.stage === device.stage)?.bounds;
    if (!frame) continue;
    const direction = Math.sign(endpoint.stub.b[1] - endpoint.point[1]);
    const edge = direction < 0 ? frame.minY : frame.maxY;
    if (Math.abs(edge - endpoint.point[1]) > 30 + epsilon) continue;
    const candidates = Array.from({ length: 25 }, (_, index) => snap(edge) + (index - 12) * gridPitch)
      .filter((value) => (value - edge) * direction >= frameClearance)
      .sort((a, b) => Math.abs(a - edge) - Math.abs(b - edge));
    endpoint.stub = { a: endpoint.point, b: [endpoint.point[0], candidates[0]] };
  }
  const stubs = entries.flatMap((entry) => entry.endpoints.map((endpoint) => ({ net: entry.net.id, endpoint })));
  for (const { net, endpoint } of stubs) {
    const conflicts = (stub: WireSegment) => stubs.some((other) => other.net !== net
      && (overlap(stub, other.endpoint.stub) || collinearTouch(stub, other.endpoint.stub) || intersection(stub, other.endpoint.stub)));
    if (!conflicts(endpoint.stub)) continue;
    const axis = horizontal(endpoint.stub) ? 0 : 1, origin = endpoint.point[axis];
    const candidates = Array.from({ length: 25 }, (_, index) => snap(origin) + (index - 12) * gridPitch)
      .filter((value) => Math.abs(value - origin) > 6 && Math.abs(value - origin) < 30
        && Math.sign(value - origin) === Math.sign(endpoint.stub.b[axis] - origin))
      .sort((a, b) => Math.abs(b - origin) - Math.abs(a - origin));
    for (const value of candidates) {
      const b: Point = axis === 0 ? [value, endpoint.point[1]] : [endpoint.point[0], value];
      const stub = { a: endpoint.point, b };
      if (!conflicts(stub)) { endpoint.stub = stub; break; }
    }
  }
  const buses: { net: string; endpoints: typeof entries[number]['endpoints']; segment: WireSegment }[] = [];
  function addRail(entry: typeof entries[number], endpoints: typeof entries[number]['endpoints'], top: boolean): void {
    const edge = top ? Math.min(...endpoints.map((endpoint) => endpoint.point[1])) : Math.max(...endpoints.map((endpoint) => endpoint.point[1]));
    const y = snap(edge + (top ? -60 : 60));
    for (const endpoint of endpoints) endpoint.stub = { a: endpoint.point, b: [endpoint.point[0], y] };
    const segment: WireSegment = {
      a: [Math.min(...endpoints.map((endpoint) => snap(endpoint.point[0]))), y],
      b: [Math.max(...endpoints.map((endpoint) => snap(endpoint.point[0]))), y],
    };
    if (panes.some((pane) => blocks(segment, pane.bounds))
      || endpoints.some((endpoint) => panes.some((pane) => pane.id !== endpoint.device && blocks(endpoint.stub, pane.bounds)))
      || [segment, ...endpoints.map((endpoint) => endpoint.stub)].some((wire) => frames.some((frame) => crowdsFrame(wire, frame))))
      throw new Error(`Cannot route net ${entry.net.id} through a common parallel rail without a symbol collision or frame clearance violation.`);
    buses.push({ net: entry.net.id, endpoints, segment });
  }
  for (const stage of layout.stages) for (const group of stage.groups) {
    const devices = group.devices.map((id) => layout.devices.find((device) => device.id === id)!);
    if (group.topology !== 'parallel' || group.direction !== 'LR' || devices.length < 2
      || !devices.every((device) => device.rotation === 0)
      || !(['pmos', 'nmos'] as const).some((family) => devices.every((device) => device.symbol === family || device.symbol === `${family}Blk`))) continue;
    for (const terminal of ['D', 'S']) {
      const entry = entries.find((entry) => devices.every((device) => entry.endpoints.some((endpoint) => endpoint.device === device.id && endpoint.terminal === terminal)));
      if (!entry) continue;
      const endpoints = entry.endpoints.filter((endpoint) => group.devices.includes(endpoint.device!) && endpoint.terminal === terminal);
      addRail(entry, endpoints, near(endpoints[0].point[1], devices[0].bounds.minY));
    }
  }
  {
    const chains = layout.stages.filter((stage) => stage.groups.length === 1 && stage.groups[0].topology === 'series'
      && stage.groups[0].direction === 'TB' && stage.groups[0].devices.every((id) => {
        const device = layout.devices.find((device) => device.id === id)!;
        return device.rotation === 0 && ['nmos', 'nmosBlk'].includes(device.symbol);
      }));
    const rows = new Map<number, typeof chains>();
    for (const chain of chains) rows.set(chain.bounds.minY, [...(rows.get(chain.bounds.minY) ?? []), chain]);
    for (const row of rows.values()) if (row.length > 1) for (const terminal of ['D', 'S']) {
      const ids = row.map((stage) => terminal === 'D' ? stage.groups[0].devices[0] : stage.groups[0].devices.at(-1)!);
      const entry = entries.find((entry) => ids.every((id) => entry.endpoints.some((endpoint) => endpoint.device === id && endpoint.terminal === terminal)));
      if (!entry) throw new Error('Parallel series branches have no common rail.');
      addRail(entry, entry.endpoints.filter((endpoint) => ids.includes(endpoint.device!) && endpoint.terminal === terminal), terminal === 'D');
    }
  }
  for (const entry of entries) for (const endpoint of entry.endpoints) {
    const axis = horizontal(endpoint.stub) ? 0 : 1, other = 1 - axis;
    const direction = Math.sign(endpoint.stub.b[axis] - endpoint.point[axis]);
    const end = endpoint.stub.b.map((value, index) => index === axis
      ? (direction > 0 ? Math.ceil(value / gridPitch) : Math.floor(value / gridPitch)) * gridPitch : snap(value)) as unknown as Point;
    const lengths = [distance(endpoint.point, endpoint.stub.b), 30, 40, 50, 60].filter((length) => length <= 60);
    let lead: WireSegment[] | undefined;
    for (const length of lengths) {
      const bridge = [...endpoint.point] as [number, number];
      bridge[axis] = (direction > 0 ? Math.ceil((bridge[axis] + length) / gridPitch) : Math.floor((bridge[axis] - length) / gridPitch)) * gridPitch;
      const track = [...bridge] as [number, number]; track[other] = end[other];
      const finish = buses.some((bus) => bus.endpoints.includes(endpoint)) ? end : track;
      const candidate = simplify([endpoint.point, bridge, track, finish]);
      if (candidate.some((segment) => panes.some((pane) => !(equal(segment.a, endpoint.point)
        && (endpoint.device ? pane.id === endpoint.device : pane.anchor && equal(pane.anchor, endpoint.point))) && blocks(segment, pane.bounds))
        || frames.some((frame) => crowdsFrame(segment, frame)))) continue;
      lead = candidate; break;
    }
    if (!lead?.length) throw new Error(`Cannot route net ${entry.net.id}: attachment ${endpoint.device ?? entry.net.id}.${endpoint.terminal ?? 'anchor'} cannot reach the routing grid.`);
    endpoint.lead = lead; endpoint.stub = lead.at(-1)!;
  }
  return resolveRoutes(model, layout, limit, pins, panes, frames, entries, buses);
}

export function sharingBudget(bends: number, crossings: number): boolean {
  return bends >= 0 && crossings >= 0 && bends <= 2 && crossings <= 2 && bends + crossings <= 3;
}

export function pinNearby(pin: Bounds, device: Bounds): boolean {
  return Math.abs((pin.minX + pin.maxX - device.minX - device.maxX) / 2) <= 600 + epsilon
    && Math.abs((pin.minY + pin.maxY - device.minY - device.maxY) / 2) <= 480 + epsilon;
}

const intersectsBox = (a: Bounds, b: Bounds) => a.minX < b.maxX - epsilon && a.maxX > b.minX + epsilon
  && a.minY < b.maxY - epsilon && a.maxY > b.minY + epsilon;

export function pinClearance(pin: Bounds, devices: readonly Bounds[], occupied: readonly Bounds[] = devices): boolean {
  if (occupied.some((box) => intersectsBox(pin, box))) return false;
  return devices.every((device) => {
    const dx = pin.minX - device.minX, dy = pin.minY - device.minY;
    const emptySquare = (axis: 0 | 1): boolean => {
      const delta = axis === 0 ? dx : dy;
      if (Math.abs(delta) < 240 - epsilon) return false;
      const low = axis === 0 ? Math.min(device.maxX, pin.maxX) : Math.min(device.maxY, pin.maxY);
      const high = axis === 0 ? Math.max(device.minX, pin.minX) - 120 : Math.max(device.minY, pin.minY) - 120;
      const positions = [low, high];
      for (let p = low + 120; p < high; p += 120) positions.push(p);
      return positions.some((p) => (axis === 0 ? [device.minY, pin.minY] : [device.minX, pin.minX]).some((q) => {
        const square = axis === 0 ? { minX: p, maxX: p + 120, minY: q, maxY: q + 120 } : { minX: q, maxX: q + 120, minY: p, maxY: p + 120 };
        return !occupied.some((box) => intersectsBox(square, box));
      }));
    };
    if (Math.abs(dx) < 120 - epsilon) return emptySquare(1);
    if (Math.abs(dy) < 120 - epsilon) return emptySquare(0);
    if (Math.abs(dx) >= 240 - epsilon || Math.abs(dy) >= 240 - epsilon) return true;
    const horizontalNeighbor = { ...device, minX: device.minX + Math.sign(dx) * 120, maxX: device.maxX + Math.sign(dx) * 120 };
    const verticalNeighbor = { ...device, minY: device.minY + Math.sign(dy) * 120, maxY: device.maxY + Math.sign(dy) * 120 };
    return !occupied.some((box) => box !== device && (intersectsBox(box, horizontalNeighbor) || intersectsBox(box, verticalNeighbor)));
  });
}

const bendCount = (segments: readonly WireSegment[]) => segments.slice(1).filter((s, i) => horizontal(s) !== horizontal(segments[i])).length;
const pathLength = (segments: readonly WireSegment[]) => segments.reduce((sum, s) => sum + distance(s.a, s.b), 0);
function crossingCount(a: readonly WireSegment[], b: readonly WireSegment[]): number {
  const points = new Set<string>();
  for (const s of a) for (const t of b) {
    const p = intersection(s, t);
    if (p) points.add(p.map((v) => v.toFixed(7)).join(','));
  }
  return points.size;
}

type Entry = { net: CircuitModel['nets'][number]; endpoints: LeadAttachment[] };
type Bus = { net: string; endpoints: LeadAttachment[]; segment: WireSegment };
type VisualComponent = { attachments: Attachment[]; segments: WireSegment[]; pin?: PlacedNet };
type PlannedBranch = Omit<RouteBranch, 'crossings'>;

function resolveRoutes(model: CircuitModel, layout: CircuitLayout, limit: Bounds | undefined, pins: PlacedNet[],
  panes: (CircuitLayout['devices'][number] | PlacedNet)[], frames: Bounds[], entries: Entry[], buses: Bus[]): CircuitRouting {
  const components = new Map<string, VisualComponent[]>();
  const branches: PlannedBranch[] = [];
  const deviceBoxes = layout.devices.map((d) => d.bounds);
  const area = limit ?? { minX: layout.bounds.minX - 720, minY: layout.bounds.minY - 600, maxX: layout.bounds.maxX + 720, maxY: layout.bounds.maxY + 600 };
  const within = (p: Point) => p[0] >= area.minX + 20 && p[0] <= area.maxX - 20 && p[1] >= area.minY + 20 && p[1] <= area.maxY - 20;
  const wires = (net: string) => [...components].filter(([id]) => id !== net).flatMap(([, groups]) => groups.flatMap((c) => c.segments));
  const reserved = (net: string) => [...entries.filter((e) => e.net.id !== net).flatMap((e) => e.endpoints.flatMap((p) => p.lead!)),
    ...buses.filter((b) => b.net !== net).map((b) => b.segment)];
  const report = (net: string, attachments: readonly Attachment[], reason: string): never => {
    const context = attachments.filter((a) => a.device).map((a) => {
      const device = layout.devices.find((d) => d.id === a.device)!;
      return `${a.device}.${a.terminal} (stage ${device.stage}, block ${model.stages[device.stage]?.block ?? 'ungrouped'})`;
    }).join(', ');
    throw new Error(`Cannot route net ${net}: ${context}; ${reason}.`);
  };
  function validPath(net: string, path: readonly WireSegment[], kind: RouteBranch['kind'], own: readonly Point[], extra?: PlacedNet): boolean {
    const bends = bendCount(path), other = wires(net), crossings = crossingCount(path, [...other, ...reserved(net)]);
    if (kind === 'shared' ? !sharingBudget(bends, crossings) : bends + crossings > 5) return false;
    const obstacles = extra ? [...panes, extra] : panes;
    for (const segment of path) {
      if (!within(segment.a) || !within(segment.b)) return false;
      if (!horizontal(segment) && !near(segment.a[0], segment.b[0])) return false;
      if (obstacles.some((pane) => blocks(segment, pane.bounds) && !own.some((p) =>
        (equal(segment.a, p) || equal(segment.b, p)) && (pane.anchor ? equal(pane.anchor, p) : Object.values(pane.terminals).some((t) => equal(t, p)))))) return false;
      if (kind === 'ordinary' && frames.some((frame) => crowdsFrame(segment, frame))) return false;
      for (const wire of [...other, ...reserved(net)]) {
        const cross = intersection(segment, wire);
        if (overlap(segment, wire) || collinearTouch(segment, wire) || cross &&
          (distance(cross, wire.a) < 8 || distance(cross, wire.b) < 8 || distance(cross, segment.a) < 8 || distance(cross, segment.b) < 8)) return false;
      }
    }
    // Later branches must not invalidate the complexity of an earlier branch.
    for (const branch of branches) if (branch.net !== net) {
      const c = crossingCount(branch.segments, [...wires(branch.net), ...path]);
      if (branch.kind === 'shared' ? !sharingBudget(branch.bends, c) : branch.bends + c > 5) return false;
    }
    return true;
  }
  function goals(tree: readonly WireSegment[]): Point[] {
    const result: Point[] = [];
    for (const s of tree) {
      const axis = horizontal(s) ? 0 : 1;
      if (!near(s.a[1 - axis], snap(s.a[1 - axis]))) continue;
      for (let value = Math.ceil(Math.min(s.a[axis], s.b[axis]) / 10) * 10; value <= Math.max(s.a[axis], s.b[axis]) + epsilon; value += 10)
        result.push(axis === 0 ? [value, s.a[1]] : [s.a[0], value]);
    }
    return result.filter((p, i) => result.findIndex((q) => equal(p, q)) === i);
  }
  function trunkGoals(net: string, group: VisualComponent): Point[] {
    const available = group.attachments.length === 1 && !group.pin ? [group.segments.at(-1)!.b] : goals(group.segments);
    return available.filter((p) => !buses.filter((bus) => bus.net === net).some((bus) =>
      bus.endpoints.some((endpoint) => endpoint.lead!.some((segment) => on(p, segment))) && !on(p, bus.segment)));
  }
  function candidates(net: string, lead: readonly WireSegment[], tree: readonly WireSegment[], kind: RouteBranch['kind'],
    own: readonly Point[], tail: readonly WireSegment[] = [], extra?: PlacedNet, targetPoints?: Point[]): WireSegment[] | undefined {
    const start = lead.at(-1)!.b;
    const targets = targetPoints ?? (tail.length ? [tail[0].a] : goals(tree));
    let best: WireSegment[] | undefined, score: number[] | undefined;
    const other = [...wires(net), ...reserved(net)];
    const consider = (points: Point[]) => {
      const middle = simplify(points), path = [...lead, ...middle, ...tail];
      // A branch meets its trunk once, at its destination; it cannot double back.
      if (path.some((s, i) => i > 0 && overlap(path[i - 1], s))) return;
      const end = points.at(-1)!;
      if (!tail.length && middle.some((s) => tree.some((t) => overlap(s, t) || (() => { const p = intersection(s, t); return p && !equal(p, end); })()))) return;
      const b = bendCount(path), c = crossingCount(path, other);
      if (kind === 'shared' ? !sharingBudget(b, c) : b + c > 5) return;
      const next = [c, b, pathLength(path)];
      if (score && !next.some((v, i) => v < score![i] && next.slice(0, i).every((p, j) => p === score![j]))) return;
      if (!validPath(net, path, kind, own, extra)) return;
      best = path; score = next;
    };
    for (const end of targets) {
      if (near(start[0], end[0]) || near(start[1], end[1])) consider([start, end]);
      consider([start, [end[0], start[1]], end]);
      consider([start, [start[0], end[1]], end]);
    }
    if (score && score[0] === 0 && score[1] <= 1) return best;
    const xChannels = new Set<number>([start[0], ...targets.map((p) => p[0])]);
    const yChannels = new Set<number>([start[1], ...targets.map((p) => p[1])]);
    for (const pane of panes) {
      xChannels.add(Math.floor((pane.bounds.minX - 10) / 10) * 10); xChannels.add(Math.ceil((pane.bounds.maxX + 10) / 10) * 10);
      yChannels.add(Math.floor((pane.bounds.minY - 10) / 10) * 10); yChannels.add(Math.ceil((pane.bounds.maxY + 10) / 10) * 10);
    }
    if (kind === 'shared') {
      for (let x = Math.ceil((area.minX + 20) / 10) * 10; x <= area.maxX - 20; x += 10) xChannels.add(x);
      for (let y = Math.ceil((area.minY + 20) / 10) * 10; y <= area.maxY - 20; y += 10) yChannels.add(y);
    }
    for (const end of targets) {
      for (const x of xChannels) consider([start, [x, start[1]], [x, end[1]], end]);
      for (const y of yChannels) consider([start, [start[0], y], [end[0], y], end]);
    }
    return best;
  }
  function addBranch(net: string, group: VisualComponent, path: WireSegment[], kind: RouteBranch['kind'], occurrence?: string): void {
    group.segments.push(...path);
    branches.push({ net, kind, occurrence, segments: path, bends: bendCount(path) });
  }
  function newPin(entry: Entry, group: VisualComponent, endpoint: LeadAttachment, maximum = 5): boolean {
    const net = entry.net;
    const preference = layout.nets.find((p) => p.id === net.id);
    const symbol = preference?.symbol ?? 'pinIn';
    const device = layout.devices.find((d) => d.id === endpoint.device)!;
    const rotations: Rotation[] = symbol === 'pinIn' || symbol === 'pinOut' ? [0, 90, 180, 270] : [0];
    const locations: Point[] = [];
    if (preference) locations.push(preference.position);
    // Continuous tile offsets retain the device's phase; anchor-aligned tracks follow.
    for (let radius = 2; radius <= 5; radius++) {
      locations.push([device.position[0] - radius * 120, device.position[1]], [device.position[0] + radius * 120, device.position[1]],
        [device.position[0], device.position[1] - radius * 120], [device.position[0], device.position[1] + radius * 120]);
      for (let x = -radius; x <= radius; x++) for (let y = -Math.min(radius, 4); y <= Math.min(radius, 4); y++)
        if (Math.max(Math.abs(x), Math.abs(y)) === radius || radius === 2 && Math.abs(x) === 1 && Math.abs(y) === 1)
          locations.push([device.position[0] + x * 120, device.position[1] + y * 120]);
    }
    const anchorTargets = [endpoint.point, ...group.segments.map((s): Point => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2])];
    const tileLocations = [...locations];
    for (const target of anchorTargets) for (const position of tileLocations) {
      locations.push([position[0], target[1] - 60], [target[0] - 60, position[1]]);
    }
    const targets = trunkGoals(net.id, group);
    const ordered = locations.filter((p, i) => locations.findIndex((q) => equal(p, q)) === i);
    let selected: { pin: PlacedNet; path: WireSegment[]; score: number[] } | undefined;
    for (const position of ordered) for (const rotation of rotations) {
      const pin: PlacedNet = { ...place(symbol, position, rotation), id: net.id, region: preference?.region ?? 'left',
        block: preference?.block ?? model.stages[device.stage]?.block ?? undefined, role: preference?.role ?? 'local', occurrence: `${preference?.block ?? model.stages[device.stage]?.block ?? 'global'}:${net.id}:${pins.filter((p) => p.id === net.id).length}` };
      if (selected && selected.score[0] === 0 && selected.score[1] === 0 && targets.length) {
        const anchor = pin.anchor!, outward = escape(anchor, pin.bounds), horizontalLead = near(anchor[1], outward[1]);
        const minimumBends = targets.some((target) => horizontalLead ? near(anchor[1], target[1]) : near(anchor[0], target[0])) ? 0 : 1;
        const minimumLength = Math.min(...targets.map((target) => distance(anchor, target)));
        if (minimumBends > selected.score[2] || minimumBends === selected.score[2] && (minimumLength > selected.score[3] + epsilon
          || near(minimumLength, selected.score[3]) && (rotation === 0 ? 0 : 1) >= selected.score[4])) continue;
      }
      if (group.attachments.some((a) => a.device && !pinNearby(pin.bounds, layout.devices.find((d) => d.id === a.device)!.bounds)) || !pinNearby(pin.bounds, device.bounds) || !pinClearance(pin.bounds, deviceBoxes, panes.map((p) => p.bounds))
        || !within([pin.bounds.minX, pin.bounds.minY]) || !within([pin.bounds.maxX, pin.bounds.maxY])) continue;
      if (pins.some((existing) => !pinClearance(existing.bounds, deviceBoxes, [...panes.filter((p) => p !== existing).map((p) => p.bounds), pin.bounds]))) continue;
      if (symbol === 'pinIn' || symbol === 'pinOut') {
        const corners = [pin.transform.apply([symbol === 'pinIn' ? 44 : 4, 42]), pin.transform.apply([symbol === 'pinIn' ? 116 : 76, 78])];
        const body = { minX: Math.min(...corners.map((p) => p[0])) - 2, maxX: Math.max(...corners.map((p) => p[0])) + 2,
          minY: Math.min(...corners.map((p) => p[1])) - 2, maxY: Math.max(...corners.map((p) => p[1])) + 2 };
        const borders = [...frames, ...layout.blocks.flatMap((block) => block.bounds ? [block.bounds] : [])].flatMap((b): WireSegment[] => [
          { a: [b.minX, b.minY], b: [b.maxX, b.minY] }, { a: [b.minX, b.maxY], b: [b.maxX, b.maxY] },
          { a: [b.minX, b.minY], b: [b.minX, b.maxY] }, { a: [b.maxX, b.minY], b: [b.maxX, b.maxY] },
        ]);
        if (borders.some((border) => horizontal(border) ? border.a[1] > body.minY && border.a[1] < body.maxY && Math.max(border.a[0], border.b[0]) > body.minX && Math.min(border.a[0], border.b[0]) < body.maxX
          : border.a[0] > body.minX && border.a[0] < body.maxX && Math.max(border.a[1], border.b[1]) > body.minY && Math.min(border.a[1], border.b[1]) < body.maxY)) continue;
      }
      if ([...components.values()].flatMap((groups) => groups.flatMap((c) => c.segments)).some((s) => blocks(s, pin.bounds))
        || reserved(net.id).some((s) => blocks(s, pin.bounds))) continue;
      const point = pin.anchor!, escaped = escape(point, pin.bounds);
      const axis = near(point[0], escaped[0]) ? 1 : 0;
      const track: Point = [snap(escaped[0]), snap(escaped[1])];
      const corner: Point = axis === 0 ? [track[0], point[1]] : [point[0], track[1]];
      const lead = simplify([point, corner, track]);
      const path = candidates(net.id, lead, group.segments, 'local', [point], [], pin, targets);
      if (!path) continue;
      const complexity = bendCount(path) + crossingCount(path, [...wires(net.id), ...reserved(net.id)]);
      if (complexity > maximum) continue;
      const score = [Number(complexity > 3), crossingCount(path, [...wires(net.id), ...reserved(net.id)]), bendCount(path), pathLength(path), rotation === 0 ? 0 : 1];
      if (!selected || score.some((v, i) => v < selected!.score[i] && score.slice(0, i).every((p, j) => p === selected!.score[j]))) selected = { pin, path, score };
      if (selected.score[0] === 0 && selected.score[1] === 0 && selected.score[2] === 0) break;
    }
    if (!selected) return false;
    pins.push(selected.pin); panes.push(selected.pin); group.pin = selected.pin;
    group.attachments.push({ point: selected.pin.anchor!, occurrence: selected.pin.occurrence });
    addBranch(net.id, group, selected.path, 'local', selected.pin.occurrence);
    return true;
  }

  for (const entry of entries) {
    const groups: VisualComponent[] = [];
    components.set(entry.net.id, groups);
    const rails = buses.filter((b) => b.net === entry.net.id);
    const units = [...rails.map((bus) => ({ attachments: bus.endpoints, segments: [bus.segment, ...bus.endpoints.flatMap((e) => e.lead!)] })),
      ...entry.endpoints.filter((e) => !rails.some((b) => b.endpoints.includes(e))).map((e) => ({ attachments: [e], segments: e.lead! }))];
    for (const unit of units) {
      const endpoint = unit.attachments[0];
      const options = groups.flatMap((group, order) => {
        if (group.pin && unit.attachments.some((a) => !pinNearby(group.pin!.bounds, layout.devices.find((d) => d.id === a.device)!.bounds))) return [];
        const kind = group.pin ? 'shared' as const : 'ordinary' as const;
        const path = candidates(entry.net.id, endpoint.lead!, group.segments, kind, [endpoint.point], [], undefined, trunkGoals(entry.net.id, group));
        if (!path || !group.pin && bendCount(path) + crossingCount(path, [...wires(entry.net.id), ...reserved(entry.net.id)]) > 3) return [];
        return [{ group, path, kind, score: [crossingCount(path, [...wires(entry.net.id), ...reserved(entry.net.id)]), bendCount(path), pathLength(path), order] }];
      }).sort((a, b) => a.score.reduce((result, value, i) => result || value - b.score[i], 0));
      const selected = options[0];
      if (selected) {
        selected.group.attachments.push(...unit.attachments);
        addBranch(entry.net.id, selected.group, selected.path, selected.kind, selected.group.pin?.occurrence);
        if (unit.attachments.length > 1) selected.group.segments.push(...unit.segments);
        continue;
      }
      if (entry.net.implicit && groups.length) {
        const path = routeOrdinaryBranch(endpoint.lead!, groups[0].segments, panes, frames, area,
          [...wires(entry.net.id), ...reserved(entry.net.id)], (path) => validPath(entry.net.id, path, 'ordinary', [endpoint.point]));
        if (!path) report(entry.net.id, unit.attachments, 'no continuous route within B + C ≤ 5');
        groups[0].attachments.push(...unit.attachments);
        addBranch(entry.net.id, groups[0], path!, 'ordinary');
        if (unit.attachments.length > 1) groups[0].segments.push(...unit.segments);
        continue;
      }
      const group: VisualComponent = { attachments: [...unit.attachments], segments: [...unit.segments] };
      if (entry.endpoints.length > 1 || layout.nets.some((p) => p.id === entry.net.id)) {
        for (const segments of unit.attachments.length > 1 ? [unit.segments.slice(0, 1), ...unit.attachments.map((e) => e.lead!)] : [unit.segments]) {
          const bends = bendCount(segments), crossings = crossingCount(segments, [...wires(entry.net.id), ...reserved(entry.net.id)]);
          if (bends + crossings > 5) report(entry.net.id, unit.attachments, 'attachment or common rail exceeds B + C ≤ 5');
          branches.push({ net: entry.net.id, kind: 'ordinary', segments, bends });
        }
      }
      const needsPin = layout.nets.some((p) => p.id === entry.net.id) || groups.length > 0;
      if (needsPin) {
        let placed = newPin(entry, group, endpoint, 3);
        if (!placed && groups.length && !groups[0].pin) {
          const existing = groups[0];
          const path = candidates(entry.net.id, endpoint.lead!, existing.segments, 'ordinary', [endpoint.point], [], undefined, trunkGoals(entry.net.id, existing))
            ?? routeOrdinaryBranch(endpoint.lead!, existing.segments, panes, frames, area, [...wires(entry.net.id), ...reserved(entry.net.id)],
              (path) => validPath(entry.net.id, path, 'ordinary', [endpoint.point]));
          if (path) {
            existing.attachments.push(...unit.attachments);
            addBranch(entry.net.id, existing, path, 'ordinary');
            if (unit.attachments.length > 1) existing.segments.push(...unit.segments);
            continue;
          }
        }
        if (!placed) placed = newPin(entry, group, endpoint);
        if (!placed) report(entry.net.id, unit.attachments, 'no local pin satisfies tile clearance, proximity and B + C ≤ 5');
      }
      if (groups.length && !entry.net.implicit) for (const existing of groups) if (!existing.pin) {
        const root = entry.endpoints.find((e) => e.device === existing.attachments[0].device && e.terminal === existing.attachments[0].terminal)!;
        if (!newPin(entry, existing, root)) report(entry.net.id, existing.attachments, 'disconnected named component has no valid graphical occurrence');
      }
      groups.push(group);
    }
    if (!units.length) {
      const preference = layout.nets.find((p) => p.id === entry.net.id);
      if (!preference) groups.push({ attachments: [], segments: [] });
      else {
        const choices: Point[] = [preference.position];
        for (let radius = 1; radius <= 5; radius++) for (const [dx, dy] of [[-120, 0], [120, 0], [0, -120], [0, 120]]) choices.push([preference.position[0] + dx * radius, preference.position[1] + dy * radius]);
        const pin = choices.map((position) => ({ ...preference, ...place(preference.symbol, position), occurrence: `${preference.block ?? 'global'}:${entry.net.id}:0` }))
          .find((p) => pinClearance(p.bounds, deviceBoxes, panes.map((p) => p.bounds)) && !wires(entry.net.id).some((s) => blocks(s, p.bounds)));
        if (!pin) report(entry.net.id, [], 'unconnected reference has no vacant position');
        pins.push(pin!); panes.push(pin!);
        groups.push({ pin, attachments: [{ point: pin!.anchor!, occurrence: pin!.occurrence }], segments: [] });
      }
    }
    // An unconnected terminal is an attachment, not a dangling wire.
    if (groups.length === 1 && groups[0].attachments.length === 1) groups[0].segments = [];
  }
  const nets = model.nets.map((net): RoutedNet => {
    const parts = components.get(net.id)!.map((group): RoutedComponent => {
      const segments = split(group.segments, group.attachments);
      const vertices = segments.flatMap((s) => [s.a, s.b]).filter((p, i, all) => all.findIndex((q) => equal(p, q)) === i);
      return { block: null, attachments: group.attachments.map(({ device, terminal, occurrence, point }) => ({ device, terminal, occurrence, point })), segments,
        junctions: vertices.filter((p) => segments.filter((s) => equal(s.a, p) || equal(s.b, p)).length >= 3) };
    });
    return { net: net.id, components: parts, attachments: parts.flatMap((p) => p.attachments), segments: parts.flatMap((p) => p.segments), junctions: parts.flatMap((p) => p.junctions) };
  });
  const crossings: CircuitRouting['crossings'][number][] = [];
  for (let i = 0; i < nets.length; i++) for (const other of nets.slice(i + 1)) for (const a of nets[i].segments) for (const b of other.segments) {
    const point = intersection(a, b);
    if (overlap(a, b) || collinearTouch(a, b) || point && [distance(point, a.a), distance(point, a.b), distance(point, b.a), distance(point, b.b)].some((d) => d < 8))
      report(nets[i].net, nets[i].attachments, `ambiguous contact with net ${other.net}`);
    if (point) crossings.push({ point, over: other.net, under: nets[i].net, horizontal: horizontal(b) });
  }
  for (const branch of branches) {
    const crossings = crossingCount(branch.segments, wires(branch.net));
    if (branch.kind === 'shared' ? !sharingBudget(branch.bends, crossings) : branch.bends + crossings > 5)
      report(branch.net, nets.find((n) => n.net === branch.net)!.attachments, 'completed branch exceeds its complexity budget');
  }
  const boxes = [...layout.devices.map((d) => d.bounds), ...pins.map((p) => p.bounds), ...layout.stages.map((s) => s.bounds)];
  const finalBounds = boxes.length ? { minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)), maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY)) } : layout.bounds;
  return { layout: { ...layout, nets: pins, bounds: finalBounds }, nets, crossings,
    branches: branches.map((branch) => ({ ...branch, crossings: crossingCount(branch.segments, wires(branch.net)) })) };
}

export function routeOrdinaryBranch(lead: readonly WireSegment[], tree: readonly WireSegment[],
  panes: readonly { bounds: Bounds }[], frames: readonly Bounds[], area: Bounds, other: readonly WireSegment[],
  valid: (path: WireSegment[]) => boolean): WireSegment[] | undefined {
  const minX = Math.ceil((area.minX + 20) / 10) * 10, minY = Math.ceil((area.minY + 20) / 10) * 10;
  const width = Math.floor((area.maxX - 20 - minX) / 10) + 1, height = Math.floor((area.maxY - 20 - minY) / 10) + 1;
  const point = (index: number): Point => [minX + index % width * 10, minY + Math.floor(index / width) * 10];
  const index = (p: Point) => Math.round((p[1] - minY) / 10) * width + Math.round((p[0] - minX) / 10);
  const goals = new Set<number>();
  for (let i = 0; i < width * height; i++) if (tree.some((s) => on(point(i), s))) goals.add(i);
  // State retains complexity as well as direction so a shorter exhausted path cannot discard a feasible one.
  const initialComplexity = bendCount(lead) + crossingCount(lead, other);
  if (initialComplexity > 5) return undefined;
  const initial = (index(lead.at(-1)!.b) * 2 + Number(!horizontal(lead.at(-1)!))) * 6 + initialComplexity;
  for (const maximum of [3, 5]) {
    if (initialComplexity > maximum) continue;
    const queue = new Queue(), costs = new Map<number, number>(), previous = new Map<number, number>();
    costs.set(initial, 0); queue.push({ state: initial, cost: 0, priority: 0 });
    while (true) {
      const current = queue.pop(); if (!current) break;
      if (costs.get(current.state) !== current.cost) continue;
      const complexity = current.state % 6, direction = Math.floor(current.state / 6) % 2, at = Math.floor(current.state / 12), p = point(at);
      if (goals.has(at)) {
        const points: Point[] = [];
        for (let state: number | undefined = current.state; state !== undefined; state = previous.get(state)) points.push(point(Math.floor(state / 12)));
        const path = [...lead, ...simplify(points.reverse())];
        if (valid(path)) return path;
        continue;
      }
      for (const next of [at % width ? at - 1 : -1, at % width < width - 1 ? at + 1 : -1, at - width, at + width]) {
        if (next < 0 || next >= width * height) continue;
        const segment = { a: p, b: point(next) }, nextDirection = Number(!horizontal(segment));
        if (panes.some((pane) => blocks(segment, pane.bounds)) || frames.some((frame) => crowdsFrame(segment, frame)) || overlap(segment, lead.at(-1)!)) continue;
        if (other.some((s) => overlap(segment, s) || collinearTouch(segment, s) || (() => { const cross = intersection(segment, s); return cross && (distance(cross, s.a) < 8 || distance(cross, s.b) < 8 || direction !== nextDirection && equal(cross, p)); })())) continue;
        const crossings = new Set(other.flatMap((s) => { const cross = intersection(segment, s); return cross && !equal(cross, p) ? [cross.join(',')] : []; })).size;
        const budget = complexity + Number(direction !== nextDirection) + crossings;
        if (budget > maximum) continue;
        const state = (next * 2 + nextDirection) * 6 + budget, cost = current.cost + 10 + 20 * Number(direction !== nextDirection) + 15 * crossings;
        if (cost >= (costs.get(state) ?? Infinity)) continue;
        costs.set(state, cost); previous.set(state, current.state); queue.push({ state, cost, priority: cost });
      }
    }
  }
  return undefined;
}
