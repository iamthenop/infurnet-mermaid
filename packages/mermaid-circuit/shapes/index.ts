// SVG symbol index and terminal mappings.
// Coordinates are in each shape's own viewBox. Shapes with no terminals
// attach to their net at `anchor`.

import catalog from './shapes.json' with { type: 'json' };

export type Point = readonly [x: number, y: number];

export interface ShapeEntry {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly terminals: Readonly<Record<string, Point>>;
  readonly anchor?: Point;
}

type CatalogEntry<T> = {
  readonly [K in keyof T]: K extends 'terminals'
    ? { readonly [Terminal in keyof T[K]]: Point }
    : K extends 'anchor' ? Point : T[K];
};

type ShapeCatalog = {
  readonly [K in keyof typeof catalog]: CatalogEntry<(typeof catalog)[K]>;
};

function assertPoints(value: typeof catalog): asserts value is typeof catalog & ShapeCatalog {
  for (const entry of Object.values(value)) {
    const shape: { terminals: Record<string, number[]>; anchor?: number[] } = entry;
    for (const point of [...Object.values(shape.terminals), ...(shape.anchor ? [shape.anchor] : [])]) {
      if (point.length !== 2 || !point.every(Number.isFinite)) {
        throw new Error('Shape coordinates must contain two finite numbers.');
      }
    }
  }
}

assertPoints(catalog);
export const shapes: ShapeCatalog = catalog satisfies Record<string, ShapeEntry>;

export type ShapeType = keyof typeof shapes;
