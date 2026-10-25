import catalog from '../../shapes/shapes.json' with { type: 'json' };
import { symbolAssets } from '../generated/symbol-assets.js';
import { Transform, bounds, circleBounds, unionBounds, type Bounds, type Point } from './geometry.js';
import { serializeTransform } from './svg.js';

export type SymbolId = keyof typeof catalog;

export interface SymbolDrawing {
  readonly id: SymbolId;
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly terminals: Readonly<Record<string, Point>>;
  readonly anchor?: Point;
  readonly allowedModes: readonly string[];
  readonly svgTransform: string;
}

export function resolveSymbol(id: string, transform = new Transform()): SymbolDrawing {
  if (!Object.hasOwn(catalog, id) || !Object.hasOwn(symbolAssets, id)) {
    throw new Error(`Unknown registered symbol "${id}".`);
  }
  const symbolId = id as SymbolId;
  const entry = catalog[symbolId];
  const point = (coordinates: readonly number[]): Point => transform.apply([coordinates[0], coordinates[1]]);
  return {
    id: symbolId, svg: symbolAssets[symbolId], width: entry.width, height: entry.height,
    terminals: Object.fromEntries(Object.entries(entry.terminals).map(([name, coordinates]) => [name, point(coordinates)])),
    ...('anchor' in entry ? { anchor: point(entry.anchor) } : {}),
    allowedModes: [...entry.allowedModes], svgTransform: serializeTransform(transform),
  };
}

export function resolveTerminal(id: string, terminal: string, transform = new Transform()): Point {
  const symbol = resolveSymbol(id, transform);
  if (!Object.hasOwn(symbol.terminals, terminal)) throw new Error(`Unknown terminal "${terminal}" on symbol "${id}".`);
  return symbol.terminals[terminal];
}

// Endpoint-to-center conversion follows SVG 2, Appendix B.2.4.
function arcBounds(start: Point, end: Point, values: number[], transform: Transform): Bounds {
  let [rx, ry] = values.map(Math.abs);
  const phi = values[2] * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const endpoints = transform.applyAll([start, end]);
  if (rx === 0 || ry === 0 || (start[0] === end[0] && start[1] === end[1])) return bounds(endpoints);
  const dx = (start[0] - end[0]) / 2, dy = (start[1] - end[1]) / 2;
  const x = cos * dx + sin * dy, y = -sin * dx + cos * dy;
  const correction = Math.max(1, Math.hypot(x / rx, y / ry));
  rx *= correction; ry *= correction;
  const denominator = rx * rx * y * y + ry * ry * x * x;
  const factor = (values[3] === values[4] ? -1 : 1)
    * Math.sqrt(Math.max(0, (rx * rx * ry * ry - denominator) / denominator));
  const cx = factor * rx * y / ry, cy = -factor * ry * x / rx;
  const center: Point = [cos * cx - sin * cy + (start[0] + end[0]) / 2,
    sin * cx + cos * cy + (start[1] + end[1]) / 2];
  const first = Math.atan2((y - cy) / ry, (x - cx) / rx);
  let sweep = Math.atan2((-y - cy) / ry, (-x - cx) / rx) - first;
  const tau = 2 * Math.PI;
  if (values[4] && sweep < 0) sweep += tau;
  if (!values[4] && sweep > 0) sweep -= tau;
  const [a, b, c, d] = transform.matrix;
  const u: Point = [rx * (a * cos + c * sin), rx * (b * cos + d * sin)];
  const v: Point = [ry * (-a * sin + c * cos), ry * (-b * sin + d * cos)];
  const mapped = transform.apply(center);
  const modulo = (angle: number) => ((angle % tau) + tau) % tau;
  for (const angle of [Math.atan2(v[0], u[0]), Math.atan2(v[1], u[1])].flatMap((angle) => [angle, angle + Math.PI])) {
    const distance = sweep >= 0 ? modulo(angle - first) : modulo(first - angle);
    if (distance <= Math.abs(sweep) + 1e-12) {
      endpoints.push([mapped[0] + u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
        mapped[1] + u[1] * Math.cos(angle) + v[1] * Math.sin(angle)]);
    }
  }
  return bounds(endpoints);
}

function pathBounds(path: string, transform: Transform): Bounds {
  const tokens = path.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gu) ?? [];
  const boxes: Bounds[] = [];
  let current: Point = [0, 0], start: Point = current, command = '', index = 0;
  while (index < tokens.length) {
    if (/^[A-Za-z]$/u.test(tokens[index])) command = tokens[index++];
    if (command === 'Z' || command === 'z') {
      boxes.push(bounds(transform.applyAll([current, start]))); current = start; command = ''; continue;
    }
    if (!['M', 'L', 'A', 'a'].includes(command)) throw new Error(`Unsupported catalog path command "${command}".`);
    const count = command === 'A' || command === 'a' ? 7 : 2;
    const values = tokens.slice(index, index + count).map(Number);
    if (values.length !== count || !values.every(Number.isFinite)) throw new Error('Invalid catalog path coordinates.');
    index += count;
    const end: Point = command === 'a' ? [current[0] + values[5], current[1] + values[6]]
      : [values[count - 2], values[count - 1]];
    if (count === 7) boxes.push(arcBounds(current, end, values, transform));
    else if (command === 'M') { start = end; boxes.push(bounds([transform.apply(end)])); command = 'L'; }
    else boxes.push(bounds(transform.applyAll([current, end])));
    current = end;
  }
  return unionBounds(boxes);
}

// Catalog assets use M/L/A paths, lines, polygons and circles without nested transforms.
// Text glyph extents and stroke widths are excluded from geometric bounds.
export function resolveSymbolBounds(id: string, transform = new Transform()): Bounds {
  const svg = resolveSymbol(id).svg.replace(/<!--[\s\S]*?-->/gu, '');
  const boxes: Bounds[] = [];
  for (const match of svg.matchAll(/<(path|line|polygon|circle)\b([^>]*)>/gu)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w:-]+)="([^"]*)"/gu)].map((entry) => [entry[1], entry[2]]));
    const n = (key: string) => Number(attributes[key]);
    if (match[1] === 'path') boxes.push(pathBounds(attributes.d, transform));
    else if (match[1] === 'circle') boxes.push(circleBounds([n('cx'), n('cy')], n('r'), transform));
    else if (match[1] === 'line') boxes.push(bounds(transform.applyAll([[n('x1'), n('y1')], [n('x2'), n('y2')]])));
    else {
      const values = attributes.points.trim().split(/[\s,]+/u).map(Number);
      const points: Point[] = [];
      for (let i = 0; i < values.length; i += 2) points.push([values[i], values[i + 1]]);
      boxes.push(bounds(transform.applyAll(points)));
    }
  }
  return unionBounds(boxes);
}

export function serializeSymbol(symbol: SymbolDrawing, instance: number): string {
  if (!Number.isSafeInteger(instance) || instance < 0) throw new RangeError('Symbol instance must be a nonnegative integer.');
  const artwork = symbol.svg.replace(/<\?xml[^?]*\?>\s*/u, '')
    .replace(/\bid="([^"]*)"/gu, (_, id: string) => `id="element-${instance}-${id}"`);
  return `<g transform="${symbol.svgTransform}">\n${artwork}\n</g>`;
}
