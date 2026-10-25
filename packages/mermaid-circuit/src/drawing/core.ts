// Adapted from Schemdraw's schemdraw.py, elements/elements.py and elements/lines.py (MIT).
// Copyright (c) 2014-2026 Collin J. Delker. See LICENSE and ACKNOWLEDGEMENTS.md.

import { Transform, bounds, circleBounds, translate, unionBounds, type Bounds, type Point } from './geometry.js';
import { serializePrimitives, serializeSvg, type Primitive } from './svg.js';
import { resolveSymbol, resolveSymbolBounds, serializeSymbol, type SymbolDrawing, type SymbolId } from './symbols.js';

export interface Label {
  readonly text: string;
  readonly at: string | Point;
  readonly offset?: Point;
}

export interface ElementOptions {
  readonly at?: Point;
  readonly rotation?: number;
  readonly scale?: number | Point;
  readonly reverse?: boolean;
  readonly flip?: boolean;
  readonly anchor?: string;
  readonly drop?: string | Point;
  readonly labels?: readonly Label[];
  readonly stroke?: string;
  readonly strokeWidth?: number;
}

type GeometryPrimitive = Extract<Primitive, { kind: 'line' | 'polyline' | 'circle' }>;
interface LocalElement {
  readonly symbol?: SymbolId;
  readonly primitives: readonly GeometryPrimitive[];
  readonly anchors: Readonly<Record<string, Point>>;
  readonly at: Point;
  readonly rotation: number;
  readonly drop?: string | Point;
  readonly dropDirection?: number;
}

export interface PlacedElement {
  readonly transform: Transform;
  readonly anchors: Readonly<Record<string, Point>>;
  readonly bounds: Bounds;
  readonly primitives: readonly Primitive[];
  readonly symbol?: SymbolDrawing;
  readonly nextPosition: Point;
  readonly nextDirection: number;
}

function namedAnchor(anchors: Readonly<Record<string, Point>>, name: string): Point {
  if (!Object.hasOwn(anchors, name)) throw new Error(`Unknown drawing anchor "${name}".`);
  return anchors[name];
}

function primitiveBounds(primitive: GeometryPrimitive, transform: Transform): Bounds {
  if (primitive.kind === 'circle') return circleBounds(primitive.center, primitive.radius, transform);
  return bounds(transform.applyAll(primitive.kind === 'line' ? [primitive.start, primitive.end] : primitive.points));
}

export class Element {
  constructor(protected readonly symbolId: SymbolId | undefined, protected readonly options: ElementOptions = {}) {}

  protected geometry(position: Point, direction: number): LocalElement {
    if (this.symbolId === undefined) throw new Error('A catalog element requires a registered symbol.');
    const symbol = resolveSymbol(this.symbolId);
    return {
      symbol: this.symbolId, primitives: [],
      anchors: { center: [symbol.width / 2, symbol.height / 2], ...symbol.terminals,
        ...(symbol.anchor ? { anchor: symbol.anchor } : {}) },
      at: this.options.at ?? position, rotation: this.options.rotation ?? direction, drop: this.options.drop,
    };
  }

  place(position: Point = [0, 0], direction = 0): PlacedElement {
    bounds([position]);
    if (!Number.isFinite(direction)) throw new RangeError('Drawing direction must be finite.');
    const local = this.geometry(position, direction);
    const localBounds = local.symbol ? resolveSymbolBounds(local.symbol)
      : unionBounds(local.primitives.map((primitive) => primitiveBounds(primitive, new Transform())));
    const selected = this.options.anchor === undefined ? undefined : namedAnchor(local.anchors, this.options.anchor);
    const centerX = local.anchors.center?.[0] ?? (localBounds.minX + localBounds.maxX) / 2;
    const offset: Point = selected ? [-selected[0], -selected[1]]
      : [this.options.reverse ? -2 * centerX : 0, 0];
    const scale = this.options.scale ?? 1;
    const [sx, sy] = typeof scale === 'number' ? [scale, scale] : scale;
    const transform = new Transform({ translation: local.at, rotation: local.rotation, localOffset: offset,
      scale: [sx * (this.options.reverse ? -1 : 1), sy * (this.options.flip ? -1 : 1)] });
    const anchors: Record<string, Point> = Object.fromEntries(Object.entries(local.anchors)
      .map(([name, point]) => [name, transform.apply(point)]));
    anchors.xy = transform.apply(local.anchors.xy ?? [0, 0]);
    const primitives: Primitive[] = local.primitives.map((primitive) => ({
      stroke: this.options.stroke ?? '#000', strokeWidth: this.options.strokeWidth ?? 2, fill: 'none', ...primitive, transform,
    }));
    const boxes = local.symbol ? [resolveSymbolBounds(local.symbol, transform)]
      : local.primitives.map((primitive) => primitiveBounds(primitive, transform));
    for (const label of this.options.labels ?? []) {
      const point = typeof label.at === 'string' ? namedAnchor(local.anchors, label.at) : label.at;
      const anchor = transform.apply(translate(point, label.offset ?? [0, 0]));
      primitives.push({ kind: 'text', content: label.text, anchor, fill: this.options.stroke ?? '#000' });
      boxes.push(bounds([anchor]));
    }
    const drop = local.drop;
    const nextPosition = drop === undefined ? [...position] as Point
      : transform.apply(typeof drop === 'string' ? namedAnchor(local.anchors, drop) : drop);
    const nextDirection = drop === undefined ? direction : local.dropDirection
      ?? (typeof drop !== 'string' && this.options.rotation === 0 ? direction : local.rotation);
    bounds([nextPosition]);
    // Validate serialized user values before a Drawing commits the placement.
    serializePrimitives(primitives);
    return { transform, anchors, bounds: unionBounds(boxes), primitives,
      ...(local.symbol ? { symbol: resolveSymbol(local.symbol, transform) } : {}), nextPosition, nextDirection };
  }
}

