/// <reference types="vite/client" />
import mermaid from 'mermaid';
import familyTree from 'mermaid-family-tree';
import portrait from '../fixtures/cat.svg?no-inline&url';

await mermaid.registerExternalDiagrams([familyTree]);
mermaid.initialize({ startOnLoad: false, deterministicIds: true, deterministicIDSeed: 'family-tree' });

export async function renderFixture(id: string, source: string) {
  return mermaid.render(id, source.replaceAll('"cat.svg"', JSON.stringify(portrait)));
}

const fixtures = import.meta.glob<string>('../fixtures/*.mmd', { eager: true, query: '?raw', import: 'default' });
const choice = document.getElementById('fixture') as HTMLSelectElement;
for (const path of Object.keys(fixtures)) {
  const name = path.split('/').at(-1)!.replace('.mmd', '');
  choice.add(new Option(name, path));
}
choice.value = `../fixtures/${new URLSearchParams(location.search).get('fixture') ?? 'colony'}.mmd`;
async function show(): Promise<void> {
  const { svg } = await renderFixture('family-example', fixtures[choice.value]);
  document.getElementById('output')!.innerHTML = svg;
  document.getElementById('status')!.textContent = 'Pedigree rendered successfully.';
}
choice.addEventListener('change', () => { void show(); });
await show();
