import mermaid from 'mermaid';
import circuitDiagram from 'mermaid-circuit';

await mermaid.registerExternalDiagrams([circuitDiagram]);
mermaid.initialize({ startOnLoad: false });

export async function renderFixture(id: string, text = 'circuitDiagram D') {
  return mermaid.render(id, text);
}

const fixture = await fetch(new URL('../basic.mmd', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('Could not load basic.mmd');
  return response.text();
});
const { svg } = await renderFixture('circuit-example', fixture);
document.getElementById('output')!.innerHTML = svg;
document.getElementById('status')!.textContent = 'Circuit parsed successfully; graphical rendering is not implemented.';
