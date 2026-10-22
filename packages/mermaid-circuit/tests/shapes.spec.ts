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
const snap = (span: number) => span === 240
  ? [0, 30, 40, 60, 80, 90, 120, 150, 160, 180, 200, 210, 240]
  : [0, 30, 40, 60, 80, 90, 120];

const variants = {
  fets: 'jfet jfetN jfetP jfetNCircle jfetPCircle hemt hemtUnsplit hemtNoArrow nmosDiode pmosDiode nmosCircle pmosCircle analogNFet analogPFet analogBiasedFet analogNFetBulk analogPFetBulk analogBiasedFetBulk analogPFetNoArrow analogBiasedFetNoArrow analogNFetCenteredGate analogPFetCenteredGate analogBiasedFetCenteredGate nfet2 pfet2 jfetN2 jfetP2 nmos2Diode pmos2Diode nmos2Circle pmos2Circle'.split(' '),
  resistors: 'resistorIEC resistorVar resistorVarIEC potentiometer potentiometerIEC photoresistor photoresistorIEC rshunt fuse fuseUs fuseIEC thermistor'.split(' '),
  diodes: 'diodeFilled schottky diodeTunnel diodeShockley zener diodeTVS varactor led led2 photodiode diac triac scr'.split(' '),
  capacitors: 'capacitorPolar capacitor2 capacitor2Polar capacitorVar capacitorTrim'.split(' '),
  sources: 'source sourceSin sourcePulse sourceSquare sourceTriangle sourceRamp sourceControlled sourceControlledI sourceControlledV batteryCell battery batteryDouble solar'.split(' '),
  grounds: 'groundSignal groundChassis vss'.split(' '),
};

