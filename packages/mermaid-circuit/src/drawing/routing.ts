import type { Net } from '../circuitTypes.js';
import { Element, type PlacedElement, type WireShape } from './core.js';
import type { Bounds, Point } from './geometry.js';
import { pad, validateOrientation, type Attachment, type Layout } from './layout.js';

export interface Route { readonly net: string; readonly points: readonly Point[]; readonly shape: WireShape }
export interface Proxy { readonly net: Net; readonly element: Element; readonly placed: PlacedElement; readonly branches: number }
export interface Routing {
  readonly routes: readonly Route[];
  readonly proxies: readonly Proxy[];
  readonly junctions: readonly { net: string; point: Point }[];
  readonly attachments: readonly Attachment[];
  readonly bends: number;
  readonly crossings: number;
}
const EPS = 1e-7;
const equal = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const key = (p: Point) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
const segments = (points: readonly Point[]) => points.slice(1).map((end, i) => [points[i], end] as const);

export function validPath(points: readonly Point[]): boolean {
  if (points.length < 2 || points.length > 3 || points.some((point) => !point.every(Number.isFinite))) return false;
  const [start, end] = [points[0], points[points.length - 1]];
  return segments(points).every(([a, b]) => (Math.abs(a[0] - b[0]) < EPS || Math.abs(a[1] - b[1]) < EPS)
    && (b[0] - a[0]) * (end[0] - start[0]) >= -EPS && (b[1] - a[1]) * (end[1] - start[1]) >= -EPS
    && (end[0] !== start[0] || Math.abs(b[0] - a[0]) < EPS)
    && (end[1] !== start[1] || Math.abs(b[1] - a[1]) < EPS));
}

function intersection(a: Point, b: Point, c: Point, d: Point): Point | 'overlap' | undefined {
  const horizontal = Math.abs(a[1] - b[1]) < EPS, otherHorizontal = Math.abs(c[1] - d[1]) < EPS;
  const between = (v: number, x: number, y: number) => v >= Math.min(x, y) - EPS && v <= Math.max(x, y) + EPS;
  if (horizontal === otherHorizontal) {
    const axis = horizontal ? 0 : 1, fixed = 1 - axis;
    if (Math.abs(a[fixed] - c[fixed]) > EPS) return undefined;
    const low = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
    const high = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
    if (high < low - EPS) return undefined;
    if (high > low + EPS) return 'overlap';
    return horizontal ? [low, a[1]] : [a[0], low];
  }
  const p: Point = horizontal ? [c[0], a[1]] : [a[0], c[1]];
  return between(p[0], a[0], b[0]) && between(p[1], a[1], b[1])
    && between(p[0], c[0], d[0]) && between(p[1], c[1], d[1]) ? p : undefined;
}

export function crossingPoints(route: Route, others: readonly Route[]): Point[] | undefined {
  const found = new Map<string, Point>();
  for (const other of others) {
    if (other.net === route.net) continue;
    for (const [a, b] of segments(route.points)) for (const [c, d] of segments(other.points)) {
      const point = intersection(a, b, c, d);
      if (point === 'overlap') return undefined;
      if (point) found.set(key(point), point);
    }
  }
  return [...found.values()];
}

function hitsBox(points: readonly Point[], box: Bounds): boolean {
  return segments(points).some(([a, b]) => Math.abs(a[1] - b[1]) < EPS
    ? a[1] > box.minY + EPS && a[1] < box.maxY - EPS
      && Math.max(a[0], b[0]) > box.minX + EPS && Math.min(a[0], b[0]) < box.maxX - EPS
    : a[0] > box.minX + EPS && a[0] < box.maxX - EPS
      && Math.max(a[1], b[1]) > box.minY + EPS && Math.min(a[1], b[1]) < box.maxY - EPS);
}

export function acceptsRoute(route: Route, existing: readonly Route[], obstacles: readonly Bounds[] = []): boolean {
  if (!validPath(route.points) || obstacles.some((box) => hitsBox(route.points, box))) return false;
  const candidates = [...existing, route];
  return candidates.every((wire) => {
    const crossings = crossingPoints(wire, candidates);
    return crossings !== undefined && crossings.length <= (wire.shape === '-' ? 2 : 1);
  });
}

