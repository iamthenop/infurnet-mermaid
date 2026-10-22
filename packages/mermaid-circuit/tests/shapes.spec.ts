/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { shapes, type Point, type ShapeEntry, type ShapeType } from '../shapes/index.js';
import catalog from '../shapes/shapes.json' with { type: 'json' };
import notation from '../spec/notation.md?raw';

const assets = import.meta.glob<string>('../shapes/*.svg', { eager: true, query: '?raw', import: 'default' });
const readSvg = (file: string) => {
  const svg = assets[`../shapes/${file}`];
  expect(svg, file).toBeTypeOf('string');
  return svg!;
};
const attributes = (tag: string): Record<string, string> => Object.fromEntries(
  [...tag.matchAll(/([\w-]+)="([^"]*)"/gu)].map((match) => [match[1], match[2]]),
);
const points = (value: string): Point[] => value.trim().split(/\s+/u).map((pair) => {
  const values = pair.split(',').map(Number);
  expect(values).toHaveLength(2);
  expect(values.every(Number.isFinite)).toBe(true);
  return [values[0]!, values[1]!];
});
const elements = (svg: string, names: string) => [...svg.matchAll(new RegExp(`<(${names})\\b[^>]*>`, 'gu'))]
  .map((match) => ({ name: match[1]!, attrs: attributes(match[0]) }));