describe('shape catalog', () => {
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
    const approved = new Set([...existing, ...Object.values(variants).flat()]);
    for (const key of Object.keys(shapes)) expect(approved.has(key), key).toBe(true);
    expect(existing).not.toContain('source');
    for (const [, key, , terminals] of definitions) {
      if (key === 'net') continue;
      const shape: ShapeEntry = shapes[key as ShapeType];
      expect(Object.keys(shape.terminals).sort()).toEqual(terminals === 'None' ? [] : terminals!.split(', ').sort());
    }
  });

  it.each(Object.entries(shapes))('%s has grid-aligned attachments and geometry inside its pane', (_key, entry) => {
    const shape: ShapeEntry = entry;
    const svg = readSvg(shape.file);
    const root = elements(svg, 'svg')[0]!.attrs;
    expect(root.xmlns).toBe('http://www.w3.org/2000/svg');
    expect([Number(root.width), Number(root.height)]).toEqual([shape.width, shape.height]);
    expect(root.viewBox!.split(/\s+/u).map(Number)).toEqual([0, 0, shape.width, shape.height]);
    expect(shape.height).toBe(120);
    expect(shape.width).toBe(shape.file.startsWith('pin-') ? 240 : 120);
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
        expect(attrs.d).toMatch(/^[MQC\d.,\s-]+$/u);
        const coordinates = attrs.d!.match(/-?\d+(?:\.\d+)?/gu)!.map(Number);
        expect(coordinates.length % 2).toBe(0);
        vertices = [];
        for (let index = 0; index < coordinates.length; index += 2) {
          vertices.push([coordinates[index]!, coordinates[index + 1]!]);
        }
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

  it('distinguishes controlled sources without making them notation types', () => {
    for (const key of ['sourceControlled', 'sourceControlledI', 'sourceControlledV'] as const) {
      const svg = readSvg(shapes[key].file);
      expect(elements(svg, 'polygon').find(({ attrs }) => attrs.id === 'body')).toBeDefined();
      expect(svg.includes('id="arrow"')).toBe(key === 'sourceControlledI');
      expect(svg.includes('id="plus-h"')).toBe(key === 'sourceControlledV');
      expect(svg.includes('id="minus"')).toBe(key === 'sourceControlledV');
      expect(notation).not.toContain(`:::${key}`);
    }
    expect(elements(readSvg(shapes.source.file), 'circle')).toHaveLength(1);
  });

  it('keeps expanded resistor and source templates horizontal', () => {
    const keys = ['resistorIEC', 'resistorVar', 'resistorVarIEC', 'fuse', 'fuseUs', 'fuseIEC',
      'thermistor', 'source', 'sourceSin', 'sourceSquare', 'sourceTriangle', 'sourceRamp',
      'sourceControlled', 'sourceControlledI', 'sourceControlledV', 'batteryCell', 'battery'] as const;
    for (const key of keys) {
      const terminals = Object.values(shapes[key].terminals);
      expect(terminals, key).toEqual([[0, 60], [120, 60]]);
    }
    const minus = elements(readSvg(shapes.sourceControlledV.file), 'line')
      .find(({ attrs }) => attrs.id === 'minus')!.attrs;
    expect(minus.y1).toBe(minus.y2);
    expect(minus.x1).not.toBe(minus.x2);
    for (const key of ['resistorVar', 'resistorVarIEC'] as const) {
      const arrow = elements(readSvg(shapes[key].file), 'polygon')
        .find(({ attrs }) => attrs.id === 'adjustment-head');
      expect(arrow?.attrs.fill).toBe('#000');
    }
  });

  it('uses a horizontal zigzag resistor with straight leads', () => {
    const svg = readSvg(shapes.resistor.file);
    expect(shapes.resistor.terminals).toEqual({ A: [0, 60], B: [120, 60] });
    expect(svg).not.toMatch(/<rect\b/u);
    const body = points(elements(svg, 'polyline').find((element) => element.attrs.id === 'body')!.attrs.points!);
    expect(body).toHaveLength(8);
    expect(body[0]![1]).toBe(60);
    expect(body.at(-1)![1]).toBe(60);
    const interior = body.slice(1, -1);
    expect(interior.filter(([, y]) => y < 60)).toHaveLength(3);
    expect(interior.filter(([, y]) => y > 60)).toHaveLength(3);
    expect(new Set(interior.filter(([, y]) => y < 60).map(([, y]) => y)).size).toBe(1);
    expect(new Set(interior.filter(([, y]) => y > 60).map(([, y]) => y)).size).toBe(1);
    const pitch = interior[1]![0] - interior[0]![0];
    for (let index = 1; index < interior.length; index++) {
      expect(interior[index]![0] - interior[index - 1]![0]).toBeCloseTo(pitch, 5);
    }
    for (let index = 1; index < interior.length; index++) {
      expect((interior[index]![1] - 60) * (interior[index - 1]![1] - 60)).toBeLessThan(0);
    }
    for (let index = 1; index < body.length; index++) expect(body[index]![0]).toBeGreaterThan(body[index - 1]![0]);
    const leads = elements(svg, 'line').map(({ attrs }) => attrs);
    expect(leads.some((lead) => Number(lead.x1) === 0 && Number(lead.y1) === 60 && Number(lead.x2) === body[0]![0] && Number(lead.y2) === body[0]![1])).toBe(true);
    expect(leads.some((lead) => Number(lead.x1) === body.at(-1)![0] && Number(lead.y1) === body.at(-1)![1] && Number(lead.x2) === 120 && Number(lead.y2) === 60)).toBe(true);
    const variable = readSvg(shapes.resistorVar.file);
    const variableBody = points(elements(variable, 'polyline').find(({ attrs }) => attrs.id === 'body')!.attrs.points!);
    expect(variableBody).toEqual(body);
    const arrow = elements(variable, 'line').find(({ attrs }) => attrs.id === 'adjustment')!.attrs;
    const dx = Number(arrow.x2) - Number(arrow.x1);
    const dy = Number(arrow.y2) - Number(arrow.y1);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
    const intersections: { segment: number; fraction: number }[] = [];
    for (let index = 1; index < variableBody.length; index++) {
      const [x1, y1] = variableBody[index - 1]!;
      const [x2, y2] = variableBody[index]!;
      const sx = x2 - x1;
      const sy = y2 - y1;
      const determinant = dx * sy - dy * sx;
      if (Math.abs(determinant) < 1e-9) continue;
      const ox = x1 - Number(arrow.x1);
      const oy = y1 - Number(arrow.y1);
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
      const arrow = elements(svg, 'polygon').find((element) => element.attrs.id === 'bulk-arrow');
      expect(Boolean(arrow)).toBe(bulk);
      if (bulk) {
        expect(shape.terminals.B).toEqual([120, 60]);
        const triangle = points(arrow!.attrs.points!);
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

  it('keeps waveform marks clear of source outlines', () => {
    for (const key of ['sourceSin', 'sourceSquare', 'sourceTriangle', 'sourceRamp'] as const) {
      const svg = readSvg(shapes[key].file);
      const outline = elements(svg, 'circle')[0]!.attrs;
      const mark = elements(svg, 'polyline|path').find(({ attrs }) => attrs.id === 'waveform')!.attrs;
      const values = (mark.points ?? mark.d)!.match(/-?\d+(?:\.\d+)?/gu)!.map(Number);
      for (let index = 0; index < values.length; index += 2) {
        expect(Math.hypot(values[index]! - Number(outline.cx), values[index + 1]! - Number(outline.cy)))
          .toBeLessThanOrEqual(Number(outline.r) - 4);
      }
    }
  });

  it('uses closely spaced capacitor and battery plates with conventional proportions', () => {
    const plates = elements(readSvg(shapes.capacitor.file), 'line')
      .filter(({ attrs }) => attrs.id!.startsWith('plate-')).map(({ attrs }) => attrs);
    const height = Number(plates[0]!.y2) - Number(plates[0]!.y1);
    const gap = Number(plates[1]!.x1) - Number(plates[0]!.x1);
    expect(gap / height).toBeGreaterThan(0.25);
    expect(gap / height).toBeLessThan(0.45);
    for (const key of ['batteryCell', 'battery'] as const) {
      const bars = elements(readSvg(shapes[key].file), 'line')
        .filter(({ attrs }) => attrs.id!.includes('plate')).map(({ attrs }) => attrs);
      expect(bars).toHaveLength(key === 'batteryCell' ? 2 : 4);
      const pitch = Number(bars[1]!.x1) - Number(bars[0]!.x1);
      for (let index = 0; index < bars.length; index++) {
        const bar = bars[index]!;
        expect(bar.x1).toBe(bar.x2);
        expect((Number(bar.y1) + Number(bar.y2)) / 2).toBe(60);
        if (index > 0) expect(Number(bar.x1) - Number(bars[index - 1]!.x1)).toBe(pitch);
        if (index % 2 === 1) {
          const positive = bars[index - 1]!;
          expect(Number(bar.y2) - Number(bar.y1)).toBe((Number(positive.y2) - Number(positive.y1)) / 2);
        }
      }
    }
  });
});
