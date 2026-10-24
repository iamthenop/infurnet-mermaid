import mermaid from 'mermaid';
import circuitDiagram from 'mermaid-circuit';

await mermaid.registerExternalDiagrams([circuitDiagram]);
mermaid.initialize({ startOnLoad: false, deterministicIds: true, deterministicIDSeed: 'circuit' });

export async function renderFixture(id: string, text = 'circuitDiagram D') {
  return mermaid.render(id, text);
}

const fixture = await fetch(new URL('../basic.mmd', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('Could not load basic.mmd');
  return response.text();
});
const { svg } = await renderFixture('circuit-example', fixture);
document.getElementById('output')!.innerHTML = svg;
document.getElementById('status')!.textContent = 'Circuit rendered successfully.';

document.title = 'Circuit diagram';
document.querySelector('h1')!.textContent = 'Circuit diagram';
document.querySelector('body > p')!.textContent = 'Rendered by the registered Mermaid circuit plugin.';
document.getElementById('output')!.setAttribute('aria-label', 'Rendered circuit diagram');
