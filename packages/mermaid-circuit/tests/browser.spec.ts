/// <reference types="vite/client" />
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { floorplan } from '../src/drawing/layout.js';
import catalog from '../shapes/shapes.json' with { type: 'json' };

const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });

let server: ViteDevServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  server = await createServer({
    root: new URL('../examples/browser/', import.meta.url).pathname,
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  browser = await chromium.launch();
}, 60_000);

it.each(Object.entries(fixtures))('renders all assignments and exact artwork transforms for %s', async (path, source) => {
  const page = await browser!.newPage();
  const model = parseCircuit(source), layout = floorplan(model);
  const expected = layout.devices.map((item) => ({ id: item.device.id, type: item.device.type,
    terminals: item.device.type === 'ic' ? Object.fromEntries(Object.entries(item.device.pinSides!).map(([name, side]) =>
      [name, ({ T: [90, 0], B: [90, 180], L: [0, 90], R: [180, 90] } as const)[side]])) : catalog[item.device.type].terminals,
    anchors: item.placed.anchors }));
  try {
    await page.goto(server!.resolvedUrls!.local[0]!);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => typeof (window as unknown as { renderFixture?: unknown }).renderFixture === 'function');
    const result = await page.evaluate(async ({ source, expected }) => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const first = await renderFixture('verified-fixture', source);
      const second = await renderFixture('verified-fixture', source);
      const host = document.createElement('div'); host.innerHTML = second.svg; document.body.append(host);
      const root = host.querySelector('svg')!;
      const ids = [...root.querySelectorAll('[id]')].map((element) => element.id);
      const errors: string[] = [];
      const close = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4;
      const wires = [...root.querySelectorAll<SVGGElement>('[data-wire]')].map((group) => {
        const line = group.querySelector('polyline')!;
        const matrix = root.getScreenCTM()!.inverse().multiply(line.getScreenCTM()!);
        const points = Array.from({ length: line.points.numberOfItems }, (_, index) => {
          const point = line.points.getItem(index).matrixTransform(matrix); return [point.x, point.y];
        });
        const declared = JSON.parse(group.getAttribute('data-points')!) as number[][];
        if (!points.every((point, index) => close(point, declared[index]))) errors.push('wire transform');
        return { net: group.getAttribute('data-net'), points };
      });
      for (const device of expected) {
        const group = [...root.querySelectorAll<SVGGElement>('[data-device]')].find((group) => group.getAttribute('data-device') === device.id)!;
        if (!group) { errors.push(`missing ${device.id}`); continue; }
        const artwork = group.querySelector<SVGGraphicsElement>('[transform]')!;
        const matrix = root.getScreenCTM()!.inverse().multiply(artwork.getScreenCTM()!);
        for (const [terminal, local] of Object.entries(device.terminals)) {
          const actual = new DOMPoint(local[0], local[1]).matrixTransform(matrix);
          if (!close([actual.x, actual.y], device.anchors[terminal])) errors.push(`artwork ${device.id}.${terminal}`);
          const marker = [...root.querySelectorAll('[data-terminal]')].find((element) =>
            element.getAttribute('data-terminal-device') === device.id && element.getAttribute('data-terminal') === terminal)!;
          const label = marker.querySelector('text')!;
          if (!close([Number(label.getAttribute('x')) - 8, Number(label.getAttribute('y')) + 9], [actual.x, actual.y])) errors.push('label transform');
          const net = marker.getAttribute('data-terminal-net');
          if (net && !wires.some((wire) => wire.net === net && [wire.points[0], wire.points.at(-1)!]
            .some((point) => close(point, [actual.x, actual.y])))) errors.push(`unwired ${device.id}.${terminal}`);
        }
        const box = group.getBBox();
        for (const wire of wires) for (let index = 1; index < wire.points.length; index++) {
          const [a, b] = [wire.points[index - 1], wire.points[index]];
          const hit = Math.abs(a[1] - b[1]) < 1e-4
            ? a[1] > box.y + 1e-4 && a[1] < box.y + box.height - 1e-4
              && Math.max(a[0], b[0]) > box.x + 1e-4 && Math.min(a[0], b[0]) < box.x + box.width - 1e-4
            : a[0] > box.x + 1e-4 && a[0] < box.x + box.width - 1e-4
              && Math.max(a[1], b[1]) > box.y + 1e-4 && Math.min(a[1], b[1]) < box.y + box.height - 1e-4;
          if (hit) errors.push(`body traversal ${device.id}`);
        }
      }
      for (const group of root.querySelectorAll<SVGGElement>('[data-proxy]')) {
        if (!['supplyNet', 'ground'].includes(group.getAttribute('data-type')!)) continue;
        const artwork = group.querySelector<SVGGraphicsElement>('[transform]')!;
        const matrix = root.getScreenCTM()!.inverse().multiply(artwork.getScreenCTM()!);
        if (Math.abs(matrix.a - 1) + Math.abs(matrix.d - 1) + Math.abs(matrix.b) + Math.abs(matrix.c) > 1e-5) errors.push('rotated power symbol');
      }
      return { errors, deterministic: first.svg === second.svg, uniqueIds: new Set(ids).size === ids.length,
        devices: root.querySelectorAll('[data-device]').length,
        assignments: root.querySelectorAll('[data-terminal-net]').length,
        stages: root.querySelectorAll('[data-stage]').length, blocks: root.querySelectorAll('[data-block]').length,
        report: second.report, viewBox: root.getAttribute('viewBox')!.split(/\s+/u).map(Number) };
    }, { source, expected });
    expect(result.errors, path).toEqual([]);
    expect(result.deterministic).toBe(true);
    expect(result.uniqueIds).toBe(true);
    expect(result.devices).toBe(model.devices.length);
    expect(result.assignments).toBe(model.connections.length);
    expect(result.stages).toBe(model.stages.filter((stage) => !stage.implicit).length);
    expect(result.blocks).toBe(model.blocks.length);
    expect(result.viewBox.every(Number.isFinite)).toBe(true);
    expect(result.viewBox[2]).toBeGreaterThan(0);
    expect(result.viewBox[3]).toBeGreaterThan(0);
    expect(result.report!.devices).toBe(model.devices.length);
  } finally { await page.close(); }
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it('registers the compiled package and renders successive populated diagrams in Chromium', async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(server!.resolvedUrls!.local[0]!);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
    expect(await page.locator('#output > svg').count()).toBe(1);
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => typeof (window as unknown as { renderFixture?: unknown }).renderFixture === 'function');
    const result = await page.evaluate(async () => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const first = await renderFixture('first-render', 'circuitDiagram D\nA(["A"]):::pinIn\nU["U"]:::inverter\nA ---|I| U');
      let rejection = '';
      try {
        await renderFixture('invalid-render', 'circuitDiagram D\nR1 resistor');
      } catch (error) {
        rejection = String(error);
      }
      const second = await renderFixture('second-render', 'circuitDiagram A\n%% comment\nR["R"]:::resistor\nR2["R2"]:::resistor\nR |B| --- |A| R2');
      const inferred = await renderFixture('inferred-render', 'circuitDiagram A\nP["P"]:::pmos\nN["N"]:::nmos\nPower --- P |S|\nInput --- P |G|\nP |D| --- Output\nOutput --- N |D|\nInput --- N |G|\nN |S| --- Return');
      const inspect = (svg: string) => {
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        return {
          name: doc.documentElement.localName,
          namespace: doc.documentElement.namespaceURI,
          error: doc.querySelector('parsererror') !== null,
          id: doc.documentElement.id,
          type: doc.documentElement.getAttribute('aria-roledescription'),
          marks: doc.querySelectorAll('path, rect, circle, line, polyline, polygon, text').length,
        };
      };
      return { first: inspect(first.svg), second: inspect(second.svg), inferred: inspect(inferred.svg), secondSvg: second.svg, rejection };
    });
    for (const svg of [result.first, result.second, result.inferred]) {
      expect(svg).toMatchObject({ name: 'svg', namespace: 'http://www.w3.org/2000/svg', error: false, type: 'circuitDiagram' });
    }
    for (const svg of [result.first, result.second, result.inferred]) expect(svg.marks).toBeGreaterThan(0);
    expect(result.first.id).toBe('first-render');
    expect(result.second.id).toBe('second-render');
    expect(result.inferred.id).toBe('inferred-render');
    expect(result.rejection).toContain('Unsupported circuit statement');
    expect(result.secondSvg).not.toMatch(/first-render|invalid-render|R1 resistor/u);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
