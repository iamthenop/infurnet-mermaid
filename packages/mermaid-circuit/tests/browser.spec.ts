/// <reference types="vite/client" />
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { parseCircuit } from '../src/parser/circuitParser.js';
import { layoutCircuit } from '../src/drawing/layout.js';
import { routeCircuit } from '../src/drawing/routing.js';
import { resolveSymbol } from '../src/drawing/symbols.js';

const sources = import.meta.glob('../examples/fixtures/*.mmd', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const svgs = import.meta.glob('../examples/fixtures/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let page: Page;
const errors: string[] = [];

beforeAll(async () => {
  server = await createServer({ root: new URL('../examples/browser/', import.meta.url).pathname, server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
  await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
  await page.waitForFunction(() => typeof (window as unknown as { renderFixture?: unknown }).renderFixture === 'function');
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function render(id: string, source: string) {
  return page.evaluate(async ({ id, source }) => {
    const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
    const result = await renderFixture(id, source);
    document.getElementById('output')!.innerHTML = result.svg;
    return result.svg;
  }, { id, source });
}

it.each(Object.entries(sources))('renders the catalog, routes, labels, and frames through Mermaid: %s', async (path, source) => {
  const name = path.split('/').at(-1)!.replace('.mmd', '');
  const model = parseCircuit(source), layout = layoutCircuit(model), routes = routeCircuit(model, layout);
  const svg = await render(`fixture-${name}`, source);
  expect(svg + '\n').toBe(svgs[path.replace('.mmd', '.svg')]);
  expect(await render(`fixture-${name}`, source)).toBe(svg);
  const inspected = await page.evaluate(({ symbols, routes }) => {
    const svg = document.querySelector<SVGSVGElement>('#output svg')!;
    const content = svg.querySelector<SVGGElement>('[data-circuit]')!;
    const view = svg.viewBox.baseVal, box = content.getBBox();
    const artwork = symbols.map((symbol) => {
      const group = [...svg.querySelectorAll<SVGGElement>('[data-symbol]')].find((g) => symbol.occurrence ? g.getAttribute('data-occurrence') === symbol.occurrence : (g.getAttribute('data-device') ?? g.getAttribute('data-net-symbol')) === symbol.id)!;
      const matrix = group.transform.baseVal.consolidate()!.matrix;
      const source = new DOMParser().parseFromString(symbol.svg, 'image/svg+xml');
      const geometry = (root: ParentNode) => [...root.querySelectorAll('path,polyline,polygon,line,circle,ellipse,rect')].map((n) => [n.localName, ...['d', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height'].map((a) => n.getAttribute(a))]);
      return { id: symbol.id, transform: group.getAttribute('transform'), geometry: geometry(group), original: geometry(source),
        points: symbol.points.map(([x, y]) => { const p = new DOMPoint(x, y).matrixTransform(matrix); return [p.x, p.y]; }) };
    });
    const wires = routes.nets.map((net) => {
      const group = [...svg.querySelectorAll('[data-net]')].find((g) => g.getAttribute('data-net') === net.net)!;
      return { net: net.net, paths: [...group.querySelectorAll('path')].map((p) => p.getAttribute('d')),
        junctions: [...group.querySelectorAll('circle')].map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]),
        components: [...group.querySelectorAll('[data-route-block]')].map((component) => ({ block: component.getAttribute('data-route-block'), paths: [...component.querySelectorAll('path')].map((path) => path.getAttribute('d')) })) };
    });
    const frames = [...svg.querySelectorAll<SVGRectElement>('[data-stage], [data-block]')].map((r) => ({
      kind: r.hasAttribute('data-stage') ? 'stage' : 'block', index: Number(r.getAttribute('data-stage') ?? r.getAttribute('data-block')),
      bounds: { minX: r.x.baseVal.value, minY: r.y.baseVal.value, maxX: r.x.baseVal.value + r.width.baseVal.value, maxY: r.y.baseVal.value + r.height.baseVal.value }, dash: r.getAttribute('stroke-dasharray'),
    }));
    const ids = [...svg.querySelectorAll('[id]')].map((n) => n.id);
    const textBoxes = [...svg.querySelectorAll<SVGTextElement>('text')].map((t) => ({ text: t.textContent, box: t.getBBox() })).map(({ text, box: b }) => ({ text, x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height }));
    return { artwork, wires, frames, ids, occurrences: [...svg.querySelectorAll('[data-occurrence]')].map((node) => ({ id: node.getAttribute('data-net-symbol'), occurrence: node.getAttribute('data-occurrence'), block: node.getAttribute('data-net-block'), role: node.getAttribute('data-net-role'), label: [...svg.querySelectorAll('[data-occurrence-label]')].find((label) => label.getAttribute('data-occurrence-label') === node.getAttribute('data-occurrence'))?.textContent })), text: content.textContent, textBoxes,
      crossings: [...svg.querySelectorAll('[data-crossing]')].map((g) => ({ over: g.getAttribute('data-crossing'), under: g.getAttribute('data-under'), gap: g.querySelector('path')!.getAttribute('stroke-width') })),
      enclosed: view.x <= box.x && view.y <= box.y && view.x + view.width >= box.x + box.width && view.y + view.height >= box.y + box.height,
      width: view.width, height: view.height, error: svg.querySelector('parsererror, script, foreignObject') !== null };
  }, { symbols: [...layout.devices, ...layout.nets].map((p) => {
    const source = resolveSymbol(p.symbol);
    return { id: p.id, occurrence: 'occurrence' in p ? p.occurrence : undefined, svg: source.svg, points: [...Object.values(source.terminals), ...(source.anchor ? [source.anchor] : [])] };
  }), routes });
  expect(inspected.error).toBe(false);
  expect(inspected.occurrences).toEqual(layout.nets.filter((net) => net.occurrence).map((net) => ({ id: net.id, occurrence: net.occurrence, block: String(net.block ?? 'ungrouped'), role: net.role, label: model.nets.find((item) => item.id === net.id)!.label })));
  expect(inspected.enclosed).toBe(true);
  expect(inspected.width).toBeGreaterThan(120);
  expect(inspected.height).toBeGreaterThan(120);
  expect(new Set(inspected.ids).size).toBe(inspected.ids.length);
  for (const [i, placed] of [...layout.devices, ...layout.nets].entries()) {
    const actual = inspected.artwork[i];
    expect(actual.geometry).toEqual(actual.original);
    expect(actual.transform).toBe(placed.svgTransform);
    for (const [j, p] of [...Object.values(placed.terminals), ...(placed.anchor ? [placed.anchor] : [])].entries()) {
      expect(actual.points[j][0]).toBeCloseTo(p[0], 7); expect(actual.points[j][1]).toBeCloseTo(p[1], 7);
    }
  }
  for (const net of routes.nets) {
    const actual = inspected.wires.find((n) => n.net === net.net)!;
    expect(actual.paths).toEqual(net.segments.map((s) => `M ${s.a.join(' ')} L ${s.b.join(' ')}`));
    expect(actual.junctions).toEqual(net.junctions);
    if (layout.sectional) expect(actual.components).toEqual(net.components.map((component) => ({ block: String(component.block ?? 'ungrouped'), paths: component.segments.map((segment) => `M ${segment.a.join(' ')} L ${segment.b.join(' ')}`) })));
  }
  for (const scope of layout.sections ?? [{ block: null }]) {
    const inputBranches = layout.nets.filter((net) => net.symbol === 'pinIn' && (net.block ?? null) === scope.block)
      .sort((a, b) => a.anchor![1] - b.anchor![1])
      .map((net) => routes.nets.find((route) => route.net === net.id)!.components.find((component) => component.block === scope.block)!.junctions).filter((points) => points.length);
    for (let i = 1; i < inputBranches.length; i++) {
      expect(Math.max(...inputBranches[i - 1].map((p) => p[0]))).toBeLessThan(Math.min(...inputBranches[i].map((p) => p[0])));
    }
  }
  expect(inspected.crossings).toEqual(routes.crossings.map((c) => ({ over: c.over, under: c.under, gap: '7' })));
  expect(inspected.frames).toEqual([
    ...layout.blocks.flatMap((b) => b.bounds ? [{ kind: 'block', index: b.block, bounds: b.bounds, dash: null }] : []),
    ...layout.stages.map((s) => ({ kind: 'stage', index: s.stage, bounds: s.bounds, dash: '6 4' })),
  ]);
  for (const wire of inspected.wires) for (const path of wire.paths) {
    const [x1, y1, x2, y2] = path!.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gu)!.map(Number);
    const horizontal = Math.abs(y1 - y2) < 1e-7;
    for (const { bounds: b } of inspected.frames) {
      const low = horizontal ? Math.min(x1, x2) : Math.min(y1, y2), high = horizontal ? Math.max(x1, x2) : Math.max(y1, y2);
      if (high > (horizontal ? b.minX : b.minY) && low < (horizontal ? b.maxX : b.maxY)) {
        for (const side of horizontal ? [b.minY, b.maxY] : [b.minX, b.maxX]) expect(Math.abs((horizontal ? y1 : x1) - side)).toBeGreaterThanOrEqual(20 - 1e-7);
      }
    }
  }
  for (const d of model.devices) expect(inspected.text).toContain(d.id);
  for (const n of model.nets) if (n.implicit) expect(inspected.text).not.toContain(n.id);
  else expect(inspected.text).toContain(n.label);
  for (const [i, a] of inspected.textBoxes.entries()) for (const b of inspected.textBoxes.slice(i + 1)) {
    expect(Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1, `Overlapping labels: ${a.text}, ${b.text}`).toBe(false);
  }
  for (const placed of [...layout.devices, ...layout.nets]) for (const p of [...Object.values(placed.terminals), ...(placed.anchor ? [placed.anchor] : [])]) {
    for (const b of inspected.textBoxes) expect(p[0] > b.x && p[0] < b.right && p[1] > b.y && p[1] < b.bottom, `Label ${b.text} obscures an attachment`).toBe(false);
  }
  expect(errors).toEqual([]);
});

it.each(['pmos', 'nmos', 'pmosBlk', 'nmosBlk', 'resistor', 'capacitor', 'diode', 'voltageSource', 'currentSource', 'inverter', 'buffer'] as const)(
  'embeds the registered %s artwork with all named terminal attachments', async (type) => {
    const mode = type === 'inverter' || type === 'buffer' ? 'D' : 'A';
    const terminals = Object.keys(resolveSymbol(type).terminals);
    const source = `circuitDiagram ${mode}\nU[U]:::${type}\n` + terminals.map((t, i) => `N${i}((N${i})):::net\nN${i} ---|${t}| U`).join('\n');
    await render(`symbol-${type}`, source);
    const artwork = await page.evaluate((source) => {
      const geometry = (root: ParentNode) => [...root.querySelectorAll('path,polygon,polyline,line,circle,ellipse,rect')].map((node) => ({ tag: node.localName, attributes: Object.fromEntries([...node.attributes].filter((a) => a.name !== 'id' && a.name !== 'xmlns').map((a) => [a.name, a.value])) }));
      return { actual: geometry(document.querySelector('[data-device="U"]')!), expected: geometry(new DOMParser().parseFromString(source, 'image/svg+xml')) };
    }, resolveSymbol(type).svg);
    expect(artwork.actual).toEqual(artwork.expected);
    expect(artwork.actual.length).toBeGreaterThan(0);
    expect(await page.locator('[data-terminal]').allTextContents()).toEqual(terminals);
  });

it('escapes parameter text and recovers after invalid and unsupported renders without leaking state', async () => {
  const escaped = await render('escaped-label', 'circuitDiagram A\nR["alias<br/>x < y & z > 1"]:::resistor');
  expect(await page.locator('[data-device-label="R"] tspan').allTextContents()).toEqual(['R', 'x < y & z > 1']);
  expect(escaped).toContain('&lt;');
  const failures = await page.evaluate(async () => {
    const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
    const errors: string[] = [];
    for (const source of ['circuitDiagram D\nR1 resistor', 'circuitDiagram A\nIO([IO]):::pinInOut', 'circuitDiagram A\nU[U]:::ic']) {
      try { await renderFixture('rejected-circuit', source); errors.push('unexpected success'); } catch (error) { errors.push(String(error)); }
    }
    return errors;
  });
  expect(failures[0]).toContain('Unsupported circuit statement');
  expect(failures[1]).toContain('Unsupported pinInOut placement');
  expect(failures[2]).toContain('ic');
  const clean = await render('after-failure', sources['../examples/fixtures/cmos-inverter.mmd']);
  expect(clean).not.toMatch(/escaped-label|rejected-circuit|x &lt; y/u);
  expect(await page.locator('[data-device]').count()).toBe(2);
  expect(errors).toEqual([]);
});

it.each(['TB', 'LR'])('renders exact fractional %s attachment positions', async (direction) => {
  const source = `circuitDiagram A
Y([Y]):::pinOut
subgraph stage mixed
 direction ${direction}
 M[M]:::nmos
 R[R]:::resistor
end
subgraph stage single
 R2[R2]:::resistor
end
M ---|S:A| R
R ---|B| Y
R2 ---|A| Y`;
  const layout = layoutCircuit(parseCircuit(source));
  const point = direction === 'TB' ? layout.devices.find((d) => d.id === 'R2')!.terminals.A : layout.nets[0].anchor!;
  expect(point[direction === 'TB' ? 0 : 1]).toBe(255);
  await render(`fraction-${direction}`, source);
  const endpoints = await page.locator('[data-net="Y"] path').evaluateAll((paths) => paths.flatMap((p) => {
    const numbers = p.getAttribute('d')!.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gu)!.map(Number);
    return [numbers.slice(0, 2), numbers.slice(2, 4)];
  }));
  expect(endpoints).toContainEqual([...point]);
});

it('treats markup in parameters as inert text', async () => {
  await render('inert-label', 'circuitDiagram A\nR["R<br/><img src=x onerror=window.circuitInjected=true>"]:::resistor');
  expect(await page.locator('#output img, #output script, #output foreignObject, #output [onerror]').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { circuitInjected?: unknown }).circuitInjected)).toBeUndefined();
});
