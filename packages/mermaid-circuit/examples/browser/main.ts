/// <reference types="vite/client" />
import mermaid from 'mermaid';
import circuitDiagram from 'mermaid-circuit';
import { getLastRenderReport } from '../../dist/renderer.js';

await mermaid.registerExternalDiagrams([circuitDiagram]);
mermaid.initialize({ startOnLoad: false, deterministicIds: true, deterministicIDSeed: 'circuit' });

export async function renderFixture(id: string, text = 'circuitDiagram D') {
  const result = await mermaid.render(id, text);
  return { ...result, report: getLastRenderReport() };
}

const fixtures = import.meta.glob<string>('../fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
export async function renderNamedFixture(name: string) {
  const source = fixtures[`../fixtures/${name}.mmd`];
  if (source === undefined) throw new Error(`Unknown fixture "${name}".`);
  return renderFixture(`fixture-${name}`, source);
}

const fixture = await fetch(new URL('../basic.mmd', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('Could not load basic.mmd');
  return response.text();
});
const { svg } = await renderFixture('circuit-example', fixture);
document.getElementById('output')!.innerHTML = svg;
document.getElementById('status')!.textContent = 'Circuit rendered successfully.';
