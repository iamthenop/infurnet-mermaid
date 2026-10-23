import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

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

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it('registers the compiled package and renders successive empty diagrams in Chromium', async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(server!.resolvedUrls!.local[0]!);
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit parsed successfully; graphical rendering is not implemented.');
    expect(await page.locator('#output svg').count()).toBe(1);
    await page.addScriptTag({ type: 'module', content: "import { renderFixture } from '/main.ts'; window.renderFixture = renderFixture;" });
    await page.waitForFunction(() => typeof (window as unknown as { renderFixture?: unknown }).renderFixture === 'function');
    const result = await page.evaluate(async () => {
      const { renderFixture } = window as unknown as { renderFixture: typeof import('../examples/browser/main.js')['renderFixture'] };
      const first = await renderFixture('first-render', 'circuitDiagram D\nA(("A")):::net\nU["U"]:::inverter\nA ---|I| U');
      let rejection = '';
      try {
        await renderFixture('invalid-render', 'circuitDiagram D\nR1 resistor');
      } catch (error) {
        rejection = String(error);
      }
      const second = await renderFixture('second-render', 'circuitDiagram A\n%% comment\nR["R"]:::resistor\nR2["R2"]:::resistor\nR ---|B:A| R2');
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
      return { first: inspect(first.svg), second: inspect(second.svg), secondSvg: second.svg, rejection };
    });
    for (const svg of [result.first, result.second]) {
      expect(svg).toMatchObject({ name: 'svg', namespace: 'http://www.w3.org/2000/svg', error: false, type: 'circuitDiagram', marks: 0 });
    }
    expect(result.first.id).toBe('first-render');
    expect(result.second.id).toBe('second-render');
    expect(result.rejection).toContain('Unsupported circuit statement');
    expect(result.secondSvg).not.toMatch(/first-render|invalid-render|R1 resistor/u);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}, 60_000);
