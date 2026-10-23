/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import catalog from '../shapes/shapes.json' with { type: 'json' };
import { symbolAssets } from '../src/generated/symbol-assets.js';
import { Transform, bounds, reflectHorizontal, reflectVertical, rotate, scale, translate,
  transformBounds, translateBounds, type Point } from '../src/drawing/geometry.js';
import { serializePrimitive, serializePrimitives, serializeTransform, type Primitive } from '../src/drawing/svg.js';
import { resolveSymbol, resolveTerminal } from '../src/drawing/symbols.js';

const sourceAssets = import.meta.glob<string>('../shapes/*.svg', { eager: true, query: '?raw', import: 'default' });

function expectPoint(actual: Point, expected: Point): void {
  expect(actual[0]).toBeCloseTo(expected[0], 10);
  expect(actual[1]).toBeCloseTo(expected[1], 10);
}

describe('drawing geometry', () => {
  it('translates, scales and reflects without mutating points', () => {
    const point: Point = Object.freeze([2, -3]);
    expect(translate(point, [5, 7])).toEqual([7, 4]);
    expect(scale(point, 2)).toEqual([4, -6]);
    expect(scale(point, [3, 4])).toEqual([6, -12]);
    expect(scale(point, 0)).toEqual([0, 0]);
    expect(reflectHorizontal(point)).toEqual([-2, -3]);
    expect(reflectVertical(point)).toEqual([2, 3]);
    expect(point).toEqual([2, -3]);
  });

  it.each([
    [90, [0, 1]], [-90, [0, -1]], [180, [-1, 0]], [360, [1, 0]],
    [45, [Math.SQRT1_2, Math.SQRT1_2]],
  ] as const)('rotates clockwise by %s degrees in SVG coordinates', (degrees, expected) => {
    expectPoint(rotate([1, 0], degrees), expected);
  });

  it('applies local offset, scaling, rotation and global translation in order', () => {
    const options = Object.freeze({
      localOffset: Object.freeze([1, -1] as const), scale: Object.freeze([2, 3] as const),
      rotation: 90, translation: Object.freeze([10, 20] as const),
    });
    const points = Object.freeze([Object.freeze([2, 3] as const), Object.freeze([0, 0] as const)]);
    const transform = new Transform(options);
    const result = transform.applyAll(points);
    expectPoint(result[0], [4, 26]);
    expectPoint(result[1], [13, 22]);
    expect(transform.applyAll(points)).toEqual(result);
    expect(points).toEqual([[2, 3], [0, 0]]);
    expect(options).toEqual({ localOffset: [1, -1], scale: [2, 3], rotation: 90, translation: [10, 20] });
    expect(new Transform().applyAll(points)).toEqual(points);
    expect(result).not.toBe(points);
    expect(result[0]).not.toBe(points[0]);
    expect(new Transform().applyAll([])).toEqual([]);
  });

  it('computes and translates axis-aligned bounds', () => {
    expect(bounds([[-4, 2], [3, -7], [1, 9]])).toEqual({ minX: -4, minY: -7, maxX: 3, maxY: 9 });
    expect(bounds([[2, 3]])).toEqual({ minX: 2, minY: 3, maxX: 2, maxY: 3 });
    const box = Object.freeze({ minX: -1, minY: 2, maxX: 3, maxY: 4 });
    expect(translateBounds(box, [4, -5])).toEqual({ minX: 3, minY: -3, maxX: 7, maxY: -1 });
    expect(transformBounds(box, new Transform({ scale: [-2, 3], translation: [1, -2] })))
      .toEqual({ minX: -5, minY: 4, maxX: 3, maxY: 10 });
    expect(box).toEqual({ minX: -1, minY: 2, maxX: 3, maxY: 4 });
  });

  it('uses all four corners when rotating a bounding box', () => {
    const result = transformBounds({ minX: 0, minY: 0, maxX: 2, maxY: 1 }, new Transform({ rotation: 45 }));
    expectPoint([result.minX, result.minY], [-Math.SQRT1_2, 0]);
    expectPoint([result.maxX, result.maxY], [2 * Math.SQRT1_2, 3 * Math.SQRT1_2]);
    expect(() => bounds([])).toThrow('at least one point');
    expect(() => bounds([[Infinity, 0]])).toThrow('finite');
    expect(() => new Transform({ rotation: NaN })).toThrow('finite');
  });
});

