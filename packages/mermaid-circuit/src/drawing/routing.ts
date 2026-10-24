import type { CircuitModel } from '../circuitTypes.js';
import type { Bounds, Point } from './geometry.js';
import type { CircuitLayout } from './layout.js';

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
export interface CircuitRouting {
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
const inside = (p: Point, b: Bounds) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;
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
  return { nets: model.nets.map((net) => {
    const components = routes.flatMap(({ block, routed }) => routed.nets.filter((item) => item.net === net.id)
      .map((item) => ({ block, attachments: item.attachments, segments: item.segments, junctions: item.junctions })));
    if (!components.length) throw new Error(`No sectional route for net ${net.id}.`);
    if (components.length > 1 && components.some((component) => !component.attachments.some((attachment) => attachment.occurrence)))
      throw new Error(`Net ${net.id} has a section without a named endpoint.`);
    return { net: net.id, components, attachments: components.flatMap((component) => component.attachments),
      segments: components.flatMap((component) => component.segments), junctions: components.flatMap((component) => component.junctions) };
  }), crossings: routes.flatMap(({ routed }) => routed.crossings) };
}

function routeConnected(model: CircuitModel, layout: CircuitLayout, limit?: Bounds): CircuitRouting {
  const isInput = (id: string) => layout.nets.some((net) => net.id === id && net.symbol === 'pinIn');
  if (layout.unplacedNetIds.length) throw new Error(`Unsupported pinInOut placement: ${layout.unplacedNetIds.join(', ')}.`);
  const panes = [...layout.devices, ...layout.nets];
  const frames = [...layout.stages.map((stage) => stage.bounds), ...layout.blocks.flatMap((block) => block.bounds ? [block.bounds] : [])];
  const sideBySideBlocks = !!limit || layout.blocks.filter((block) => block.bounds).length > 1;
  const entries = model.nets.flatMap((net) => {
    const occurrences = layout.nets.filter((symbol) => symbol.id === net.id);
    const groups = occurrences.some((symbol) => symbol.recipientStage !== undefined) ? occurrences.map((symbol) => [symbol]) : [occurrences];
    for (const connection of model.connections.filter((connection) => connection.net === net.id)) {
      const stage = layout.devices.find((device) => device.id === connection.device)?.stage;
      if (groups.filter((symbols) => symbols[0]?.recipientStage === undefined || symbols[0].recipientStage === stage).length !== 1)
        throw new Error(`Missing or duplicate input occurrence for ${connection.device}.${connection.terminal} on net ${net.id}.`);
    }
    return groups.map((symbols) => {
      const recipientStage = symbols[0]?.recipientStage;
      const attachments = model.connections.filter((c) => c.net === net.id
        && (recipientStage === undefined || layout.devices.find((device) => device.id === c.device)?.stage === recipientStage)).map((c) => {
        const placed = layout.devices.find((d) => d.id === c.device);
        const point = placed?.terminals[c.terminal];
        if (!point || !placed) throw new Error(`Missing attachment for ${c.device}.${c.terminal} on net ${net.id}.`);
        return { device: c.device, terminal: c.terminal, point, stub: { a: point, b: escape(point, placed.bounds) } };
      });
      attachments.sort((a, b) => model.devices.findIndex((d) => d.id === a.device) - model.devices.findIndex((d) => d.id === b.device)
        || model.devices.find((d) => d.id === a.device)!.terminals.indexOf(a.terminal) - model.devices.find((d) => d.id === b.device)!.terminals.indexOf(b.terminal));
      const target = layout.inputTargets.find((t) => t.net === net.id);
      if (target) attachments.sort((a, b) => Number(b.device === target.device && b.terminal === target.terminal) - Number(a.device === target.device && a.terminal === target.terminal));
      const endpoints: LeadAttachment[] = attachments;
      for (const placed of [...symbols].reverse()) if (placed.anchor) endpoints.unshift({ point: placed.anchor, occurrence: placed.occurrence, stub: { a: placed.anchor, b: escape(placed.anchor, placed.bounds) } });
      if (symbols.length > 1) {
        const outgoing = endpoints.splice(1, symbols.length - 1);
        endpoints.push(...outgoing);
      }
      return { net, endpoints };
    });
  }).sort((a, b) => {
    const inputs = Number(isInput(b.net.id)) - Number(isInput(a.net.id));
    if (inputs) return inputs;
    if (a.net.implicit && b.net.implicit) {
      const rank = (e: Attachment) => model.devices.findIndex((d) => d.id === e.device) * 10
        + model.devices.find((d) => d.id === e.device)!.terminals.indexOf(e.terminal!);
      return Math.min(...a.endpoints.map(rank)) - Math.min(...b.endpoints.map(rank));
    }
    return Number(!!a.net.implicit) - Number(!!b.net.implicit);
  });
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
  const stubs = entries.flatMap((entry) => entry.endpoints.length > 1 ? entry.endpoints.map((endpoint) => ({ net: entry.net.id, endpoint })) : []);
  const straightInputs = entries.filter((entry) => isInput(entry.net.id) && entry.endpoints.length > 1
    && horizontal(entry.endpoints[1].stub) && near(entry.endpoints[0].point[1], entry.endpoints[1].point[1]))
    .map((entry) => ({ net: entry.net.id, segment: { a: entry.endpoints[0].point, b: entry.endpoints[1].point } }));
  for (const { net, endpoint } of stubs) {
    const crowdsInput = (stub: WireSegment) => straightInputs.some((input) => {
      const cross = input.net === net ? undefined : intersection(stub, input.segment);
      return cross && distance(cross, stub.b) < 8;
    });
    if (!crowdsInput(endpoint.stub)) continue;
    const axis = horizontal(endpoint.stub) ? 0 : 1, direction = Math.sign(endpoint.stub.b[axis] - endpoint.point[axis]);
    for (let length = 40; length <= 60; length += 10) {
      const b: Point = axis === 0 ? [endpoint.point[0] + direction * length, endpoint.point[1]] : [endpoint.point[0], endpoint.point[1] + direction * length];
      const stub = { a: endpoint.point, b };
      if (crowdsInput(stub) || frames.some((frame) => crowdsFrame(stub, frame))
        || panes.some((pane) => pane.id !== (endpoint.device ?? net) && blocks(stub, pane.bounds))
        || stubs.some((other) => other.net !== net && (overlap(stub, other.endpoint.stub) || collinearTouch(stub, other.endpoint.stub) || intersection(stub, other.endpoint.stub)))) continue;
      endpoint.stub = stub;
      break;
    }
  }
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
    const output = layout.nets.some((net) => net.id === entry.net.id && net.symbol === 'pinOut') ? entry.endpoints.find((endpoint) => !endpoint.device)?.point : undefined;
    const y = snap(output && (top ? output[1] <= edge - 60 : output[1] >= edge + 60) ? output[1] : edge + (top ? -60 : 60));
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
  const xs = new Set<number>(), ys = new Set<number>();
  const add = (p: Point) => { xs.add(p[0]); ys.add(p[1]); };
  for (const entry of entries) for (const endpoint of entry.endpoints) add(endpoint.stub.b);
  for (let x = Math.floor((layout.bounds.minX - 120) / gridPitch) * gridPitch; x <= layout.bounds.maxX + 120; x += gridPitch) xs.add(x);
  for (let y = Math.floor((layout.bounds.minY - 120) / gridPitch) * gridPitch; y <= layout.bounds.maxY + 120; y += gridPitch) ys.add(y);
  const distinct = (values: Set<number>) => [...values].sort((a, b) => a - b).filter((value, i, sorted) => !i || !near(value, sorted[i - 1]));
  const xValues = distinct(xs), yValues = distinct(ys);
  const sharedInputs = entries.filter((entry) => isInput(entry.net.id) && entry.endpoints.length > 2)
    .sort((a, b) => a.endpoints[0].point[1] - b.endpoints[0].point[1]);
  const branchColumns = new Map<typeof entries[number], number>();
  if (sharedInputs.length) {
    const left = Math.max(...sharedInputs.map((entry) => entry.endpoints[0].stub.b[0])) + 8;
    const right = Math.min(...frames.map((frame) => frame.minX)) - frameClearance;
    const candidates = xValues.filter((x) => x >= left && x <= right);
    let columns: number[] = [];
    for (const last of [...candidates].reverse()) {
      for (let spacing = 20; spacing <= right - left + 20; spacing += 10) {
        const sequence = sharedInputs.map((_, index) => last - (sharedInputs.length - 1 - index) * spacing);
        if (sequence.every((x) => candidates.some((candidate) => near(candidate, x)))) { columns = sequence; break; }
      }
      if (columns.length) break;
    }
    if (columns.length < sharedInputs.length) throw new Error('Cannot route shared inputs in top-to-bottom branch order outside stage frames.');
    sharedInputs.forEach((entry, index) => branchColumns.set(entry, columns[index]));
  }
  const width = xValues.length;
  const points: Point[] = yValues.flatMap((y) => xValues.map((x): Point => [x, y]));
  const pointIndex = (p: Point) => {
    const x = xValues.findIndex((value) => near(value, p[0])), y = yValues.findIndex((value) => near(value, p[1]));
    return x < 0 || y < 0 ? -1 : y * width + x;
  };
  const neighborCache = new Map<number, number[]>();
  const neighbors = (index: number): number[] => {
    const cached = neighborCache.get(index);
    if (cached) return cached;
    const p = points[index];
    const adjacent = [index % width ? index - 1 : -1, index % width < width - 1 ? index + 1 : -1, index - width, index + width]
    .filter((next) => next >= 0 && next < points.length && (!limit || inside(p, limit) && inside(points[next], limit)
      && [p, points[next]].every((point) => point[0] >= limit.minX + frameClearance && point[0] <= limit.maxX - frameClearance
        && point[1] >= limit.minY + frameClearance && point[1] <= limit.maxY - frameClearance)) && !equal(p, points[next]) && !panes.some((pane) => blocks({ a: p, b: points[next] }, pane.bounds))
      && !frames.some((frame) => crowdsFrame({ a: p, b: points[next] }, frame)));
    neighborCache.set(index, adjacent); return adjacent;
  };
  const completed: RoutedNet[] = [];

  for (const entry of entries) {
    const { net, endpoints } = entry;
    const netBuses = buses.filter((bus) => bus.net === net.id);
    const units = [
      ...netBuses.map((bus) => ({ stub: { a: bus.segment.a, b: bus.segment.a }, device: undefined as string | undefined, terminal: undefined as string | undefined,
        segments: [bus.segment, ...bus.endpoints.flatMap((endpoint) => endpoint.lead!)] })),
      ...endpoints.filter((endpoint) => !netBuses.some((bus) => bus.endpoints.includes(endpoint)))
        .map((endpoint) => ({ ...endpoint, segments: endpoint.lead! })),
    ];
    const segments: WireSegment[] = endpoints.length > 1 ? [...units[0].segments] : [];
    const otherSegments = [...completed.flatMap((n) => n.segments), ...entries.filter((other) => other !== entry)
      .flatMap((other) => other.endpoints.length > 1 ? other.endpoints.flatMap((e) => e.lead!) : []),
      ...buses.filter((bus) => bus.net !== net.id).map((bus) => bus.segment)];
    for (const endpoint of units.slice(1)) {
      const branchColumn = segments.length > 1 ? branchColumns.get(entry) : undefined;
      const start = pointIndex(endpoint.stub.b);
      const goals = new Set<number>();
      const addGoal = (index: number) => {
        if (index < 0) return;
        const p = points[index];
        if ((branchColumn === undefined || near(p[0], branchColumn))
          && !(isInput(net.id) && segments.length > 1 && layout.stages.some((stage) => inside(p, stage.bounds)))) goals.add(index);
      };
      if (segments.length === 1) addGoal(pointIndex(segments[0].b));
      else for (const segment of segments) {
        if (horizontal(segment)) {
          const y = yValues.findIndex((value) => near(value, segment.a[1]));
          if (y >= 0) xValues.forEach((x, i) => { if (on([x, yValues[y]], segment)) addGoal(y * width + i); });
        } else {
          const x = xValues.findIndex((value) => near(value, segment.a[0]));
          if (x >= 0) yValues.forEach((y, i) => { if (on([xValues[x], y], segment)) addGoal(i * width + x); });
        }
      }
      const costs = new Float64Array(points.length * 3).fill(Infinity), previous = new Int32Array(points.length * 3).fill(-1);
      const targetBounds = [...goals].reduce((box, index) => ({ minX: Math.min(box.minX, points[index][0]), minY: Math.min(box.minY, points[index][1]),
        maxX: Math.max(box.maxX, points[index][0]), maxY: Math.max(box.maxY, points[index][1]) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
      // Distance to the goal bounds is a lower bound even when obstacles require detours.
      const remaining = (p: Point) => goals.size ? Math.max(targetBounds.minX - p[0], 0, p[0] - targetBounds.maxX)
        + Math.max(targetBounds.minY - p[1], 0, p[1] - targetBounds.maxY) : 0;
      const queue = new Queue();
      const initial = start * 3 + (horizontal(endpoint.stub) ? 1 : 2);
      costs[initial] = 0; queue.push({ state: initial, cost: 0, priority: remaining(points[start]) });
      let end = -1;
      while (true) {
        const current = queue.pop();
        if (!current) break;
        if (current.cost !== costs[current.state]) continue;
        const index = Math.floor(current.state / 3), direction = current.state % 3, p = points[index];
        if (goals.has(index)) { end = current.state; break; }
        for (const next of neighbors(index)) {
          const segment = { a: p, b: points[next] }, nextDirection = horizontal(segment) ? 1 : 2;
          if (branchColumn !== undefined && !horizontal(segment) && !near(p[0], branchColumn)
            && (!sideBySideBlocks || frames.some((frame) => p[0] > frame.minX && p[0] < frame.maxX
              && Math.max(segment.a[1], segment.b[1]) > frame.minY && Math.min(segment.a[1], segment.b[1]) < frame.maxY))) continue;
          if (overlap(segment, endpoint.stub)) continue;
          if (segments.some((wire) => [wire.a, wire.b].some((point) => point.some((value) => !near(value, snap(value))))
            && (overlap(segment, wire) || (() => {
              const cross = intersection(segment, wire);
              return cross && cross.some((value) => !near(value, snap(value)));
            })()))) continue;
          if (otherSegments.some((s) => overlap(segment, s) || collinearTouch(segment, s) || (() => {
            const cross = intersection(segment, s);
            return cross && (distance(cross, s.a) < 8 || distance(cross, s.b) < 8 || direction !== nextDirection && on(p, s));
          })())) continue;
          if (isInput(net.id) && segments.length > 1 && segments.some((s) => {
            const cross = intersection(segment, s);
            return cross && layout.stages.some((stage) => inside(cross, stage.bounds));
          })) continue;
          const state = next * 3 + nextDirection;
          const cost = current.cost + distance(p, points[next]) + (direction !== nextDirection ? 20 : 0)
            + otherSegments.filter((s) => intersection(segment, s)).length * 15;
          if (cost < costs[state]) { costs[state] = cost; previous[state] = current.state; queue.push({ state, cost, priority: cost + remaining(points[next]) }); }
        }
      }
      if (end < 0) throw new Error(`Cannot route net ${net.id} to ${endpoint.device ?? net.id}.${endpoint.terminal ?? 'anchor'} without a false connection or symbol collision.`);
      const path: Point[] = [];
      for (let state = end; state !== -1; state = previous[state]) path.push(points[Math.floor(state / 3)]);
      segments.push(...endpoint.segments, ...simplify(path.reverse()));
    }
    const normalized = split(segments, endpoints);
    const vertices: Point[] = [];
    for (const s of normalized) for (const p of [s.a, s.b]) if (!vertices.some((v) => equal(v, p))) vertices.push(p);
    const attachments = endpoints.map(({ point, device, terminal, occurrence }) => ({ point, device, terminal, occurrence }));
    const junctions = vertices.filter((p) => normalized.filter((s) => equal(p, s.a) || equal(p, s.b)).length >= 3);
    completed.push({ net: net.id, attachments, segments: normalized, junctions,
      components: [{ block: null, attachments, segments: normalized, junctions }] });
  }
  const crossings: CircuitRouting['crossings'][number][] = [];
  for (let i = 0; i < completed.length; i++) for (const other of completed.slice(i + 1)) {
    for (const a of completed[i].segments) for (const b of other.segments) {
      const point = intersection(a, b);
      if (point && completed[i].net === other.net || overlap(a, b) || collinearTouch(a, b) || point && (distance(point, a.a) < 8 || distance(point, a.b) < 8 || distance(point, b.a) < 8 || distance(point, b.b) < 8))
        throw new Error(`Ambiguous connection between nets ${completed[i].net} and ${other.net}.`);
      if (point) crossings.push({ point, over: other.net, under: completed[i].net, horizontal: horizontal(b) });
    }
  }
  return { nets: completed, crossings };
}
