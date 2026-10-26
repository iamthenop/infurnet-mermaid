/// <reference types="vite/client" />
import mermaid, { type MermaidConfig } from 'mermaid';
import circuitDiagram from 'mermaid-circuit';
import { getLastRenderReport } from '../../dist/renderer.js';

await mermaid.registerExternalDiagrams([circuitDiagram]);
mermaid.initialize({ startOnLoad: false, deterministicIds: true, deterministicIDSeed: 'circuit' });

export async function renderFixture(id: string, text = 'circuitDiagram D', config?: MermaidConfig) {
  if (config) mermaid.initialize({ startOnLoad: false, deterministicIds: true, deterministicIDSeed: 'circuit', ...config });
  const result = await mermaid.render(id, text);
  return { ...result, report: getLastRenderReport() };
}

const fixtures = import.meta.glob<string>('../fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
export async function renderNamedFixture(name: string, config?: MermaidConfig) {
  const source = fixtures[`../fixtures/${name}.mmd`];
  if (source === undefined) throw new Error(`Unknown fixture "${name}".`);
  return renderFixture(`fixture-${name}`, source, config);
}

const fixture = await fetch(new URL('../basic.mmd', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('Could not load basic.mmd');
  return response.text();
});
const { svg } = await renderFixture('circuit-example', fixture);
document.getElementById('output')!.innerHTML = svg;
document.getElementById('status')!.textContent = 'Circuit rendered successfully.';

const appearances: Record<string, MermaidConfig> = {
  default: { theme: 'default' },
  'default-inverse': { theme: 'dark' },
  colored: { theme: 'base', themeVariables: { background: '#FFFFFF', lineColor: '#009600',
    primaryBorderColor: '#840000', primaryTextColor: '#006464', textColor: '#0F0F0F' } },
};
const controls = document.createElement('div');
document.title = 'Circuit diagram previews';
document.querySelector('h1')!.textContent = 'Circuit diagram previews';
document.querySelector('body > p')!.textContent = 'Choose a circuit and colour appearance.';
document.getElementById('output')!.setAttribute('aria-label', 'Circuit schematic');
const fixtureChoice = document.createElement('select'), appearanceChoice = document.createElement('select');
fixtureChoice.setAttribute('aria-label', 'Circuit example');
appearanceChoice.setAttribute('aria-label', 'Circuit appearance');
for (const path of Object.keys(fixtures)) {
  const name = path.split('/').at(-1)!.replace('.mmd', '');
  fixtureChoice.add(new Option(name, name));
}
for (const name of Object.keys(appearances)) appearanceChoice.add(new Option(name, name));
const params = new URLSearchParams(location.search);
fixtureChoice.value = params.get('fixture') ?? 'cmos-inverter';
appearanceChoice.value = params.get('appearance') ?? 'default';
controls.append(fixtureChoice, appearanceChoice);
document.getElementById('output')!.before(controls);
async function showSelection() {
  const { svg } = await renderNamedFixture(fixtureChoice.value, appearances[appearanceChoice.value]);
  document.getElementById('output')!.innerHTML = svg;
}
fixtureChoice.addEventListener('change', showSelection);
appearanceChoice.addEventListener('change', showSelection);
if (params.has('fixture') || params.has('appearance')) await showSelection();