export class Line extends Element {
  constructor(readonly length = 3, options: ElementOptions = {}) {
    super(undefined, options);
    if (!Number.isFinite(length) || length < 0) throw new RangeError('Line length must be finite and nonnegative.');
  }

  protected override geometry(position: Point, direction: number): LocalElement {
    return { primitives: [{ kind: 'line', start: [0, 0], end: [this.length, 0] }],
      anchors: { start: [0, 0], end: [this.length, 0], center: [this.length / 2, 0] },
      at: this.options.at ?? position, rotation: this.options.rotation ?? direction, drop: this.options.drop ?? 'end' };
  }
}

export type WireShape = '-' | '-|' | '|-';
export interface WireOptions {
  readonly at?: Point;
  readonly to: Point;
  readonly shape?: WireShape;
  readonly labels?: readonly Label[];
  readonly stroke?: string;
  readonly strokeWidth?: number;
}

export class Wire extends Element {
  constructor(private readonly wire: WireOptions) { super(undefined, wire); }

  protected override geometry(position: Point, direction: number): LocalElement {
    const start: Point = [...(this.wire.at ?? position)], end: Point = [...this.wire.to];
    bounds([start, end]);
    const shape = this.wire.shape ?? '-';
    let points: Point[], mid: Point, dropDirection = direction;
    if (shape === '-') {
      points = [start, end]; mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    } else if (shape === '-|') {
      points = [start, [end[0], start[1]], end]; mid = [end[0], (start[1] + end[1]) / 2];
      dropDirection = end[1] > start[1] ? 90 : -90;
    } else if (shape === '|-') {
      points = [start, [start[0], end[1]], end]; mid = [(start[0] + end[0]) / 2, end[1]];
      dropDirection = end[0] > start[0] ? 0 : 180;
    } else throw new Error(`Unsupported wire shape "${shape}".`);
    // Absolute wire coordinates avoid subtract/add rounding at attachment points.
    return { primitives: [{ kind: 'polyline', points }], anchors: { start, end, mid, xy: start },
      at: [0, 0], rotation: 0, drop: 'end', dropDirection };
  }
}

export class Dot extends Element {
  constructor(readonly radius = 0.075, options: ElementOptions = {}) {
    super(undefined, options);
    if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Dot radius must be finite and nonnegative.');
  }

  protected override geometry(position: Point, direction: number): LocalElement {
    const rotation = this.options.rotation ?? 0, drop = this.options.drop ?? [0, 0] as Point;
    return { primitives: [{ kind: 'circle', center: [0, 0], radius: this.radius, fill: this.options.stroke ?? '#000' }],
      anchors: { start: [0, 0], center: [0, 0], end: [0, 0] }, at: this.options.at ?? position,
      rotation, drop, dropDirection: rotation === 0 && typeof drop !== 'string' ? direction : rotation };
  }
}

export class Drawing {
  private placed: PlacedElement[] = [];
  private position: Point = [0, 0];
  private direction = 0;
  private states: { position: Point; direction: number }[] = [];

  get elements(): readonly PlacedElement[] { return [...this.placed]; }
  get here(): Point { return [...this.position]; }
  get theta(): number { return this.direction; }
  get bounds(): Bounds { return unionBounds(this.placed.map((element) => element.bounds)); }

  add(element: Element): PlacedElement {
    const placed = element.place(this.position, this.direction);
    this.placed.push(placed);
    this.position = placed.nextPosition;
    this.direction = placed.nextDirection;
    return placed;
  }

  move(dx = 0, dy = 0): void { this.moveFrom(this.position, dx, dy); }

  moveFrom(reference: Point, dx = 0, dy = 0, direction = this.direction): void {
    const next = translate(reference, [dx, dy]);
    bounds([next]);
    if (!Number.isFinite(direction)) throw new RangeError('Drawing direction must be finite.');
    this.position = next; this.direction = direction;
  }

  push(): void { this.states.push({ position: [...this.position], direction: this.direction }); }

  pop(): void {
    const state = this.states.pop();
    if (state) { this.position = state.position; this.direction = state.direction; }
  }

  toSVG(margin = 4): string {
    const content = this.placed.map((element, index) => [
      element.symbol ? serializeSymbol(element.symbol, index) : '', serializePrimitives(element.primitives),
    ].filter(Boolean).join('\n')).join('\n');
    return serializeSvg(content, this.bounds, margin);
  }
}
