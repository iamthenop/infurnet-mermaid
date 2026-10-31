import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parseFamily, renderFamily } from '../dist/index.js';

const directory = new URL('../examples/fixtures/', import.meta.url);
for (const name of (await readdir(directory)).filter((name) => name.endsWith('.mmd')).sort()) {
  const family = parseFamily(await readFile(new URL(name, directory), 'utf8'));
  await writeFile(new URL(name.replace('.mmd', '.svg'), directory), renderFamily(family, { id: name.replace('.mmd', '') }) + '\n');
  console.log(`Rendered ${name}: ${family.individuals.length} individuals, ${family.litters.length} litters.`);
}
