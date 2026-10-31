/// <reference types="vite/client" />
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

const fixtures = import.meta.glob<string>('../examples/fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
let server: ViteDevServer | undefined, browser: Browser | undefined;

beforeAll(async () => {
  server = await createServer({ root: new URL('../examples/browser/', import.meta.url).pathname, server: { host: '127.0.0.1', port: 0 } });
  await server.listen(); browser = await chromium.launch();
}, 60_000);
afterAll(async () => { await browser?.close(); await server?.close(); });

it.each(Object.entries(fixtures))('renders valid, deterministic SVG with correct portrait and rail geometry: %s', async (_name, source) => {
  const page = await browser!.newPage();
  try {
    await page.goto(server!.resolvedUrls!.local[0]);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Pedigree rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => 'renderFixture' in window);
    const result = await page.evaluate(async (source) => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const first = await renderFixture('test-family', source), second = await renderFixture('test-family', source);
      const host = document.createElement('div'); host.innerHTML = second.svg; document.body.append(host);
      const root = host.querySelector('svg')!;
      const ids = [...root.querySelectorAll('[id]')].map((node) => node.id);
      const portraits = [...root.querySelectorAll<SVGGElement>('[data-individual]')].map((node) => {
        const image = node.querySelector('image'), plate = node.querySelector('rect')!, circle = node.querySelector('clipPath circle');
        if (!image) return { plain: true, circles: node.querySelectorAll('circle').length };
        const number = (element: Element, key: string) => Number(element.getAttribute(key));
        return { plain: false, diameter: number(circle!, 'r') * 2, width: number(plate, 'width'),
          circleBottom: number(circle!, 'cy') + number(circle!, 'r'), plateMiddle: number(plate, 'y') + number(plate, 'height') / 2,
          imageBeforePlate: Boolean(image.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING),
          clipExists: root.querySelector(`[id="${image.getAttribute('clip-path')!.slice(5, -1)}"]`) !== null };
      });
      const errors: string[] = [];
      for (const litter of root.querySelectorAll('[data-litter]')) {
        const rail = litter.querySelector('path[data-rail]')!.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/gu)!.map(Number);
        if (rail[1] !== rail[3]) errors.push('non-horizontal rail');
        for (const drop of litter.querySelectorAll('path[data-offspring]')) {
          const points = drop.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/gu)!.map(Number);
          const child = [...root.querySelectorAll('[data-individual]')].find((node) => node.getAttribute('data-individual') === drop.getAttribute('data-offspring'))!;
          const image = child.querySelector('image'), plate = child.querySelector('rect')!;
          if (points[0] !== points[2] || points[1] !== rail[1] || points[3] !== Number((image ?? plate).getAttribute('y'))) errors.push('disconnected kitten drop');
        }
      }
      const external = await renderFixture('coexisting', source);
      const other = document.createElement('div'); other.innerHTML = external.svg; document.body.append(other);
      const secondIds = new Set([...other.querySelectorAll('[id]')].map((node) => node.id));
      const flow = await renderFixture('flow', 'flowchart TB\nA-->B');
      return { deterministic: first.svg === second.svg, type: root.getAttribute('aria-roledescription'),
        xmlError: Boolean(new DOMParser().parseFromString(second.svg, 'image/svg+xml').querySelector('parsererror')),
        idsUnique: new Set(ids).size === ids.length, idsIsolated: ids.every((id) => !secondIds.has(id)), portraits, errors,
        sexOnEdges: [...root.querySelectorAll('[data-kind]')].some((edge) => /[♀♂]/u.test(edge.textContent ?? '')),
        flowWorks: flow.svg.includes('flowchart') };
    }, source);
    expect(result).toMatchObject({ deterministic: true, type: 'familyTree', xmlError: false, idsUnique: true, idsIsolated: true,
      errors: [], sexOnEdges: false, flowWorks: true });
    for (const node of result.portraits) {
      if (node.plain) expect(node.circles).toBe(0);
      else {
        expect(node.diameter).toBe(node.width); expect(node.circleBottom).toBe(node.plateMiddle);
        expect(node.imageBeforePlate).toBe(true); expect(node.clipExists).toBe(true);
      }
    }
  } finally { await page.close(); }
}, 60_000);

