import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const existingNames = ['wireless-solenoid', 'cmos-inverter', 'cmos-nand2', 'cmos-xor12', 'xor-nand4', 'logic-variants', 'schmitt-variants'];
const names = [...existingNames, 'resistor-fuse-variants'];
const appearances = [
  { name: 'default', suffix: '', config: { theme: 'default' } },
  { name: 'default-inverse', suffix: '-inverse', config: { theme: 'dark' } },
  { name: 'colored', suffix: '-colored', config: { theme: 'base', themeVariables: {
    background: '#FFFFFF', lineColor: '#009600', primaryBorderColor: '#840000',
    primaryTextColor: '#006464', textColor: '#0F0F0F',
  } } },
];
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
  for (const name of names) for (const appearance of appearances) {
    const result = await page.evaluate(async ({ name, config }) => {
      const { svg, report } = await window.renderNamedFixture(name, config);
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror') || !doc.querySelector('[data-device]') || !doc.querySelector('[data-wire]')) {
        throw new Error(`Incomplete SVG for ${name}.`);
      }
      return { svg, report };
    }, { name, config: appearance.config });
    const reference = new URL(`../examples/fixtures/${name}${appearance.suffix}.svg`, import.meta.url);
    if (existingNames.includes(name)) {
      assert.equal(result.svg + '\n', await readFile(reference, 'utf8'), `${name}/${appearance.name}: reference changed.`);
    } else {
      await writeFile(reference, result.svg + '\n');
    }
    console.log(JSON.stringify({ fixture: name, appearance: appearance.name, ...result.report }));
  }
} finally {
  await browser?.close();
  await server.close();
}
