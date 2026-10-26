/// <reference types="vite/client" />
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { floorplan } from '../src/drawing/layout.js';
import { routeLayout } from '../src/drawing/routing.js';
import catalog from '../shapes/shapes.json' with { type: 'json' };
import type { MermaidConfig } from 'mermaid';
import { Drawing, Element as DrawingElement } from '../src/drawing/core.js';
import type { SymbolId } from '../src/drawing/symbols.js';

const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
const referenceSvgs = import.meta.glob<string>('../examples/fixtures/*.svg', { eager: true, query: '?raw', import: 'default' });
const appearances: { name: string; config: MermaidConfig; colors: { background: string; wire: string; device: string; label: string; text: string; frame: string } }[] = [
  { name: 'default', config: { theme: 'default' }, colors: { background: '#FFFFFF', wire: '#000000', device: '#000000', label: '#000000', text: '#000000', frame: '#000000' } },
  { name: 'default-inverse', config: { theme: 'dark' }, colors: { background: '#101215', wire: '#F2F2F2', device: '#F2F2F2', label: '#F2F2F2', text: '#F2F2F2', frame: '#F2F2F2' } },
  { name: 'colored', config: { theme: 'base', themeVariables: { background: '#FFFFFF', lineColor: '#009600', primaryBorderColor: '#840000', primaryTextColor: '#006464', textColor: '#0F0F0F' } },
    colors: { background: '#FFFFFF', wire: '#009600', device: '#840000', label: '#006464', text: '#0F0F0F', frame: '#777777' } },
];

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