export function chooseRoute(net: string, start: Point, end: Point, existing: readonly Route[], obstacles: readonly Bounds[]): Route {
  const candidates: Route[] = [];
  if (Math.abs(start[0] - end[0]) < EPS || Math.abs(start[1] - end[1]) < EPS) candidates.push({ net, points: [start, end], shape: '-' });
  else {
    candidates.push({ net, points: [start, [end[0], start[1]], end], shape: '-|' });
    candidates.push({ net, points: [start, [start[0], end[1]], end], shape: '|-' });
  }
  const route = candidates.find((candidate) => acceptsRoute(candidate, existing, obstacles));
  if (!route) throw new Error(`Routing failure for net "${net}" from (${start}) to (${end}): no permitted wire shape satisfies obstacles and crossing limits.`);
  return route;
}

function junctions(routes: readonly Route[]): { net: string; point: Point }[] {
  const result: { net: string; point: Point }[] = [];
  for (const net of new Set(routes.map((route) => route.net))) {
    const edges = routes.filter((route) => route.net === net).flatMap((route) => segments(route.points));
    const points = new Map<string, Point>();
    for (const [a, b] of edges) { points.set(key(a), a); points.set(key(b), b); }
    for (const [a, b] of edges) for (const [c, d] of edges) {
      const point = intersection(a, b, c, d);
      if (point && point !== 'overlap') points.set(key(point), point);
    }
    for (const point of points.values()) {
      const directions = new Set<string>();
      for (const [a, b] of edges) {
        if (!intersection(a, b, point, point)) continue;
        for (const end of [a, b]) if (!equal(point, end)) {
          directions.add(Math.abs(end[0] - point[0]) > EPS ? end[0] < point[0] ? 'L' : 'R' : end[1] < point[1] ? 'T' : 'B');
        }
      }
      if (directions.size >= 3) result.push({ net, point });
    }
  }
  return result;
}

function groupsFor(attachments: readonly Attachment[], input: boolean): Attachment[][] {
  const groups: Attachment[][] = [];
  for (const stage of new Set(attachments.map((item) => item.stage))) {
    const items = attachments.filter((item) => item.stage === stage);
    const facing = items.length === 2 && items[0].side !== items[1].side
      && ['T', 'B'].includes(items[0].side) && ['T', 'B'].includes(items[1].side)
      && Math.abs(items[0].point[0] - items[1].point[0]) < EPS;
    if (facing) { groups.push(items); continue; }
    for (const side of new Set(items.map((item) => item.side))) {
      const sameSide = items.filter((item) => item.side === side);
      for (let i = 0; i < sameSide.length; i += input ? 3 : sameSide.length) {
        groups.push(sameSide.slice(i, input ? i + 3 : undefined));
      }
    }
  }
  return groups;
}

