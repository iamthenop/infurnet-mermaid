// SVG symbol index and terminal mappings.
// Coordinates are in each shape's own viewBox. Shapes with no terminals
// attach to their net at `anchor`.

import catalog from './shapes.json' with { type: 'json' };

export type Point = readonly [x: number, y: number];

type AllowedModes = readonly ['D'] | readonly ['A'] | readonly ['D', 'A'];

export interface ShapeEntry {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly terminals: Readonly<Record<string, Point>>;
  readonly anchor?: Point;
  readonly allowedModes: AllowedModes;
}

type CatalogEntry<T> = {
  readonly [K in keyof T]: K extends 'terminals'
    ? { readonly [Terminal in keyof T[K]]: Point }
    : K extends 'anchor' ? Point : K extends 'allowedModes' ? AllowedModes : T[K];
};

type ShapeCatalog = {
  readonly [K in keyof typeof catalog]: CatalogEntry<(typeof catalog)[K]>;
};

function assertCatalog(value: typeof catalog): asserts value is typeof catalog & ShapeCatalog {
  for (const entry of Object.values(value)) {
    const modes = entry.allowedModes;
    if (!Array.isArray(modes) || (!(modes.length === 1 && (modes[0] === 'D' || modes[0] === 'A'))
      && !(modes.length === 2 && modes[0] === 'D' && modes[1] === 'A'))) {
      throw new Error('Shape allowedModes must be ["D"], ["A"], or ["D", "A"].');
    }
    const shape: { terminals: Record<string, number[]>; anchor?: number[] } = entry;
    for (const point of [...Object.values(shape.terminals), ...(shape.anchor ? [shape.anchor] : [])]) {
      if (point.length !== 2 || !point.every(Number.isFinite)) {
        throw new Error('Shape coordinates must contain two finite numbers.');
      }
    }
  }
}

assertCatalog(catalog);
export const shapes: ShapeCatalog = catalog satisfies Record<string, ShapeEntry>;

export type ShapeType = keyof typeof shapes;
