import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const names = ['wireless-solenoid', 'cmos-inverter', 'cmos-nand2', 'cmos-xor12', 'xor-nand4'];
const server = await createServer({ root: new URL('../examples/browser/', import.meta.url).pathname,
  server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => document.getElementById('status')?.textContent === 'Circuit rendered successfully.');
  await page.addScriptTag({ type: 'module', content: "import { renderNamedFixture } from '/main.ts'; window.renderNamedFixture = renderNamedFixture;" });
  await page.waitForFunction(() => typeof window.renderNamedFixture === 'function');
  for (const name of names) {
    const result = await page.evaluate(async (name) => {
      const { svg, report } = await window.renderNamedFixture(name);
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror') || !doc.querySelector('[data-device]') || !doc.querySelector('[data-wire]')) {
        throw new Error(`Incomplete SVG for ${name}.`);
      }
      return { svg, report };
    }, name);
    await writeFile(new URL(`../examples/fixtures/${name}.svg`, import.meta.url), result.svg + '\n');
    console.log(JSON.stringify({ fixture: name, ...result.report }));
  }
} finally {
  await browser?.close();
  await server.close();
}