function groupJoint(items: readonly Attachment[], layout: Layout, input: boolean): Point {
  if (items.length === 1) return items[0].point;
  const xs = items.map((item) => item.point[0]), ys = items.map((item) => item.point[1]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (items.some((item) => item.side !== items[0].side)) return [x, y];
  switch (items[0].side) {
    case 'T': return [x, Math.min(...ys) - 60];
    case 'B': return [x, Math.max(...ys) + 60];
    case 'L': return [input ? layout.stageBounds[items[0].stage].minX - 60 : Math.min(...xs) - 120, input ? items[0].point[1] : y];
    case 'R': return [Math.max(...xs) + 120, y];
  }
}

export function routeLayout(layout: Layout): Routing {
  const routes: Route[] = [], proxies: Proxy[] = [];
  const bodies = layout.devices.map((item) => item.placed.bounds);
  const obstacles = () => [...bodies, ...proxies.map((proxy) => proxy.placed.bounds)];
  function branches(net: string, group: readonly Attachment[], joint: Point, initial: readonly Route[]): Route[] {
    const added: Route[] = [];
    for (const item of group) if (!equal(item.point, joint)) {
      const side = item.side;
      if (group.length > 1 && group.every((other) => other.side === side) && ['T', 'B'].includes(side)) {
        const bend: Point = [item.point[0], joint[1]];
        const points = equal(bend, joint) || equal(bend, item.point) ? [item.point, joint] : [item.point, bend, joint];
        const route: Route = { net, points, shape: points.length === 2 ? '-' : '|-' };
        if (!acceptsRoute(route, [...initial, ...added], obstacles())) throw new Error(`Routing failure for centered parallel conductor on net "${net}".`);
        added.push(route);
      } else added.push(chooseRoute(net, item.point, joint, [...initial, ...added], obstacles()));
    }
    return added;
  }
  const ordered = [...layout.nets].sort((a, b) => Number(a.type !== 'net') - Number(b.type !== 'net'));
  for (const net of ordered) {
    const attachments = layout.attachments.filter((item) => item.net === net.id);
    if (!attachments.length) continue;
    const input = net.type === 'pinIn' || net.type === 'pinInOut';
    const groups = groupsFor(attachments, input);
    if (net.type === 'net') {
      const joints = groups.map((group) => groupJoint(group, layout, false));
      const added: Route[] = [];
      for (let i = 0; i < groups.length; i++) added.push(...branches(net.id, groups[i], joints[i], [...routes, ...added]));
      for (let i = 1; i < joints.length; i++) if (!equal(joints[i - 1], joints[i])) {
        added.push(chooseRoute(net.id, joints[i - 1], joints[i], [...routes, ...added], obstacles()));
      }
      routes.push(...added);
      continue;
    }
    function addProxyGroup(group: readonly Attachment[]): boolean {
      const joint = groupJoint(group, layout, input);
      const first = group[0], stage = layout.stageBounds[first.stage];
      const commonConductor = group.length > 1 && ['T', 'B'].includes(first.side) && group.every((item) => item.side === first.side);
      const left = net.type === 'pinIn' || net.type === 'pinInOut' && first.side === 'L';
      const base: Point = net.type === 'supplyNet'
        ? [joint[0] + (first.side === 'B' ? 180 : first.side === 'L' ? -120 : 0), first.side === 'T' ? joint[1] - 30 : Math.min(stage.minY - 60, joint[1] - 60)]
        : net.type === 'ground'
          ? [joint[0] + (first.side === 'T' ? 180 : first.side === 'L' ? -120 : 0), first.side === 'B' ? joint[1] + 30 : Math.max(stage.maxY + 60, joint[1] + 60)]
          : [left ? Math.min(joint[0] - 120, stage.minX - 120) : Math.max(joint[0] + 120, stage.maxX + 120),
            joint[1] + (commonConductor ? first.side === 'T' ? -60 : 60 : 0)];
      for (const distance of [0, 120, 240, 360]) {
        const at: Point = net.type === 'supplyNet' ? [base[0], base[1] - distance]
          : net.type === 'ground' ? [base[0], base[1] + distance]
            : [base[0] + (left ? -distance : distance), base[1]];
        validateOrientation(net.type, 0, net.type === 'pinInOut' && left);
        const element = new Element(net.type as Exclude<Net['type'], 'net'>, { at, anchor: 'anchor', rotation: 0, reverse: net.type === 'pinInOut' && left });
        const placed = element.place();
        const box = pad(placed.bounds, 4);
        if (obstacles().some((other) => box.minX < other.maxX && box.maxX > other.minX && box.minY < other.maxY && box.maxY > other.minY)) continue;
        try {
          const added = branches(net.id, group, joint, routes);
          const trunk = chooseRoute(net.id, at, joint, [...routes, ...added], [...obstacles(), placed.bounds]);
          if (commonConductor && Math.abs(trunk.points.at(-2)![0] - joint[0]) > EPS) continue;
          if (routes.some((route) => route.net !== net.id && hitsBox(route.points, placed.bounds))) continue;
          routes.push(...added, trunk);
          proxies.push({ net, element, placed, branches: group.length });
          return true;
        } catch (error) {
          if (!(error instanceof Error) || !error.message.startsWith('Routing failure')) throw error;
        }
      }
      return false;
    }
    for (const group of groups) {
      if (addProxyGroup(group)) continue;
      if (group.length > 1 && ['T', 'B'].includes(group[0].side) && group.every((item) => item.side === group[0].side)) {
        throw new Error(`Routing failure for centered parallel conductor on net "${net.id}".`);
      }
      if (group.length === 1) throw new Error(`Routing failure for net "${net.id}" at ${group[0].device}.${group[0].terminal}: no valid graphical occurrence.`);
      for (const item of group) if (!addProxyGroup([item])) {
        throw new Error(`Routing failure for net "${net.id}" at ${item.device}.${item.terminal}: no valid graphical occurrence.`);
      }
    }
  }
  const crossings = new Set(routes.flatMap((route) => (crossingPoints(route, routes) ?? []).map(key)));
  return { routes, proxies, junctions: junctions(routes), attachments: layout.attachments,
    bends: routes.filter((route) => route.shape !== '-').length, crossings: crossings.size };
}
