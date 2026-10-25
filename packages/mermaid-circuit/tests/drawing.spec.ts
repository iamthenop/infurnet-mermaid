/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import catalog from '../shapes/shapes.json' with { type: 'json' };
import { symbolAssets } from '../src/generated/symbol-assets.js';
import { Transform, bounds, reflectHorizontal, reflectVertical, rotate, scale, translate,
  transformBounds, translateBounds, type Point } from '../src/drawing/geometry.js';
import { serializePrimitive, serializePrimitives, serializeTransform, type Primitive } from '../src/drawing/svg.js';
import { resolveSymbol, resolveTerminal } from '../src/drawing/symbols.js';
import { resolveSymbolBounds } from '../src/drawing/symbols.js';
import { Drawing, Element, Line, Wire, Dot, type WireShape } from '../src/drawing/core.js';

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

describe('Schemdraw drawing core', () => {
  it('adds sequential elements and restores nested cursor positions and directions', () => {
    const drawing = new Drawing();
    expect(drawing.here).toEqual([0, 0]);
    expect(drawing.theta).toBe(0);
    const first = drawing.add(new Line(120));
    drawing.push();
    const branch = drawing.add(new Line(60, { rotation: 90 }));
    expectPoint(drawing.here, [120, 60]);
    expect(drawing.theta).toBe(90);
    drawing.push();
    drawing.moveFrom([-10, -20], 0.25, -0.5, 37);
    drawing.move(5, 7);
    expectPoint(drawing.here, [-4.75, -13.5]);
    expect(drawing.elements).toEqual([first, branch]);
    drawing.pop();
    expectPoint(drawing.here, [120, 60]);
    expect(drawing.theta).toBe(90);
    drawing.pop();
    expectPoint(drawing.here, [120, 0]);
    expect(drawing.theta).toBe(0);
    drawing.pop();
    expectPoint(drawing.here, [120, 0]);
    expect(first.anchors.end).toEqual([120, 0]);
    expectPoint(branch.anchors.end, [120, 60]);
  });

  it('places a named anchor exactly and uses one matrix for reflection, scaling, artwork and terminals', () => {
    const drawing = new Drawing();
    drawing.moveFrom([300, 400], 0, 0, 25);
    const symbol = drawing.add(new Element('resistor', { at: [-5.5, 7.25], anchor: 'A',
      rotation: 90, scale: [2, 3], reverse: true, flip: true, drop: 'B' }));
    expectPoint(symbol.anchors.A, [-5.5, 7.25]);
    expectPoint(symbol.anchors.B, [-5.5, -232.75]);
    expectPoint(drawing.here, symbol.anchors.B);
    expect(drawing.theta).toBe(90);
    const [a, b, c, d, e, f] = symbol.symbol!.svgTransform.slice(7, -1).split(' ').map(Number);
    for (const [name, [x, y]] of Object.entries(catalog.resistor.terminals)) {
      expectPoint(symbol.anchors[name], [a * x + c * y + e, b * x + d * y + f]);
    }
    expect(symbol.symbol!.svg).toBe(sourceAssets['../shapes/resistor.svg']);
    expect(drawing.toSVG()).toContain(`transform="${symbol.symbol!.svgTransform}"`);
  });

  it('keeps placement without a drop from moving the cursor and reverses about the local center', () => {
    const drawing = new Drawing();
    drawing.moveFrom([3, 4], 0, 0, 45);
    const symbol = drawing.add(new Element('resistor', { at: [10, 20], rotation: 0, reverse: true }));
    expectPoint(symbol.anchors.A, [130, 80]);
    expectPoint(symbol.anchors.B, [10, 80]);
    expect(drawing.here).toEqual([3, 4]);
    expect(drawing.theta).toBe(45);
    drawing.add(new Element('resistor', { at: [0, 0], rotation: 0, drop: [120, 60] }));
    expect(drawing.here).toEqual([120, 60]);
    expect(drawing.theta).toBe(45);
  });

  it.each<[WireShape, readonly Point[], Point, number]>([
    ['-', [[15.25, -8.5], [-24.75, 31.5]], [-4.75, 11.5], 37],
    ['-|', [[15.25, -8.5], [-24.75, -8.5], [-24.75, 31.5]], [-24.75, 11.5], 90],
    ['|-', [[15.25, -8.5], [15.25, 31.5], [-24.75, 31.5]], [-4.75, 31.5], 180],
  ])('matches the pinned %s wire geometry, anchors and drop direction', (shape, points, mid, direction) => {
    const drawing = new Drawing();
    drawing.moveFrom([100, 200], 0, 0, 37);
    const wire = drawing.add(new Wire({ at: [15.25, -8.5], to: [-24.75, 31.5], shape }));
    expect(wire.primitives[0]).toMatchObject({ kind: 'polyline', points });
    expect(wire.anchors.start).toEqual(points[0]);
    expect(wire.anchors.end).toEqual(points.at(-1));
    expect(wire.anchors.xy).toEqual(points[0]);
    expect(wire.anchors.mid).toEqual(mid);
    expect(drawing.here).toEqual([-24.75, 31.5]);
    expect(drawing.theta).toBe(direction);
    expect(wire.bounds).toEqual({ minX: -24.75, minY: -8.5, maxX: 15.25, maxY: 31.5 });
  });

  it('preserves wire endpoints and the pinned drop conventions for zero-length final legs', () => {
    for (const [shape, theta] of [['-', 23], ['-|', -90], ['|-', 180]] as const) {
      const drawing = new Drawing();
      drawing.moveFrom([0.1, -0.2], 0, 0, 23);
      const wire = drawing.add(new Wire({ to: drawing.here, shape }));
      expect(wire.anchors.end).toEqual([0.1, -0.2]);
      expect(drawing.here).toEqual([0.1, -0.2]);
      expect(drawing.theta).toBe(theta);
    }
  });

  it('preserves direction for default dots, honors explicit rotation and bounds circles exactly', () => {
    const drawing = new Drawing();
    drawing.moveFrom([0, 0], 0, 0, 33);
    drawing.add(new Dot(1));
    expect(drawing.theta).toBe(33);
    const dot = drawing.add(new Dot(2, { at: [-10, -20], scale: [2, 1], rotation: 45 }));
    expect(drawing.here).toEqual([-10, -20]);
    expect(drawing.theta).toBe(45);
    expect(dot.primitives[0]).toMatchObject({ kind: 'circle', center: [0, 0], radius: 2, fill: '#000' });
    expectPoint([dot.bounds.minX, dot.bounds.minY], [-10 - Math.sqrt(10), -20 - Math.sqrt(10)]);
    expectPoint([dot.bounds.maxX, dot.bounds.maxY], [-10 + Math.sqrt(10), -20 + Math.sqrt(10)]);
  });

  it('composes two catalog devices, a terminal-to-terminal wire, dot and escaped labels in order', () => {
    const drawing = new Drawing();
    const first = drawing.add(new Element('resistor', { at: [-120, -60], labels: [{ text: 'R1 <&>', at: 'center' }] }));
    const second = drawing.add(new Element('resistor', { at: [120, 0], labels: [{ text: 'R2', at: 'center', offset: [0, 20] }] }));
    const wire = drawing.add(new Wire({ at: first.anchors.B, to: second.anchors.A, shape: '-|' }));
    const dot = drawing.add(new Dot(3, { at: wire.anchors.mid }));
    expect(wire.anchors.start).toEqual(first.anchors.B);
    expect(wire.anchors.end).toEqual(second.anchors.A);
    expect(wire.primitives[0]).toMatchObject({ points: [[0, 0], [120, 0], [120, 60]] });
    expect(dot.anchors.center).toEqual([120, 30]);
    expect(drawing.elements).toEqual([first, second, wire, dot]);
    expect(drawing.bounds).toEqual({ minX: -120, minY: -12, maxX: 240, maxY: 80 });
    const svg = drawing.toSVG();
    expect(svg).toBe(drawing.toSVG());
    expect(svg).toContain('viewBox="-124 -16 368 100"');
    expect(svg).toContain('R1 &lt;&amp;&gt;');
    expect(svg).toContain('Copyright (c) 2014-2026 Collin J. Delker');
    const ids = [...svg.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg.indexOf('element-0-resistor')).toBeLessThan(svg.indexOf('element-1-resistor'));
    expect(svg.indexOf('element-1-resistor')).toBeLessThan(svg.indexOf('<polyline'));
    expect(svg.indexOf('<polyline')).toBeLessThan(svg.indexOf('<circle'));
  });

  it('measures actual symbol geometry instead of the pane, including rotated vertices and arcs', () => {
    expect(resolveSymbolBounds('resistor')).toEqual({ minX: 0, minY: 48, maxX: 120, maxY: 72 });
    const transform = new Transform({ rotation: 45 });
    const result = resolveSymbolBounds('resistor', transform);
    expectPoint([result.minX, result.minY], [-60 * Math.SQRT1_2, 60 * Math.SQRT1_2]);
    expectPoint([result.maxX, result.maxY], [60 * Math.SQRT1_2, 180 * Math.SQRT1_2]);
    expect(result).not.toEqual(transformBounds(resolveSymbolBounds('resistor'), transform));
    const capacitor = resolveSymbolBounds('capacitor2');
    expectPoint([capacitor.minX, capacitor.minY], [0, 47.253333]);
    expectPoint([capacitor.maxX, capacitor.maxY], [120, 72.746666]);
  });

  it('leaves drawings unchanged on invalid placement and permits reusable element definitions', () => {
    const drawing = new Drawing(), line = new Line(10);
    const first = drawing.add(line), second = drawing.add(line);
    expect(first.anchors.start).toEqual([0, 0]);
    expect(first.anchors.end).toEqual([10, 0]);
    expect(second.anchors.end).toEqual([20, 0]);
    for (const element of [new Element('resistor', { anchor: 'missing' }),
      new Dot(1, { labels: [{ text: '\u0000', at: 'center' }] }),
      new Wire({ to: [1, 2], shape: 'z' as WireShape }), new Line(1, { at: [NaN, 0] }),
      new Element('resistor', { drop: [Infinity, 0] })]) {
      expect(() => drawing.add(element)).toThrow();
      expect(drawing.here).toEqual([20, 0]);
      expect(drawing.elements).toEqual([first, second]);
    }
    expect(() => new Line(-1)).toThrow(RangeError);
    expect(() => new Dot(-1)).toThrow(RangeError);
    expect(new Drawing().bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(new Drawing().toSVG(0)).toContain('viewBox="0 0 1 1"');
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
  it.each(['motor', 'solenoid', 'lamp', 'lamp2', 'breaker', 'antenna', 'opamp'] as const)(
    '%s draws independently with geometric bounds inside its pane', (id) => {
      const drawing = new Drawing();
      const element = drawing.add(new Element(id));
      expect(element.symbol!.svg).toBe(symbolAssets[id]);
      expect(drawing.bounds.minX).toBeGreaterThanOrEqual(0);
      expect(drawing.bounds.minY).toBeGreaterThanOrEqual(0);
      expect(drawing.bounds.maxX).toBeLessThanOrEqual(120);
      expect(drawing.bounds.maxY).toBeLessThanOrEqual(120);
      expect(drawing.bounds.maxX).toBeGreaterThan(drawing.bounds.minX);
      expect(drawing.bounds.maxY).toBeGreaterThan(drawing.bounds.minY);
      const svg = drawing.toSVG();
      expect(svg).toContain(`id="element-0-${id}"`);
      expect(svg).toBe(drawing.toSVG());
    },
  );

  it.each(['motor', 'solenoid'] as const)('%s rotates and reflects its artwork and attachments together', (id) => {
    const drawing = new Drawing();
    for (const rotation of [0, 90, 37]) {
      const placed = drawing.add(new Element(id, {
        at: [-20, 70], anchor: 'A', rotation, reverse: true, flip: true, scale: [1.5, 0.75],
      }));
      expectPoint(placed.anchors.A, [-20, 70]);
      expectPoint(placed.anchors.B, placed.transform.apply([120, 60]));
      expect(placed.symbol!.svgTransform).toBe(serializeTransform(placed.transform));
      expect(placed.bounds).toEqual(resolveSymbolBounds(id, placed.transform));
    }
    const svg = drawing.toSVG();
    const ids = [...svg.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bundles exactly the registered catalog', () => {
    expect(Object.keys(symbolAssets).sort()).toEqual(Object.keys(catalog).sort());
    expect(Object.keys(symbolAssets)).toHaveLength(110);
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
