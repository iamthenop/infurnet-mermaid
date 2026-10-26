/// <reference types="vite/client" />
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { floorplan } from '../src/drawing/layout.js';
import { routeLayout } from '../src/drawing/routing.js';
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
  const planned = routeLayout(layout);
  const expected = layout.devices.map((item) => ({ id: item.device.id, type: item.device.type,
    terminals: item.device.type === 'ic' ? Object.fromEntries(Object.entries(item.device.pinSides!).map(([name]) =>
      [name, ({ 'v+': [90, 0], 'v-': [90, 240], ctl: [0, 90], A: [0, 150], no: [180, 120] } as Record<string, readonly number[]>)[name]])) : catalog[item.device.type].terminals,
    sides: Object.fromEntries(layout.attachments.filter((attachment) => attachment.device === item.device.id).map((attachment) => [attachment.terminal, attachment.side])),
    anchors: item.placed.anchors, nets: Object.fromEntries(model.connections.filter((connection) => connection.device === item.device.id)
      .map((connection) => [connection.terminal, connection.net])) }));
  try {
    await page.goto(server!.resolvedUrls!.local[0]!);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => typeof (window as unknown as { renderFixture?: unknown }).renderFixture === 'function');
    const result = await page.evaluate(async ({ source, expected, expectedRoutes, expectedOccurrences, expectedJunctions }) => {
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
      if (wires.length !== expectedRoutes.length) errors.push('omitted or extra wire');
      wires.forEach((wire, index) => {
        const planned = expectedRoutes[index];
        if (!planned || wire.net !== planned.net || wire.points.length !== planned.points.length
          || !wire.points.every((point, index) => close(point, planned.points[index]))) errors.push('rendered graph differs from validated graph');
      });
      const occurrences = [...root.querySelectorAll('[data-net-occurrence]')];
      if (occurrences.length !== expectedOccurrences.length) errors.push('omitted or extra net occurrence');
      occurrences.forEach((element, index) => {
        const expected = expectedOccurrences[index];
        if (!expected || element.getAttribute('data-net') !== expected.net || element.hasAttribute('data-proxy') !== expected.isProxy) {
          errors.push('rendered occurrence violates proxy policy');
        }
      });
      for (const joint of expectedJunctions) {
        if (!joint.kind) continue;
        const frame = [...root.querySelectorAll<SVGGElement>(`[data-${joint.kind}]`)]
          .find((element) => element.getAttribute(`data-${joint.kind}`) === joint.name)!;
        if (!frame) { errors.push('missing junction scope'); continue; }
        const box = frame.getBBox();
        if (joint.point[0] <= box.x || joint.point[0] >= box.x + box.width
          || joint.point[1] <= box.y || joint.point[1] >= box.y + box.height) errors.push('junction outside nearest shared scope');
      }
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
          const side = device.sides[terminal];
          const vertical = device.type === 'ic' && ['T', 'B'].includes(side);
          const offset = vertical ? [4, 0] : ({ L: [-4, -4], R: [4, -4], T: [4, -4], B: [4, 4] } as Record<string, number[]>)[side];
          const anchor = side === 'L' || vertical && side === 'B' ? 'end' : 'start';
          const baseline = vertical || side === 'B' ? 'hanging' : 'text-after-edge';
          if (marker.getAttribute('text-anchor') !== anchor || marker.getAttribute('dominant-baseline') !== baseline) errors.push('label alignment');
          const labelMatrix = root.getScreenCTM()!.inverse().multiply(label.getScreenCTM()!);
          const labelPoint = new DOMPoint(Number(label.getAttribute('x')), Number(label.getAttribute('y'))).matrixTransform(labelMatrix);
          if (!close([labelPoint.x, labelPoint.y], [actual.x + offset[0], actual.y + offset[1]])) errors.push('label position');
          if (Math.abs(labelMatrix.a - (vertical ? 0 : 1)) > 1e-5 || Math.abs(labelMatrix.b - (vertical ? -1 : 0)) > 1e-5) errors.push('label rotation');
          const net = marker.getAttribute('data-terminal-net');
          if (net !== (device.nets[terminal] ?? null)) errors.push(`changed net ${device.id}.${terminal}`);
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
      for (const group of root.querySelectorAll<SVGGElement>('[data-net-occurrence]')) {
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
    }, { source, expected, expectedRoutes: planned.routes,
      expectedJunctions: planned.junctionScopes.map((joint) => {
        const stage = joint.stages.length === 1 ? model.stages[joint.stages[0]] : undefined;
        const block = model.stages[joint.stages[0]]?.block;
        const commonBlock = block !== null && block !== undefined && joint.stages.every((index) => model.stages[index].block === block);
        return { point: joint.point, kind: stage && !stage.implicit ? 'stage' : commonBlock ? 'block' : null,
          name: stage && !stage.implicit ? stage.name : commonBlock ? model.blocks[block!].name : null };
      }),
      expectedOccurrences: planned.occurrences.map((item) => ({ net: item.net.id, isProxy: item.isProxy })) });
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
