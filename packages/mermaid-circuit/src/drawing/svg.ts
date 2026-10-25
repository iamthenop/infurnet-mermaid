// Adapted from Schemdraw's segments.py and backends/svg.py (MIT).
// Copyright (c) 2014-2026 Collin J. Delker. See LICENSE and ACKNOWLEDGEMENTS.md.

import { type Bounds, type Point, type Transform } from './geometry.js';

export interface Presentation {
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly fill?: string;
  readonly visible?: boolean;
  readonly transform?: Transform;
}

export type Primitive = Presentation & (
  | { readonly kind: 'line'; readonly start: Point; readonly end: Point }
  | { readonly kind: 'polyline'; readonly points: readonly Point[] }
  | { readonly kind: 'path'; readonly d: string }
  | { readonly kind: 'circle'; readonly center: Point; readonly radius: number }
  | { readonly kind: 'text'; readonly content: string; readonly anchor: Point }
);

function number(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('SVG numbers must be finite.');
  return String(value);
}

function escape(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(value)) {
    throw new RangeError('SVG strings must contain valid XML characters.');
  }
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
    .replace(/\r/gu, '&#13;').replace(/\n/gu, '&#10;').replace(/\t/gu, '&#9;');
}

export function serializeTransform(transform: Transform): string {
  return `matrix(${transform.matrix.map(number).join(' ')})`;
}

export function serializePrimitive(primitive: Primitive): string {
  if (primitive.visible === false) return '';
  const attributes: Record<string, string> = {};
  let content: string | undefined;
  switch (primitive.kind) {
    case 'line':
      attributes.x1 = number(primitive.start[0]); attributes.y1 = number(primitive.start[1]);
      attributes.x2 = number(primitive.end[0]); attributes.y2 = number(primitive.end[1]);
      break;
    case 'polyline':
      attributes.points = primitive.points.map(([x, y]) => `${number(x)},${number(y)}`).join(' ');
      break;
    case 'path':
      attributes.d = primitive.d;
      break;
    case 'circle':
      if (primitive.radius < 0) throw new RangeError('Circle radius must not be negative.');
      attributes.cx = number(primitive.center[0]); attributes.cy = number(primitive.center[1]);
      attributes.r = number(primitive.radius);
      break;
    case 'text':
      attributes.x = number(primitive.anchor[0]); attributes.y = number(primitive.anchor[1]);
      attributes['xml:space'] = 'preserve';
      content = escape(primitive.content);
      break;
  }
  if (primitive.stroke !== undefined) attributes.stroke = primitive.stroke;
  if (primitive.strokeWidth !== undefined) {
    if (primitive.strokeWidth < 0) throw new RangeError('Stroke width must not be negative.');
    attributes['stroke-width'] = number(primitive.strokeWidth);
  }
  if (primitive.fill !== undefined) attributes.fill = primitive.fill;
  if (primitive.transform !== undefined) attributes.transform = serializeTransform(primitive.transform);
  const serialized = Object.entries(attributes).map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
  return content === undefined ? `<${primitive.kind}${serialized} />`
    : `<${primitive.kind}${serialized}>${content}</${primitive.kind}>`;
}

export function serializePrimitives(primitives: readonly Primitive[]): string {
  return primitives.map(serializePrimitive).filter((element) => element !== '').join('\n');
}

// Content consists of trusted catalog artwork and serialized primitives.
export function serializeSvg(content: string, box: Bounds, margin = 4): string {
  if (!Number.isFinite(margin) || margin < 0) throw new RangeError('SVG margin must be finite and nonnegative.');
  const width = Math.max(1, box.maxX - box.minX + 2 * margin);
  const height = Math.max(1, box.maxY - box.minY + 2 * margin);
  const viewBox = [box.minX - margin, box.minY - margin, width, height].map(number).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${number(width)}" height="${number(height)}" overflow="visible">\n${content}\n</svg>`;
}
