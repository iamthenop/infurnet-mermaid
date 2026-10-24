import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const names = ['single-device', 'series', 'parallel', 'shared-input', 'cmos-inverter', 'explicit-lr', 'nand2', 'nor3', 'xor2', 'xor-nand4'];
const server = await createServer({ root: new URL('../examples/browser/', import.meta.url).pathname,
  server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
  const outputs = [];
  for (const name of names) {
    const source = await readFile(new URL(`../examples/fixtures/${name}.mmd`, import.meta.url), 'utf8');
    const svg = await page.evaluate(async ({ name, source }) => {
      const { renderFixture } = await import('/main.ts');
      const { svg } = await renderFixture(`fixture-${name}`, source);
      const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (document.querySelector('parsererror') || !document.querySelector('[data-device] path, [data-device] polygon, [data-device] circle'))
        throw new Error(`Empty or invalid circuit SVG: ${name}`);
      return svg;
    }, { name, source });
    outputs.push({ name, svg });
  }
  for (const { name, svg } of outputs) {
    await writeFile(new URL(`../examples/fixtures/${name}.svg`, import.meta.url), svg + '\n');
    console.log(`Generated ${name}.svg through mermaid.render()`);
  }
} finally {
  await browser?.close();
  await server.close();
}