describe('SVG fragments', () => {
  it.each<[Primitive, string]>([
    [{ kind: 'line', start: [-1.25, 2], end: [3, 4], stroke: '#123', strokeWidth: 2, fill: 'none' },
      '<line x1="-1.25" y1="2" x2="3" y2="4" stroke="#123" stroke-width="2" fill="none" />'],
    [{ kind: 'polyline', points: [[0, 1], [2.125, -3], [4, 5]], strokeWidth: 0, fill: 'none' },
      '<polyline points="0,1 2.125,-3 4,5" stroke-width="0" fill="none" />'],
    [{ kind: 'path', d: 'M 0 0 C 1 2 3 4 5 6 Z', fill: '#fff' },
      '<path d="M 0 0 C 1 2 3 4 5 6 Z" fill="#fff" />'],
    [{ kind: 'circle', center: [6, 7], radius: 2.5 }, '<circle cx="6" cy="7" r="2.5" />'],
    [{ kind: 'text', content: 'R1  10k Ω', anchor: [8, 9] },
      '<text x="8" y="9" xml:space="preserve">R1  10k Ω</text>'],
  ])('serializes $kind with valid element structure and exact attributes', (primitive, expected) => {
    expect(serializePrimitive(primitive)).toBe(expected);
  });

  it('escapes text and attributes without treating content as markup', () => {
    expect(serializePrimitive({ kind: 'text', anchor: [0, 0], content: '<script>&"\'\r\n\tΩ 😀',
      fill: 'red" onload="bad&<>' }))
      .toBe('<text x="0" y="0" xml:space="preserve" fill="red&quot; onload=&quot;bad&amp;&lt;&gt;">&lt;script&gt;&amp;&quot;&apos;&#13;&#10;&#9;Ω 😀</text>');
    expect(serializePrimitive({ kind: 'text', anchor: [0, 0], content: '' }))
      .toBe('<text x="0" y="0" xml:space="preserve"></text>');
  });

  it('preserves element order and omits invisible primitives', () => {
    const primitives: readonly Primitive[] = Object.freeze([
      Object.freeze({ kind: 'circle', center: [0, 0] as const, radius: 1 }),
      Object.freeze({ kind: 'path', d: 'M 0 0', visible: false }),
      Object.freeze({ kind: 'line', start: [1, 1] as const, end: [2, 2] as const }),
    ]);
    expect(serializePrimitives(primitives)).toBe('<circle cx="0" cy="0" r="1" />\n<line x1="1" y1="1" x2="2" y2="2" />');
    expect(serializePrimitive(primitives[1])).toBe('');
    expect(serializePrimitives([])).toBe('');
  });

  it('uses the affine transform for paths and nonuniformly scaled circles', () => {
    const transform = new Transform({ localOffset: [1, -1], scale: [2, 3], translation: [10, 20] });
    expect(serializeTransform(transform)).toBe('matrix(2 0 0 3 12 17)');
    expect(serializePrimitive({ kind: 'circle', center: [0, 0], radius: 5, transform }))
      .toBe('<circle cx="0" cy="0" r="5" transform="matrix(2 0 0 3 12 17)" />');
    expect(serializePrimitive({ kind: 'path', d: 'M 0 0 L 1 1', transform }))
      .toBe('<path d="M 0 0 L 1 1" transform="matrix(2 0 0 3 12 17)" />');
  });

  it.each<Primitive>([
    { kind: 'circle', center: [0, 0], radius: -1 },
    { kind: 'line', start: [NaN, 0], end: [0, 0] },
    { kind: 'polyline', points: [[0, Infinity]] },
    { kind: 'path', d: 'M 0 0', strokeWidth: -1 },
    { kind: 'text', anchor: [0, 0], content: '\u0000' },
    { kind: 'text', anchor: [0, 0], content: '\ud800' },
  ])('rejects invalid SVG values in $kind', (primitive) => {
    expect(() => serializePrimitive(primitive)).toThrow(RangeError);
  });
});

