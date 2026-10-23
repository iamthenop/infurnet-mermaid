// Adapted from Schemdraw's transform.py and segments.py (MIT).
// Copyright (c) 2014-2026 Collin J. Delker. See LICENSE and ACKNOWLEDGEMENTS.md.

export type Point = readonly [x: number, y: number];
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export interface TransformOptions {
  readonly localOffset?: Point;
  readonly scale?: number | Point;
  readonly rotation?: number;
  readonly translation?: Point;
}

export class Transform {
  readonly matrix: Matrix;

  constructor({ localOffset = [0, 0], scale = 1, rotation = 0, translation = [0, 0] }: TransformOptions = {}) {
    const [sx, sy] = typeof scale === 'number' ? [scale, scale] : scale;
    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const a = sx * cos, b = sx * sin, c = -sy * sin, d = sy * cos;
    this.matrix = Object.freeze([
      a, b, c, d,
      a * localOffset[0] + c * localOffset[1] + translation[0],
      b * localOffset[0] + d * localOffset[1] + translation[1],
    ]);
    if (!this.matrix.every(Number.isFinite)) throw new RangeError('Transform must have finite coordinates.');
  }

  apply([x, y]: Point): Point {
    const [a, b, c, d, e, f] = this.matrix;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  applyAll(points: readonly Point[]): Point[] {
    return points.map((point) => this.apply(point));
  }
}

export function translate(point: Point, offset: Point): Point {
  return new Transform({ translation: offset }).apply(point);
}

export function rotate(point: Point, degrees: number): Point {
  return new Transform({ rotation: degrees }).apply(point);
}

export function scale(point: Point, factor: number | Point): Point {
  return new Transform({ scale: factor }).apply(point);
}

// Horizontal reflection reverses X; vertical reflection reverses Y.
export function reflectHorizontal(point: Point): Point {
  return scale(point, [-1, 1]);
}

export function reflectVertical(point: Point): Point {
  return scale(point, [1, -1]);
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function bounds(points: readonly Point[]): Bounds {
  if (points.length === 0) throw new RangeError('Bounds require at least one point.');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Bounds require finite coordinates.');
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

export function transformBounds(box: Bounds, transform: Transform): Bounds {
  return bounds(transform.applyAll([
    [box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY],
  ]));
}

export function translateBounds(box: Bounds, offset: Point): Bounds {
  return transformBounds(box, new Transform({ translation: offset }));
}