const pathSubpaths = (value: string): Point[][] => {
  const tokens = value.match(/[MLAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/gu)!;
  const paths: Point[][] = [];
  let command = '', index = 0;
  let current: Point = [0, 0];
  while (index < tokens.length) {
    if (/^[MLAaZz]$/u.test(tokens[index]!)) command = tokens[index++]!;
    if (command === 'Z' || command === 'z') {
      paths.at(-1)!.push(paths.at(-1)![0]!);
      command = '';
      continue;
    }
    expect(['M', 'L', 'A', 'a']).toContain(command);
    const count = command === 'A' || command === 'a' ? 7 : 2;
    const values = tokens.slice(index, index + count).map(Number);
    expect(values).toHaveLength(count);
    index += count;
    const end: Point = [values.at(-2)!, values.at(-1)!];
    current = command === 'a' ? [current[0] + end[0], current[1] + end[1]] : end;
    if (command === 'M') paths.push([]);
    paths.at(-1)!.push(current);
  }
  return paths;
};
const pathPoints = (attrs: Record<string, string>) => pathSubpaths(attrs.d!).flat();
const referencePaths = (key: ShapeType) => elements(readSvg(shapes[key].file), 'path').map(({ attrs }) => attrs);
const snap = (span: number) => span === 240
  ? [0, 30, 40, 60, 80, 90, 120, 150, 160, 180, 200, 210, 240]
  : [0, 30, 40, 60, 80, 90, 120];

const variants = {
  fets: 'jfet jfetN jfetP jfetNCircle jfetPCircle hemt hemtUnsplit nmosDiode pmosDiode nmosCircle pmosCircle analogNFet analogPFet analogBiasedFet analogNFetBulk analogPFetBulk analogBiasedFetBulk analogPFetNoArrow analogBiasedFetNoArrow analogNFetCenteredGate analogPFetCenteredGate analogBiasedFetCenteredGate nfet2 pfet2 jfetN2 jfetP2 nmos2Diode pmos2Diode nmos2Circle pmos2Circle'.split(' '),
  resistors: 'resistorIEC resistorVar resistorVarIEC potentiometer potentiometerIEC photoresistor photoresistorIEC fuse fuseUs fuseIEC thermistor'.split(' '),
  diodes: 'diodeFilled schottky diodeTunnel diodeShockley zener diodeTVS varactor led led2 photodiode diac triac scr'.split(' '),
  capacitors: 'capacitorPolar capacitor2 capacitor2Polar capacitorVar capacitorTrim'.split(' '),
  sources: 'source sourceSin sourcePulse sourceSquare sourceTriangle sourceRamp sourceControlled sourceControlledI sourceControlledV batteryCell battery solar'.split(' '),
  grounds: 'groundSignal groundChassis vss'.split(' '),
};

const deferredVariants = ['hemtNoArrow', 'rshunt', 'batteryDouble'] as const;
const digitalAdditions = ['and', 'nand', 'or', 'nor', 'xor', 'xnor', 'notNot', 'tgate',
  'tristate', 'schmitt', 'schmittNot', 'schmittAnd', 'schmittNand'] as const;
const sharedShapes = ['pinIn', 'pinOut', 'pinInOut', 'supplyNet', 'ground', 'groundSignal', 'groundChassis', 'vss'];

describe('shape catalog', () => {
  it('keeps the approved inventory complete and deferred variants absent', () => {
    expect(Object.values(variants).flat()).toHaveLength(74);
    expect(Object.keys(shapes)).toHaveLength(103);
    for (const key of deferredVariants) expect(Object.keys(shapes)).not.toContain(key);
  });
  it.each(Object.entries(variants))('contains every approved %s variant', (_family, keys) => {
    expect(Object.keys(shapes)).toEqual(expect.arrayContaining(keys));
  });
  it('retains existing assets and exposes only approved catalog keys', () => {
    expect(shapes).toEqual(catalog);
    expect(Object.values(shapes).map((shape) => shape.file).sort()).toEqual(
      Object.keys(assets).map((path) => path.split('/').at(-1)!).sort(),
    );
    const definitions = [...notation.matchAll(/^\| `([^`]+)` \| (Device|Net) \| ([^|]+) \|$/gmu)];
    expect(definitions).toHaveLength(17);
    const existing = definitions.map((match) => match[1]!).filter((key) => key !== 'net');
    expect(Object.keys(shapes)).toEqual(expect.arrayContaining(existing));
    const approved = new Set([...existing, ...Object.values(variants).flat(), ...digitalAdditions]);
    for (const key of Object.keys(shapes)) expect(approved.has(key), key).toBe(true);
    expect(existing).not.toContain('source');
    for (const [, key, , terminals] of definitions) {
      if (key === 'net') continue;
      const shape: ShapeEntry = shapes[key as ShapeType];
      expect(Object.keys(shape.terminals).sort()).toEqual(terminals === 'None' ? [] : terminals!.split(', ').sort());
    }
  });

  it('classifies every shape through its approved allowedModes contract', () => {
    const digital: readonly string[] = ['buffer', 'inverter', ...digitalAdditions];
    const counts = { digital: 0, shared: 0, electrical: 0 };
    for (const [key, shape] of Object.entries(shapes)) {
      expect([['D'], ['A'], ['D', 'A']]).toContainEqual(shape.allowedModes);
      const family = digital.includes(key) ? 'digital' : sharedShapes.includes(key) ? 'shared' : 'electrical';
      expect(shape.allowedModes, key).toEqual(family === 'digital' ? ['D'] : family === 'shared' ? ['D', 'A'] : ['A']);
      counts[family]++;
    }
    expect(counts).toEqual({ digital: 15, shared: 8, electrical: 80 });
  });

  it('preserves all existing catalog values apart from mode eligibility', async () => {
    const added: readonly string[] = digitalAdditions;
    const existing = Object.fromEntries(Object.entries(shapes).filter(([key]) => !added.includes(key))
      .map(([key, { allowedModes: _modes, ...entry }]) => [key, entry]));
    expect(Object.keys(existing)).toHaveLength(90);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(existing)));
    expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''))
      .toBe('0d496b1acc8dacb2252e46066fdc54aed4fd2f7b911b9d890b9ff04a0015e01b');
  });

  it.each(digitalAdditions)('%s preserves its digital terminal and marker contracts', (key) => {
    const single: readonly string[] = ['notNot', 'schmitt', 'schmittNot', 'tristate', 'tgate'];
    const expected: Record<string, Point> = single.includes(key)
      ? { I: [0, 60], O: [120, 60] } : { I1: [0, 40], I2: [0, 80], O: [120, 60] };
    if (key === 'tgate' || key === 'tristate') expected.C = [60, 0];
    if (key === 'tgate') expected.Cbar = [60, 120];
    expect(shapes[key].terminals).toEqual(expected);
    const svg = readSvg(shapes[key].file);
    const circles = elements(svg, 'circle').map(({ attrs }) => attrs);
    const inverted: readonly string[] = ['nand', 'nor', 'xnor', 'notNot', 'tristate', 'schmittNot', 'schmittNand'];
    expect(circles.map((circle) => circle.id).sort()).toEqual(
      (key === 'notNot' ? ['input-bubble', 'output-bubble']
        : key === 'tgate' ? ['control-bubble'] : inverted.includes(key) ? ['output-bubble'] : []).sort(),
    );
    for (const circle of circles.filter((circle) => circle.id !== 'control-bubble')) {
      expect(Number(circle.cy)).toBe(60);
      expect(Number(circle.r)).toBeCloseTo(7.776);
    }
    const paths = referencePaths(key);
    const marker = paths.find((path) => path.id === 'schmitt-mark');
    expect(Boolean(marker)).toBe(key.startsWith('schmitt'));
    if (marker) {
      const segments = pathSubpaths(marker.d!);
      expect(segments.map((segment) => segment.length)).toEqual([3, 3]);
      for (const segment of segments) {
        expect(segment[0]![1]).toBe(segment[1]![1]);
        expect(segment[1]![0]).toBe(segment[2]![0]);
        expect(Math.abs(segment[2]![1] - segment[1]![1])).toBeCloseTo(19.44);
      }
    }
    expect(paths.some((path) => path.id === 'exclusive-input')).toBe(key === 'xor' || key === 'xnor');
    if (key === 'tgate') {
      expect(paths.some((path) => path.id === 'reverse-body')).toBe(true);
      expect(Number(circles[0]!.cx)).toBe(60);
      expect(Number(circles[0]!.cy)).toBeGreaterThan(60);
      const contact = pathPoints(paths.find((path) => path.id === 'control-contact')!);
      expect(contact.at(-1)![1]).toBeCloseTo(Number(circles[0]!.cy) - Number(circles[0]!.r));
    }
    expect(svg).toContain('https://schemdraw.readthedocs.io/en/stable/_images/logic_');
    expect(svg).toContain('Copyright (c) 2014-2026 Collin J. Delker');
    expect(svg).not.toMatch(/<(?:text|tspan|use)\b|(?:href|font-family)=/u);
    expect(notation).not.toContain(`:::${key}`);
  });

  it.each(Object.entries(shapes))('%s has grid-aligned attachments and geometry inside its pane', (_key, entry) => {
    const shape: ShapeEntry = entry;
    const svg = readSvg(shape.file);
    const root = elements(svg, 'svg')[0]!.attrs;
    expect(root.xmlns).toBe('http://www.w3.org/2000/svg');
    expect([Number(root.width), Number(root.height)]).toEqual([shape.width, shape.height]);
    expect(root.viewBox!.split(/\s+/u).map(Number)).toEqual([0, 0, shape.width, shape.height]);
    expect(shape.height).toBe(120);
    expect(shape.width).toBe(120);
    const group = elements(svg, 'g')[0]!.attrs;
    expect(group.stroke).toBe('#000');
    expect(group['stroke-width']).toBe('2');
    expect(svg).not.toMatch(/<(?:script|image|foreignObject)\b|\btransform=/u);

    const lineEnds: Point[] = [];
    for (const { name, attrs } of elements(svg, 'line|polyline')) {
      const vertices: Point[] = name === 'line'
        ? [[Number(attrs.x1), Number(attrs.y1)], [Number(attrs.x2), Number(attrs.y2)]]
        : points(attrs.points!);
      lineEnds.push(vertices[0]!, vertices.at(-1)!);
    }
    for (const { attrs } of elements(svg, 'path')) {
      for (const subpath of pathSubpaths(attrs.d!)) lineEnds.push(subpath[0]!, subpath.at(-1)!);
    }
    for (const point of [...Object.values(shape.terminals), ...(shape.anchor ? [shape.anchor] : [])]) {
      expect(point).toHaveLength(2);
      expect(snap(shape.width)).toContain(point[0]);
      expect(snap(shape.height)).toContain(point[1]);
      expect(point[0]).toBeGreaterThanOrEqual(0);
      expect(point[0]).toBeLessThanOrEqual(shape.width);
      expect(point[1]).toBeGreaterThanOrEqual(0);
      expect(point[1]).toBeLessThanOrEqual(shape.height);
      expect(lineEnds).toContainEqual(point);
    }

    for (const { name, attrs } of elements(svg, 'line|polyline|polygon|circle|rect|path')) {
      let vertices: Point[];
      if (name === 'circle') {
        const cx = Number(attrs.cx), cy = Number(attrs.cy), radius = Number(attrs.r);
        expect(radius).toBeGreaterThan(0);
        vertices = [[cx - radius, cy - radius], [cx + radius, cy + radius]];
      } else if (name === 'rect') {
        const x = Number(attrs.x), y = Number(attrs.y);
        expect(Number(attrs.width)).toBeGreaterThan(0);
        expect(Number(attrs.height)).toBeGreaterThan(0);
        vertices = [[x, y], [x + Number(attrs.width), y + Number(attrs.height)]];
      } else if (name === 'path') {
        vertices = pathPoints(attrs);
      } else {
        vertices = name === 'line'
          ? [[Number(attrs.x1), Number(attrs.y1)], [Number(attrs.x2), Number(attrs.y2)]]
          : points(attrs.points!);
      }
      for (const [x, y] of vertices) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(shape.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(shape.height);
      }
    }
  });

  it('preserves terminal contracts for added visual symbols', () => {
    const added = new Set(Object.values(variants).flat());
    for (const [key, entry] of Object.entries(shapes)) {
      if (!added.has(key)) continue;
      const shape: ShapeEntry = entry;
      const expected = variants.grounds.includes(key) ? []
        : variants.fets.includes(key) ? ['G', 'S', 'D', ...(key.endsWith('Bulk') ? ['B'] : [])]
          : key === 'triac' ? ['A1', 'A2', 'G']
            : key === 'scr' ? ['A', 'K', 'G']
              : key === 'diac' || key === 'source' || key === 'sourceControlled' ? ['A', 'B']
                : variants.diodes.includes(key) ? ['A', 'K']
                  : variants.sources.includes(key) ? ['P', 'N']
                    : key.startsWith('potentiometer') ? ['A', 'B', 'W'] : ['A', 'B'];
      expect(Object.keys(shape.terminals).sort(), key).toEqual(expected.sort());
      expect(Boolean(shape.anchor), key).toBe(variants.grounds.includes(key));
    }
  });

  it('preserves the reference controlled-source marks and terminal polarity', () => {
    expect(referencePaths('sourceControlled')).toHaveLength(1);
    const current = referencePaths('sourceControlledI');
    const voltage = referencePaths('sourceControlledV');
    expect(current).toHaveLength(3);
    expect(voltage).toHaveLength(4);
    expect(current[2]!.fill).toBe('#000');
    for (const key of ['sourceControlledI', 'sourceControlledV'] as const) {
      expect(shapes[key].terminals.P).toEqual([120, 60]);
      expect(shapes[key].terminals.N).toEqual([0, 60]);
      expect(notation).not.toContain(`:::${key}`);
    }
    const tip = pathPoints(current[2]!)[0]!;
    expect(tip[0]).toBeGreaterThan(pathPoints(current[2]!)[1]![0]);
    expect(pathPoints(voltage[2]!).every(([x]) => x > 60)).toBe(true);
    expect(elements(readSvg(shapes.source.file), 'circle')).toHaveLength(1);
  });

  it('keeps expanded resistor and source attachments horizontal', () => {
    const keys = ['resistorIEC', 'resistorVar', 'resistorVarIEC', 'fuse', 'fuseUs', 'fuseIEC',
      'thermistor', 'source', 'sourceSin', 'sourceSquare', 'sourceTriangle', 'sourceRamp',
      'sourceControlled', 'sourceControlledI', 'sourceControlledV', 'batteryCell', 'battery'] as const;
    for (const key of keys) {
      const terminals = Object.values(shapes[key].terminals).sort((a, b) => a[0] - b[0]);
      expect(terminals, key).toEqual([[0, 60], [120, 60]]);
    }
    for (const key of ['resistorVar', 'resistorVarIEC'] as const) {
      expect(referencePaths(key)[2]!.fill).toBe('#000');
    }
  });

  it('preserves the reference resistor body and adjustment-arrow crossing', () => {
    const full = pathPoints(referencePaths('resistor')[0]!);
    expect(shapes.resistor.terminals).toEqual({ A: [0, 60], B: [120, 60] });
    expect(full[0]).toEqual(shapes.resistor.terminals.A);
    expect(full.at(-1)).toEqual(shapes.resistor.terminals.B);
    const body = full.slice(1, -1);
    expect(body).toHaveLength(8);
    expect(body[0]![1]).toBe(60);
    expect(body.at(-1)![1]).toBe(60);
    const interior = body.slice(1, -1);
    expect(interior.filter(([, y]) => y < 60)).toHaveLength(3);
    expect(interior.filter(([, y]) => y > 60)).toHaveLength(3);
    expect(new Set(interior.map(([, y]) => y)).size).toBe(2);
    const pitch = interior[1]![0] - interior[0]![0];
    for (let index = 1; index < interior.length; index++) {
      expect(interior[index]![0] - interior[index - 1]![0]).toBeCloseTo(pitch, 5);
      expect((interior[index]![1] - 60) * (interior[index - 1]![1] - 60)).toBeLessThan(0);
    }
    const variable = referencePaths('resistorVar');
    expect(pathPoints(variable[0]!)).toEqual(full);
    const [start, end] = pathPoints(variable[1]!);
    const dx = end![0] - start![0], dy = end![1] - start![1];
    const intersections: { segment: number; fraction: number }[] = [];
    for (let index = 1; index < body.length; index++) {
      const [x1, y1] = body[index - 1]!;
      const [x2, y2] = body[index]!;
      const sx = x2 - x1, sy = y2 - y1;
      const determinant = dx * sy - dy * sx;
      if (Math.abs(determinant) < 1e-9) continue;
      const ox = x1 - start![0], oy = y1 - start![1];
      const alongArrow = (ox * sy - oy * sx) / determinant;
      const alongBody = (ox * dy - oy * dx) / determinant;
      if (alongArrow >= 0 && alongArrow <= 1 && alongBody >= 0 && alongBody <= 1) {
        intersections.push({ segment: index - 1, fraction: alongBody });
      }
    }
    expect(intersections).toHaveLength(1);
    expect(intersections[0]!.segment).toBe(3);
    expect(intersections[0]!.fraction).toBeCloseTo(0.451616, 4);
  });

  it('preserves MOSFET gate, source, drain, bulk and polarity presentation', () => {
    for (const key of ['nmos', 'pmos', 'nmosBlk', 'pmosBlk'] as const) {
      const shape: ShapeEntry = shapes[key];
      const svg = readSvg(shape.file);
      const pChannel = key.startsWith('p');
      const bulk = key.endsWith('Blk');
      expect(shape.terminals.G).toEqual([0, 60]);
      expect(shape.terminals.S).toEqual([90, pChannel ? 0 : 120]);
      expect(shape.terminals.D).toEqual([90, pChannel ? 120 : 0]);
      expect(svg.includes('id="gate-bubble"')).toBe(pChannel);
      const arrow = elements(svg, 'path').find((element) => element.attrs.id === 'bulk-arrow');
      expect(Boolean(arrow)).toBe(bulk);
      if (bulk) {
        expect(shape.terminals.B).toEqual([120, 60]);
        const triangle = pathPoints(arrow!.attrs).slice(0, 3);
        const tip = triangle.find((point) => point[1] === shape.terminals.B![1])!;
        const base = triangle.filter((point) => point !== tip);
        expect(base).toHaveLength(2);
        expect(base[0]![0]).toBe(base[1]![0]);
        expect(Math.sign(tip[0] - base[0]![0])).toBe(-1);
      } else {
        expect(shape.terminals.B).toBeUndefined();
      }
    }
  });

  it('distinguishes FET polarity, enclosure, diode and channel variants', () => {
    for (const key of ['jfet', 'jfetN', 'jfetP', 'jfetNCircle', 'jfetPCircle'] as const) {
      expect(shapes[key].terminals).toEqual(shapes.nmosDiode.terminals);
    }
    for (const [n, p] of [['jfetN', 'jfetP'], ['jfetNCircle', 'jfetPCircle'], ['nmosDiode', 'pmosDiode'], ['nmosCircle', 'pmosCircle']] as const) {
      const arrowDirection = (key: ShapeType) => {
        const arrow = referencePaths(key).find((attrs) => attrs.fill === '#000')!;
        const [tip, base] = pathPoints(arrow);
        return Math.sign(tip![0] - base![0]);
      };
      expect(arrowDirection(n)).toBe(-1);
      expect(arrowDirection(p)).toBe(1);
      for (const key of [n, p]) {
        const svg = readSvg(shapes[key].file);
        expect(elements(svg, 'circle')).toHaveLength(key.endsWith('Circle') ? 1 : 0);
        expect(elements(svg, 'polygon')).toHaveLength(key.endsWith('Diode') ? 1 : 0);
        expect(shapes[key].terminals.S![1]).toBe(key.startsWith('pmos') ? 0 : 120);
      }
    }
    expect(pathSubpaths(referencePaths('hemt')[0]!.d!)).toHaveLength(5);
    expect(pathSubpaths(referencePaths('hemtUnsplit')[0]!.d!)).toHaveLength(3);
    for (const key of ['hemt', 'hemtUnsplit'] as const) {
      expect(shapes[key].terminals.S).toEqual([90, 0]);
      expect(referencePaths(key).filter((attrs) => attrs.fill === '#000')).toHaveLength(1);
    }
  });

  it('keeps reference waveform marks clear of source outlines', () => {
    for (const key of ['sourceSin', 'sourceSquare', 'sourceTriangle', 'sourceRamp'] as const) {
      const outline = elements(readSvg(shapes[key].file), 'circle')[0]!.attrs;
      for (const [x, y] of pathPoints(referencePaths(key)[1]!)) {
        expect(Math.hypot(x - Number(outline.cx), y - Number(outline.cy)))
          .toBeLessThanOrEqual(Number(outline.r) - 4);
      }
    }
  });

  it('preserves potentiometer wipers and light-sensitive resistor indicators', () => {
    for (const [key, ordinary] of [['potentiometer', 'resistor'], ['potentiometerIEC', 'resistorIEC']] as const) {
      expect(referencePaths(key)[0]!.d).toBe(referencePaths(ordinary)[0]!.d);
      expect(shapes[key].terminals.W).toEqual([60, 0]);
      const arrow = referencePaths(key).find((attrs) => attrs.fill === '#000')!;
      const [tip, base] = pathPoints(arrow);
      expect(tip![0]).toBe(60);
      expect(tip![1]).toBeGreaterThan(base![1]);
    }
    for (const [key, ordinary] of [['photoresistor', 'resistor'], ['photoresistorIEC', 'resistorIEC']] as const) {
      expect(referencePaths(key)[0]!.d).toBe(referencePaths(ordinary)[0]!.d);
      const arrows = referencePaths(key).filter((attrs) => attrs.fill === '#000');
      expect(arrows).toHaveLength(2);
      for (const arrow of arrows) {
        const [tip, base] = pathPoints(arrow);
        expect(tip![1]).toBeGreaterThan(base![1]);
      }
    }
  });

  it('distinguishes emitting, receiving and bidirectional diode variants', () => {
    for (const key of ['led', 'led2', 'photodiode'] as const) {
      const arrows = referencePaths(key).filter((attrs) => attrs.fill === '#000');
      expect(arrows).toHaveLength(2);
      for (const arrow of arrows) {
        const [tip, first, second] = pathPoints(arrow);
        const base: Point = [(first![0] + second![0]) / 2, (first![1] + second![1]) / 2];
        const towardBody = (tip![0] - base[0]) * (60 - base[0]) + (tip![1] - base[1]) * (60 - base[1]);
        expect(towardBody > 0).toBe(key === 'photodiode');
      }
    }
    for (const key of ['diac', 'triac'] as const) {
      const triangles = elements(readSvg(shapes[key].file), 'polygon');
      expect(triangles).toHaveLength(2);
      expect(points(triangles[0]!.attrs.points!).every(([, y]) => y >= 60)).toBe(true);
      expect(points(triangles[1]!.attrs.points!).every(([, y]) => y <= 60)).toBe(true);
    }
    expect(shapes.triac.terminals.A1).toEqual([120, 60]);
    expect(shapes.triac.terminals.A2).toEqual([0, 60]);
    expect(shapes.triac.terminals.G).toEqual([120, 30]);
  });

  it('retains capacitor polarity and trim marks without changing the defaults', () => {
    for (const [key, ordinary] of [['capacitorPolar', 'capacitor'], ['capacitor2Polar', 'capacitor2']] as const) {
      const paths = referencePaths(key);
      const original = referencePaths(ordinary);
      expect(paths).toHaveLength(original.length);
      for (const [index, path] of paths.entries()) {
        const tokens = path.d!.split(' ');
        const expected = original[index]!.d!.split(' ');
        expect(tokens).toHaveLength(expected.length);
        for (const [position, token] of tokens.entries()) {
          if (Number.isFinite(Number(token))) expect(Number(token)).toBeCloseTo(Number(expected[position]), 5);
          else expect(token).toBe(expected[position]);
        }
      }
      const svg = readSvg(shapes[key].file);
      const mark = elements(svg, 'text').find(({ attrs }) => attrs.id === 'polarity-mark')!;
      expect(mark).toBeDefined();
      expect(Number(mark.attrs.x)).toBeLessThan(60);
      expect(Number(mark.attrs.y)).toBeLessThan(60);
      expect(svg).toMatch(/<tspan\b[^>]*>\+<\/tspan>/u);
      expect(readSvg(shapes[ordinary].file)).not.toContain('polarity-mark');
    }
    const trim = referencePaths('capacitorTrim');
    expect(trim).toHaveLength(3);
    expect(trim[0]!.d).toBe(referencePaths('capacitor')[0]!.d);
    const [shaftStart, shaftEnd] = pathPoints(trim[1]!);
    const [barStart, barEnd] = pathPoints(trim[2]!);
    const dot = (shaftEnd![0] - shaftStart![0]) * (barEnd![0] - barStart![0])
      + (shaftEnd![1] - shaftStart![1]) * (barEnd![1] - barStart![1]);
    expect(Math.abs(dot)).toBeLessThan(0.1);
  });

  it('preserves analog FET source, bulk and centered-gate distinctions', () => {
    for (const key of ['analogNFet', 'analogPFet', 'analogNFetBulk', 'analogPFetBulk', 'analogNFetCenteredGate', 'analogPFetCenteredGate'] as const) {
      const shape: ShapeEntry = shapes[key];
      const arrow = referencePaths(key).find((attrs) => attrs.fill === '#000')!;
      const [tip, base] = pathPoints(arrow);
      const pChannel = key.startsWith('analogPFet');
      const bulk = key.endsWith('Bulk');
      expect(Math.sign(tip![0] - base![0])).toBe(pChannel === bulk ? 1 : -1);
      expect(shapes[key].terminals.S![1]).toBe(pChannel ? 0 : 120);
      expect(shapes[key].terminals.G![1]).toBe(key.endsWith('CenteredGate') ? 60 : pChannel ? 40 : 80);
      if (bulk) expect(shape.terminals.B).toEqual([120, 60]);
    }
    for (const key of ['analogBiasedFet', 'analogBiasedFetCenteredGate'] as const) {
      const circles = elements(readSvg(shapes[key].file), 'circle');
      expect(circles).toHaveLength(1);
      expect(circles[0]!.attrs.fill).toBe('#000');
      expect(shapes[key].terminals.S).toEqual([90, 120]);
      expect(shapes[key].terminals.G![1]).toBe(key.endsWith('CenteredGate') ? 60 : 80);
    }
  });

  it('retains extended-lead FET placement and variant markings', () => {
    for (const key of ['nfet2', 'pfet2', 'jfetN2', 'jfetP2', 'nmos2Diode', 'pmos2Diode', 'nmos2Circle', 'pmos2Circle'] as const) {
      const mos = key.startsWith('nmos2') || key.startsWith('pmos2');
      const pMos = key.startsWith('pmos2');
      const svg = readSvg(shapes[key].file);
      expect(shapes[key].terminals.S).toEqual([pMos ? 0 : 120, mos ? 40 : 90]);
      expect(shapes[key].terminals.D).toEqual([pMos ? 120 : 0, mos ? 40 : 90]);
      expect(shapes[key].terminals.G![1]).toBe(mos ? 120 : 0);
      expect(elements(svg, 'circle')).toHaveLength(key === 'pfet2' || key.endsWith('Circle') ? 1 : 0);
      expect(elements(svg, 'polygon')).toHaveLength(key.endsWith('Diode') ? 1 : 0);
      const arrows = referencePaths(key).filter((attrs) => attrs.fill === '#000');
      expect(arrows).toHaveLength(key === 'nfet2' || key === 'pfet2' ? 0 : 1);
      if (arrows.length) {
        const [tip, base] = pathPoints(arrows[0]!);
        expect(Math.sign(tip![1] - base![1])).toBe(key === 'jfetN2' || pMos ? -1 : 1);
      }
    }
  });

  it('preserves the parameterized analog FET marker and terminal contracts', () => {
    const bulk = shapes.analogBiasedFetBulk;
    expect(bulk.file).toBe('analog-biased-fet-bulk.svg');
    expect(bulk.terminals).toEqual({ G: [0, 80], D: [90, 0], S: [90, 120], B: [120, 60] });
    const bulkSvg = readSvg(bulk.file);
    const dots = elements(bulkSvg, 'circle');
    expect(dots).toHaveLength(1);
    expect(dots[0]!.attrs.id).toBe('bulk-dot');
    expect(dots[0]!.attrs.fill).toBe('#000');
    expect(['cx', 'cy', 'r'].map((name) => Number(dots[0]!.attrs[name]))).toEqual([73.2, 60.8, 3.6]);
    const contact = referencePaths('analogBiasedFetBulk').find((attrs) => attrs.id === 'bulk-contact')!;
    expect(pathPoints(contact)).toEqual([[90, 60.8], [66, 60.8]]);
    const sourceDot = elements(readSvg(shapes.analogBiasedFet.file), 'circle')[0]!.attrs;
    expect(Number(sourceDot.cy)).toBe(84.8);
    expect(Number(dots[0]!.attrs.cy)).not.toBe(Number(sourceDot.cy));
    for (const [key, original, file] of [
      ['analogPFetNoArrow', 'analogPFet', 'analog-pfet-no-arrow.svg'],
      ['analogBiasedFetNoArrow', 'analogBiasedFet', 'analog-biased-fet-no-arrow.svg'],
    ] as const) {
      expect(shapes[key].file).toBe(file);
      expect(shapes[key].terminals).toEqual(original === 'analogPFet'
        ? { G: [0, 40], S: [90, 0], D: [90, 120] }
        : { G: [0, 80], D: [90, 0], S: [90, 120] });
      const svg = readSvg(shapes[key].file);
      expect(elements(svg, 'circle|polygon')).toHaveLength(0);
      expect(referencePaths(key).filter((attrs) => attrs.fill === '#000')).toHaveLength(0);
      const retained = referencePaths(original).filter((attrs) => original !== 'analogPFet'
        || !['reference-1', 'reference-2'].includes(attrs.id!));
      expect(referencePaths(key).map((attrs) => attrs.d)).toEqual(retained.map((attrs) => attrs.d));
    }
    const unchangedBody = referencePaths('analogBiasedFet');
    for (const path of unchangedBody) {
      expect(referencePaths('analogBiasedFetBulk').find((attrs) => attrs.id === path.id)?.d).toBe(path.d);
    }
  });

  it('preserves pulse and solar source indicators', () => {
    for (const key of ['sourcePulse', 'solar'] as const) {
      const outline = elements(readSvg(shapes[key].file), 'circle')[0]!.attrs;
      expect([Number(outline.cx), Number(outline.cy), Number(outline.r)]).toEqual([60, 60, 24]);
      expect(shapes[key].terminals).toEqual(key === 'solar'
        ? { P: [120, 60], N: [0, 60] }
        : { P: [0, 60], N: [120, 60] });
    }
    expect(pathPoints(referencePaths('sourcePulse')[1]!)).toHaveLength(6);
    const [shortPlate, longPlate] = referencePaths('solar').slice(1, 3).map(pathPoints);
    expect(longPlate![0]![0]).toBeGreaterThan(shortPlate![0]![0]);
    expect(Math.abs(longPlate![1]![1] - longPlate![0]![1]))
      .toBeGreaterThan(Math.abs(shortPlate![1]![1] - shortPlate![0]![1]));
    const arrows = referencePaths('solar').filter((attrs) => attrs.fill === '#000');
    expect(arrows).toHaveLength(2);
    for (const arrow of arrows) {
      const [tip, base] = pathPoints(arrow);
      expect(tip![0]).toBeLessThan(base![0]);
      expect(tip![1]).toBeGreaterThan(base![1]);
    }
  });

  it('preserves reference capacitor and battery plate spacing', () => {
    const verticals = (key: ShapeType) => referencePaths(key).flatMap((attrs) => pathSubpaths(attrs.d!))
      .filter((points) => points.length === 2 && points[0]![0] === points[1]![0] && points[0]![1] !== points[1]![1]);
    const capacitor = verticals('capacitor');
    expect(capacitor).toHaveLength(2);
    const height = Math.abs(capacitor[0]![1]![1] - capacitor[0]![0]![1]);
    expect((capacitor[1]![0]![0] - capacitor[0]![0]![0]) / height).toBeCloseTo(0.36, 4);
    for (const key of ['batteryCell', 'battery'] as const) {
      const bars = verticals(key);
      expect(bars).toHaveLength(key === 'batteryCell' ? 2 : 4);
      const pitch = bars[1]![0]![0] - bars[0]![0]![0];
      for (let index = 0; index < bars.length; index++) {
        const [start, end] = bars[index]!;
        expect((start![1] + end![1]) / 2).toBe(60);
        if (index > 0) expect(start![0] - bars[index - 1]![0]![0]).toBeCloseTo(pitch, 5);
        if (index % 2 === 1) {
          const [positiveStart, positiveEnd] = bars[index - 1]!;
          expect(Math.abs(end![1] - start![1])).toBe(Math.abs(positiveEnd![1] - positiveStart![1]) / 2);
        }
      }
    }
  });
});