describe('registered symbol integration', () => {
  it('bundles exactly the registered catalog', () => {
    expect(Object.keys(symbolAssets).sort()).toEqual(Object.keys(catalog).sort());
    expect(Object.keys(symbolAssets)).toHaveLength(103);
  });

  it.each(Object.entries(catalog))('%s preserves source SVG bytes, notices and catalog metadata', (id, entry) => {
    const symbol = resolveSymbol(id);
    const source = sourceAssets[`../shapes/${entry.file}`];
    expect(symbol.svg).toBe(source);
    expect(symbol).toMatchObject({ id, width: entry.width, height: entry.height,
      terminals: entry.terminals, allowedModes: entry.allowedModes });
    expect(symbol.anchor).toEqual('anchor' in entry ? entry.anchor : undefined);
    expect(symbol.svgTransform).toBe('matrix(1 0 0 1 0 0)');
    for (const [terminal, point] of Object.entries(entry.terminals)) expect(resolveTerminal(id, terminal)).toEqual(point);
  });

  it.each(Object.entries(catalog))('%s keeps attachment points aligned with the artwork matrix', (id, entry) => {
    const transform = new Transform({ localOffset: [-60, -60], scale: [2, -1], rotation: 37, translation: [200, 300] });
    const symbol = resolveSymbol(id, transform);
    const matrix = symbol.svgTransform.slice(7, -1).split(' ').map(Number);
    expect(matrix).toHaveLength(6);
    const [a, b, c, d, e, f] = matrix;
    const artworkPoint = ([x, y]: readonly number[]): Point => [a * x + c * y + e, b * x + d * y + f];
    for (const [terminal, point] of Object.entries(entry.terminals)) {
      expectPoint(symbol.terminals[terminal], artworkPoint(point));
      expectPoint(resolveTerminal(id, terminal, transform), artworkPoint(point));
    }
    if ('anchor' in entry) expectPoint(symbol.anchor!, artworkPoint(entry.anchor));
    expect(symbol.svg).toBe(symbolAssets[id]);
  });

  it('maps NMOS terminals to known drawing coordinates without changing catalog values', () => {
    const transform = new Transform({ localOffset: [-60, -60], scale: [2, 1], rotation: 90, translation: [200, 300] });
    const symbol = resolveSymbol('nmos', transform);
    expectPoint(symbol.terminals.G, [200, 180]);
    expectPoint(symbol.terminals.D, [260, 360]);
    expectPoint(symbol.terminals.S, [140, 360]);
    expect(resolveSymbol('nmos').terminals).toEqual(catalog.nmos.terminals);
  });

  it.each(['ic-generic', 'ic-multiplexer', 'ic-demultiplexer', 'ic-dip', 'ic-d-flip-flop',
    'ic-jk-flip-flop', 'ic-voltage-regulator', 'ic-555', 'ic-seven-segment', 'missing', 'toString', '__proto__'])
    ('rejects unregistered symbol %s', (id) => {
      expect(Object.hasOwn(symbolAssets, id)).toBe(false);
      expect(() => resolveSymbol(id)).toThrow('Unknown registered symbol');
    });

  it.each(['missing', 'toString', '__proto__'])('rejects nonexistent terminal %s', (terminal) => {
    expect(() => resolveTerminal('nmos', terminal)).toThrow('Unknown terminal');
  });
});
