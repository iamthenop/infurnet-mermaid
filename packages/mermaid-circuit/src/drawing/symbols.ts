import catalog from '../../shapes/shapes.json' with { type: 'json' };
import { symbolAssets } from '../generated/symbol-assets.js';
import { Transform, type Point } from './geometry.js';
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
