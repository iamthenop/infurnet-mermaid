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

  it.each(Object.entries(shapes))('%s has matching pane, attachments, and snap geometry', (_key, entry) => {
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

    const exempt = new Set(
      ['vsource.svg', 'source-controlled-v.svg'].includes(shape.file) ? ['plus-h', 'plus-v', 'minus']
        : shape.file === 'ground.svg' ? ['bar-3']
          : ['isource.svg', 'source-controlled-i.svg'].includes(shape.file) ? ['arrow', 'arrow-head']
            : ['resistor.svg', 'resistor-var.svg'].includes(shape.file) ? ['body'] : ['bulk-arrow'],
    );
    for (const { name, attrs } of elements(svg, 'line|polyline|polygon|circle')) {
      if (exempt.has(attrs.id!)) continue;
      if (name === 'circle') {
        for (const [center, span] of [[Number(attrs.cx), shape.width], [Number(attrs.cy), shape.height]]) {
          expect([center!, center! - Number(attrs.r), center! + Number(attrs.r)].some((value) => snap(span!).includes(value))).toBe(true);
        }
      } else {
        const vertices: Point[] = name === 'line'
          ? [[Number(attrs.x1), Number(attrs.y1)], [Number(attrs.x2), Number(attrs.y2)]]
          : points(attrs.points!);
        for (const [x, y] of vertices) {
          expect(snap(shape.width)).toContain(x);
          expect(snap(shape.height)).toContain(y);
        }
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

  it('uses a vertical zigzag resistor with straight leads', () => {
    const svg = readSvg(shapes.resistor.file);
    expect(shapes.resistor.terminals).toEqual({ A: [60, 0], B: [60, 120] });
    expect(svg).not.toMatch(/<rect\b/u);
    const body = points(elements(svg, 'polyline').find((element) => element.attrs.id === 'body')!.attrs.points!);
    expect(body).toHaveLength(8);
    expect(body[0]![0]).toBe(60);
    expect(body.at(-1)![0]).toBe(60);
    const interior = body.slice(1, -1);
    expect(interior.filter(([x]) => x < 60)).toHaveLength(3);
    expect(interior.filter(([x]) => x > 60)).toHaveLength(3);
    expect(new Set(interior.filter(([x]) => x < 60).map(([x]) => x)).size).toBe(1);
    expect(new Set(interior.filter(([x]) => x > 60).map(([x]) => x)).size).toBe(1);
    const pitch = interior[1]![1] - interior[0]![1];
    for (let index = 1; index < interior.length; index++) {
      expect(interior[index]![1] - interior[index - 1]![1]).toBe(pitch);
    }
    for (let index = 1; index < interior.length; index++) {
      expect((interior[index]![0] - 60) * (interior[index - 1]![0] - 60)).toBeLessThan(0);
    }
    for (let index = 1; index < body.length; index++) expect(body[index]![1]).toBeGreaterThan(body[index - 1]![1]);
    const leads = elements(svg, 'line').map(({ attrs }) => attrs);
    expect(leads.some((lead) => Number(lead.x1) === 60 && Number(lead.y1) === 0 && Number(lead.x2) === body[0]![0] && Number(lead.y2) === body[0]![1])).toBe(true);
    expect(leads.some((lead) => Number(lead.x1) === body.at(-1)![0] && Number(lead.y1) === body.at(-1)![1] && Number(lead.x2) === 60 && Number(lead.y2) === 120)).toBe(true);
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
});