it.each([
  ['generation-spans', [['Grandfather', 'Granddaughter', 2], ['Ancestor', 'Descendant', 3], ['Mother', 'Daughter', 1], ['A', 'B', 1], ['B', 'C', 1], ['A', 'C', 2]], 9],
  ['unknown-generation-spans', [['Ancestor', 'Descendant', 1], ['Grandparent', 'Child', 2], ['Founder', 'Middle', 1], ['Middle', 'Last', 2], ['Founder', 'Last', 3]], 8],
] as const)('draws the declared rank separations and endpoint geometry in %s', async (name, expected, count) => {
  const page = await browser!.newPage();
  try {
    await page.goto(server!.resolvedUrls!.local[0]);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Pedigree rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => 'renderFixture' in window);
    const result = await page.evaluate(async ({ source, expected }) => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const { svg } = await renderFixture('spans', source);
      const host = document.createElement('div'); host.innerHTML = svg; document.body.append(host);
      const root = host.querySelector('svg')!;
      const nodes = new Map([...root.querySelectorAll<SVGGElement>('[data-individual]')].map((node) => {
        const plate = node.querySelector<SVGRectElement>('[data-nameplate]')!, box = plate.getBBox();
        return [node.getAttribute('data-individual')!, { rank: Number(node.getAttribute('data-generation')),
          x: box.x, y: box.y, width: box.width, height: box.height }];
      }));
      const errors: string[] = [];
      for (const [from, to, span] of expected) {
        const a = nodes.get(from)!, b = nodes.get(to)!;
        if (b.rank - a.rank !== span || Math.abs((b.y - a.y) / span - 212) > 0.001) errors.push(`rank separation: ${from} -> ${to}`);
      }
      const declarations: string[] = [];
      for (const edge of root.querySelectorAll('[data-kind="ancestry"], [data-kind="confirmed"]')) {
        const from = edge.getAttribute('data-source')!, to = edge.getAttribute('data-target')!;
        const a = nodes.get(from)!, b = nodes.get(to)!, path = edge.querySelector<SVGPathElement>('path')!;
        const first = path.getPointAtLength(0), last = path.getPointAtLength(path.getTotalLength());
        if (Math.abs(first.y - a.y - a.height) > 0.001 || first.x < a.x || first.x > a.x + a.width) errors.push(`source port: ${from}`);
        if (Math.abs(last.x - b.x) > 0.001 || Math.abs(last.y - b.y - b.height / 2) > 0.001) errors.push(`target port: ${to}`);
        const points = path.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/gu)!.map(Number);
        for (let i = 2; i < points.length; i += 2) {
          const [x0, y0, x1, y1] = points.slice(i - 2, i + 2);
          if (x0 !== x1 && y0 !== y1) errors.push('non-orthogonal segment');
          for (const [id, node] of nodes) {
            if (id === from || id === to) continue;
            const intersects = x0 === x1
              ? x0 > node.x && x0 < node.x + node.width && Math.max(y0, y1) > node.y && Math.min(y0, y1) < node.y + node.height
              : y0 > node.y && y0 < node.y + node.height && Math.max(x0, x1) > node.x && Math.min(x0, x1) < node.x + node.width;
            if (intersects) errors.push(`${from} -> ${to} crosses ${id}`);
          }
        }
        if (edge.hasAttribute('data-generation-span')) declarations.push(`${from}:${to}:${edge.getAttribute('data-generation-span')}`);
      }
      return { errors, count: nodes.size, declarations };
    }, { source: fixtures[`../examples/fixtures/${name}.mmd`], expected });
    expect(result.errors).toEqual([]); expect(result.count).toBe(count);
    if (name === 'unknown-generation-spans') {
      expect(result.declarations).toContain('Grandparent:Child:unknown');
      expect(result.declarations).toContain('Ancestor:Descendant:unknown');
    } else expect(result.declarations).toContain('Grandfather:Granddaughter:2');
  } finally { await page.close(); }
}, 60_000);

it('reports contradictory paths through Mermaid before drawing a pedigree', async () => {
  const page = await browser!.newPage();
  try {
    await page.goto(server!.resolvedUrls!.local[0]);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Pedigree rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => 'renderFixture' in window);
    const error = await page.evaluate(async () => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      try { await renderFixture('conflict', 'familyTree TB\ncatmode\nA-->B\nB-->C\nA-->C'); return ''; }
      catch (error) { return String(error); }
    });
    for (const edge of ['A --> B', 'B --> C', 'A --> C']) expect(error).toContain(edge);
  } finally { await page.close(); }
}, 60_000);

it('clears failed parses and keeps untrusted labels as text', async () => {
  const page = await browser!.newPage();
  try {
    await page.goto(server!.resolvedUrls!.local[0]);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Pedigree rendered successfully.');
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => 'renderFixture' in window);
    const result = await page.evaluate(async () => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      let rejected = false;
      try { await renderFixture('bad', 'familyTree TB\ncatmode\nA-->A'); } catch { rejected = true; }
      const good = await renderFixture('good', 'familyTree TB\ncatmode\nK["<script>alert(1)</script> & kitten"]');
      const document = new DOMParser().parseFromString(good.svg, 'image/svg+xml');
      return { rejected, script: !!document.querySelector('script'), count: document.querySelectorAll('[data-individual]').length,
        text: document.querySelector('[data-individual] text')!.textContent };
    });
    expect(result).toEqual({ rejected: true, script: false, count: 1, text: '<script>alert(1)</script> & kitten' });
  } finally { await page.close(); }
}, 60_000);