it.each(Object.entries(fixtures).flatMap(([path, source]) => appearances.map((appearance) => ({ path, source, ...appearance }))))
('renders exact geometry and standalone colours for $path in $name', async ({ path, source, config, colors }) => {
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
    const result = await page.evaluate(async ({ source, config, colors, expected, expectedRoutes, expectedOccurrences, expectedJunctions }) => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const first = await renderFixture('verified-fixture', source, config);
      const second = await renderFixture('verified-fixture', source);
      const standalone = document.createElement('iframe'); document.body.append(standalone);
      standalone.contentDocument!.body.innerHTML = second.svg;
      const root = standalone.contentDocument!.querySelector('svg')!;
      const ids = [...root.querySelectorAll('[id]')].map((element) => element.id);
      const errors: string[] = [];
      const rgb = (hex: string) => `rgb(${[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
      const paletteChecks: [string, 'stroke' | 'fill', string][] = [
        ['[data-circuit-background]', 'fill', colors.background],
        ['[data-wire] polyline', 'stroke', colors.wire],
        ['[data-junction] circle', 'fill', colors.wire],
        ['[data-junction] circle', 'stroke', colors.wire],
        ['[data-device] [stroke]:not([stroke="none"]), [data-net-occurrence] [stroke]:not([stroke="none"])', 'stroke', colors.device],
        ['[data-device] [fill="#000"], [data-net-occurrence] [fill="#000"]', 'fill', colors.device],
        ['[data-device] [fill="#fff"], [data-device] [fill="white"], [data-net-occurrence] [fill="#fff"], [data-net-occurrence] [fill="white"]', 'fill', colors.background],
        ['[data-device] [fill="none"], [data-net-occurrence] [fill="none"]', 'fill', 'none'],
        ['[data-device-label] text, [data-ic-label] text, [data-terminal] text', 'fill', colors.label],
        ['[data-net-label] text, [data-frame-label] text', 'fill', colors.text],
        ['[data-stage] polyline, [data-block] polyline', 'stroke', colors.frame],
      ];
      for (const [selector, property, color] of paletteChecks) for (const element of root.querySelectorAll(selector)) {
        const actual = standalone.contentWindow!.getComputedStyle(element)[property];
        if (actual !== (color === 'none' ? color : rgb(color))) errors.push(`${selector} ${property}: ${actual}`);
      }
      for (const label of root.querySelectorAll('[data-label] text')) {
        const style = standalone.contentWindow!.getComputedStyle(label);
        if (style.fontFamily !== 'sans-serif' || style.fontSize !== '14px' || style.fontWeight !== '400') errors.push('changed typography');
      }
      if (!root.querySelector('[data-circuit-background]') || !root.querySelector('style')) errors.push('missing standalone appearance');
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
    }, { source, config, colors, expected, expectedRoutes: planned.routes,
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

it.each(Object.entries(fixtures))('preserves %s geometry across theme switches and frontmatter overrides', async (path, source) => {
  const page = await browser!.newPage();
  try {
    await page.goto(server!.resolvedUrls!.local[0]!);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => typeof (window as unknown as { renderFixture?: unknown }).renderFixture === 'function');
    const result = await page.evaluate(async ({ source, reference, configs }) => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const geometry = (svg: string) => {
        const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
        const originalId = root.id;
        const visit = (element: Element): unknown => {
          if (element.localName === 'style' || element.hasAttribute('data-circuit-background')) return undefined;
          return { tag: element.localName, attributes: [...element.attributes]
            .filter((attribute) => !['stroke', 'fill', 'style'].includes(attribute.name))
            .map((attribute) => [attribute.name, attribute.name === 'id' ? attribute.value.replace(originalId, 'circuit') : attribute.value])
            .sort(([a], [b]) => a.localeCompare(b)),
          text: [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent!.trim()).filter(Boolean),
          children: [...element.children].map(visit).filter(Boolean) };
        };
        return JSON.stringify(visit(root));
      };
      const baseline = geometry(reference), outputs: string[] = [], reports: string[] = [];
      const saved: { host: HTMLDivElement; colors: string }[] = [];
      const colors = (host: Element) => JSON.stringify([...host.querySelectorAll('path, line, polyline, polygon, circle, text, rect')]
        .map((element) => { const style = getComputedStyle(element); return [style.stroke, style.fill]; }));
      for (const config of [...configs, configs[0]]) {
        const result = await renderFixture('theme-switch', source, config);
        outputs.push(result.svg);
        const { placementMs: _placement, routingMs: _routing, ...report } = result.report!;
        reports.push(JSON.stringify(report));
        const separate = await renderFixture(`coexisting-${saved.length}`, source);
        const host = document.createElement('div'); host.innerHTML = separate.svg; document.body.append(host);
        saved.push({ host, colors: colors(host) });
      }
      const frontmatter = (config: typeof configs[number]) => `---\nconfig: ${JSON.stringify(config)}\n---\n${source}`;
      const darkOverride = await renderFixture('override-dark', frontmatter(configs[1]), configs[0]);
      const coloredOverride = await renderFixture('override-colored', frontmatter(configs[2]));
      const reset = await renderFixture('override-reset', source);
      const inspect = (svg: string) => {
        const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
        return [getComputedStyle(host.querySelector('[data-circuit-background]')!).fill,
          getComputedStyle(host.querySelector('[data-wire] polyline')!).stroke];
      };
      const flowchart = await renderFixture('unrelated', 'flowchart LR\nA --> B');
      const flowHost = document.createElement('div'); flowHost.innerHTML = flowchart.svg; document.body.append(flowHost);
      const before = colors(flowHost);
      const extra = await renderFixture('another-circuit', source, configs[2]);
      const extraHost = document.createElement('div'); extraHost.innerHTML = extra.svg; document.body.append(extraHost);
      return {
        sameGeometry: [...outputs, darkOverride.svg, coloredOverride.svg, reset.svg].every((svg) => geometry(svg) === baseline),
        sameReports: new Set(reports).size === 1,
        resetIdentical: outputs[0] === outputs[3],
        isolated: saved.every((item) => colors(item.host) === item.colors),
        overrides: [inspect(darkOverride.svg), inspect(coloredOverride.svg), inspect(reset.svg)],
        unrelatedUnchanged: colors(flowHost) === before,
      };
    }, { source, reference: referenceSvgs[path.replace('.mmd', '.svg')], configs: appearances.map((appearance) => appearance.config) });
    expect(result).toEqual({ sameGeometry: true, sameReports: true, resetIdentical: true, isolated: true,
      overrides: [['rgb(16, 18, 21)', 'rgb(242, 242, 242)'], ['rgb(255, 255, 255)', 'rgb(0, 150, 0)'],
        ['rgb(255, 255, 255)', 'rgb(0, 0, 0)']], unrelatedUnchanged: true });
  } finally { await page.close(); }
}, 60_000);

it.each(appearances)('themes all catalog artwork and preserves knockout fills in $name', async ({ config, colors }) => {
  const drawing = new Drawing();
  Object.keys(catalog).forEach((id, index) => drawing.add(new DrawingElement(id as SymbolId,
    { at: [index % 11 * 180, Math.floor(index / 11) * 180], rotation: 0 })));
  const page = await browser!.newPage();
  try {
    await page.goto(server!.resolvedUrls!.local[0]!);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => typeof (window as unknown as { renderFixture?: unknown }).renderFixture === 'function');
    const result = await page.evaluate(async ({ artwork, config, colors }) => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const themed = await renderFixture('catalog-colours', 'circuitDiagram D', config);
      const host = document.createElement('div'); host.innerHTML = themed.svg; document.body.append(host);
      const root = host.querySelector('svg')!;
      const catalog = new DOMParser().parseFromString(artwork, 'image/svg+xml');
      const groups = [...catalog.querySelectorAll('[data-drawing-index]')];
      for (const group of groups) { group.setAttribute('data-device', 'catalog'); root.append(document.importNode(group, true)); }
      const rgb = (hex: string) => `rgb(${[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
      const errors: string[] = [];
      let knockouts = 0, transparent = 0;
      for (const element of root.querySelectorAll<SVGElement>('[data-device] *')) {
        const style = getComputedStyle(element);
        for (const property of ['stroke', 'fill'] as const) {
          const value = element.getAttribute(property);
          if (value === null) continue;
          const background = value === '#fff' || value === 'white';
          if (background) knockouts++;
          if (property === 'fill' && value === 'none') transparent++;
          const expected = value === 'none' ? 'none' : rgb(background ? colors.background : colors.device);
          if (style[property] !== expected) errors.push(`${element.id} ${property}: ${style[property]}`);
        }
        if (element.hasAttribute('font-size') && Math.abs(parseFloat(style.fontSize) - Number(element.getAttribute('font-size'))) > 0.001) errors.push('artwork font size');
        if (element.hasAttribute('font-family') && style.fontFamily !== element.getAttribute('font-family')) errors.push('artwork font family');
      }
      return { count: groups.length, errors, knockouts, transparent };
    }, { artwork: drawing.toSVG(), config, colors });
    expect(result.count).toBe(110);
    expect(result.errors).toEqual([]);
    expect(result.knockouts).toBe(3);
    expect(result.transparent).toBeGreaterThan(110);
  } finally { await page.close(); }
}, 60_000);

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
