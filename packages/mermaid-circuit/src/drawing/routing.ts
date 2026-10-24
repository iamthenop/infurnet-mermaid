import type { CircuitModel } from '../circuitTypes.js';
import type { Bounds, Point } from './geometry.js';
import type { CircuitLayout } from './layout.js';

export interface WireSegment { readonly a: Point; readonly b: Point }
export interface Attachment { readonly device?: string; readonly terminal?: string; readonly occurrence?: string; readonly point: Point }
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
const near = (a: number, b: number) => Math.abs(a - b) < epsilon;
const equal = (a: Point, b: Point) => near(a[0], b[0]) && near(a[1], b[1]);
const horizontal = (s: WireSegment) => near(s.a[1], s.b[1]);
const distance = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const inside = (p: Point, b: Bounds) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;
const on = (p: Point, s: WireSegment) => Math.abs(distance(s.a, p) + distance(p, s.b) - distance(s.a, s.b)) < epsilon
  && (horizontal(s) ? near(p[1], s.a[1]) : near(p[0], s.a[0]));

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
  private items: { state: number; cost: number }[] = [];
  push(item: { state: number; cost: number }): void {
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].cost <= item.cost) break;
      this.items[i] = this.items[parent]; i = parent;
    }
    this.items[i] = item;
  }
  pop(): { state: number; cost: number } | undefined {
    const root = this.items[0], last = this.items.pop();
    if (this.items.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child++;
        if (last.cost <= this.items[child].cost) break;
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
  const entries = model.nets.map((net) => {
    const attachments = model.connections.filter((c) => c.net === net.id).map((c) => {
      const placed = layout.devices.find((d) => d.id === c.device);
      const point = placed?.terminals[c.terminal];
      if (!point || !placed) throw new Error(`Missing attachment for ${c.device}.${c.terminal} on net ${net.id}.`);
      return { device: c.device, terminal: c.terminal, point, stub: { a: point, b: escape(point, placed.bounds) } };
    });
    attachments.sort((a, b) => model.devices.findIndex((d) => d.id === a.device) - model.devices.findIndex((d) => d.id === b.device)
      || model.devices.find((d) => d.id === a.device)!.terminals.indexOf(a.terminal) - model.devices.find((d) => d.id === b.device)!.terminals.indexOf(b.terminal));
    const target = layout.inputTargets.find((t) => t.net === net.id);
    if (target) attachments.sort((a, b) => Number(b.device === target.device && b.terminal === target.terminal) - Number(a.device === target.device && a.terminal === target.terminal));
    const symbols = layout.nets.filter((n) => n.id === net.id);
    const endpoints: (Attachment & { stub: WireSegment })[] = attachments;
    for (const placed of [...symbols].reverse()) if (placed.anchor) endpoints.unshift({ point: placed.anchor, occurrence: placed.occurrence, stub: { a: placed.anchor, b: escape(placed.anchor, placed.bounds) } });
    if (symbols.length > 1) {
      const outgoing = endpoints.splice(1, symbols.length - 1);
      endpoints.push(...outgoing);
    }
    return { net, endpoints };
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
    const candidates = [-120, 0, 120].flatMap((period) => [0, 30, 40, 60, 80, 90]
      .map((offset) => Math.floor(edge / 120) * 120 + period + offset))
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
      const phase = ((b[axis] % 120) + 120) % 120;
      if (![0, 30, 40, 60, 80, 90, 120].some((snap) => near(snap, phase))) continue;
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
    const candidates = [-120, 0, 120].flatMap((period) => [0, 30, 40, 60, 80, 90]
      .map((offset) => Math.floor(origin / 120) * 120 + period + offset))
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
    const y = output && (top ? output[1] <= edge - 60 : output[1] >= edge + 60) ? output[1] : edge + (top ? -60 : 60);
    for (const endpoint of endpoints) endpoint.stub = { a: endpoint.point, b: [endpoint.point[0], y] };
    const segment: WireSegment = {
      a: [Math.min(...endpoints.map((endpoint) => endpoint.point[0])), y],
      b: [Math.max(...endpoints.map((endpoint) => endpoint.point[0])), y],
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
  const xs = new Set<number>(), ys = new Set<number>();
  const add = (p: Point) => { xs.add(p[0]); ys.add(p[1]); };
  for (const entry of entries) for (const endpoint of entry.endpoints) { add(endpoint.point); add(endpoint.stub.b); }
  for (const pane of panes) { add([pane.bounds.minX - 30, pane.bounds.minY - 30]); add([pane.bounds.maxX + 30, pane.bounds.maxY + 30]); }
  for (let x = Math.floor((layout.bounds.minX - 120) / 120) * 120; x <= layout.bounds.maxX + 120; x += 120)
    for (const offset of [0, 30, 40, 60, 80, 90]) xs.add(x + offset);
  for (let y = Math.floor((layout.bounds.minY - 120) / 120) * 120; y <= layout.bounds.maxY + 120; y += 120)
    for (const offset of [0, 30, 40, 60, 80, 90]) ys.add(y + offset);
  const distinct = (values: Set<number>) => [...values].sort((a, b) => a - b).filter((value, i, sorted) => !i || !near(value, sorted[i - 1]));
  const xValues = distinct(xs), yValues = distinct(ys);
  const sharedInputs = entries.filter((entry) => isInput(entry.net.id) && entry.endpoints.length > 2)
    .sort((a, b) => a.endpoints[0].point[1] - b.endpoints[0].point[1]);
  const branchColumns = new Map<string, number>();
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
    sharedInputs.forEach((entry, index) => branchColumns.set(entry.net.id, columns[index]));
  }
  const width = xValues.length;
  const points: Point[] = yValues.flatMap((y) => xValues.map((x): Point => [x, y]));
  const neighbors = points.map((p, index) => [index % width ? index - 1 : -1, index % width < width - 1 ? index + 1 : -1, index - width, index + width]
    .filter((next) => next >= 0 && next < points.length && (!limit || inside(p, limit) && inside(points[next], limit)
      && [p, points[next]].every((point) => point[0] >= limit.minX + frameClearance && point[0] <= limit.maxX - frameClearance
        && point[1] >= limit.minY + frameClearance && point[1] <= limit.maxY - frameClearance)) && !equal(p, points[next]) && !panes.some((pane) => blocks({ a: p, b: points[next] }, pane.bounds))
      && !frames.some((frame) => crowdsFrame({ a: p, b: points[next] }, frame))));
  const completed: RoutedNet[] = [];

  for (const { net, endpoints } of entries) {
    const netBuses = buses.filter((bus) => bus.net === net.id);
    const units = [
      ...netBuses.map((bus) => ({ stub: { a: bus.segment.a, b: bus.segment.a }, device: undefined as string | undefined, terminal: undefined as string | undefined,
        segments: [bus.segment, ...bus.endpoints.map((endpoint) => endpoint.stub)] })),
      ...endpoints.filter((endpoint) => !netBuses.some((bus) => bus.endpoints.includes(endpoint)))
        .map((endpoint) => ({ ...endpoint, segments: [endpoint.stub] })),
    ];
    const segments: WireSegment[] = endpoints.length > 1 ? [...units[0].segments] : [];
    const otherSegments = [...completed.flatMap((n) => n.segments), ...entries.filter((entry) => entry.net.id !== net.id)
      .flatMap((entry) => entry.endpoints.length > 1 ? entry.endpoints.map((e) => e.stub) : []),
      ...buses.filter((bus) => bus.net !== net.id).map((bus) => bus.segment)];
    for (const endpoint of units.slice(1)) {
      const branchColumn = segments.length > 1 ? branchColumns.get(net.id) : undefined;
      const start = points.findIndex((p) => equal(p, endpoint.stub.b));
      const goals = new Set(points.flatMap((p, index) => (segments.length === 1 ? equal(p, segments[0].b) : segments.some((s) => on(p, s)))
        && (branchColumn === undefined || near(p[0], branchColumn))
        && !(isInput(net.id) && segments.length > 1 && layout.stages.some((stage) => inside(p, stage.bounds))) ? [index] : []));
      const costs = new Float64Array(points.length * 3).fill(Infinity), previous = new Int32Array(points.length * 3).fill(-1);
      const queue = new Queue();
      const initial = start * 3 + (horizontal(endpoint.stub) ? 1 : 2);
      costs[initial] = 0; queue.push({ state: initial, cost: 0 });
      let end = -1;
      while (true) {
        const current = queue.pop();
        if (!current) break;
        if (current.cost !== costs[current.state]) continue;
        const index = Math.floor(current.state / 3), direction = current.state % 3, p = points[index];
        if (goals.has(index)) { end = current.state; break; }
        for (const next of neighbors[index]) {
          const segment = { a: p, b: points[next] }, nextDirection = horizontal(segment) ? 1 : 2;
          if (branchColumn !== undefined && !horizontal(segment) && !near(p[0], branchColumn)
            && (!sideBySideBlocks || frames.some((frame) => p[0] > frame.minX && p[0] < frame.maxX
              && Math.max(segment.a[1], segment.b[1]) > frame.minY && Math.min(segment.a[1], segment.b[1]) < frame.maxY))) continue;
          if (overlap(segment, endpoint.stub)) continue;
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
          if (cost < costs[state]) { costs[state] = cost; previous[state] = current.state; queue.push({ state, cost }); }
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
      if (overlap(a, b) || collinearTouch(a, b) || point && (distance(point, a.a) < 8 || distance(point, a.b) < 8 || distance(point, b.a) < 8 || distance(point, b.b) < 8))
        throw new Error(`Ambiguous connection between nets ${completed[i].net} and ${other.net}.`);
      if (point) crossings.push({ point, over: other.net, under: completed[i].net, horizontal: horizontal(b) });
    }
  }
  return { nets: completed, crossings };
}
