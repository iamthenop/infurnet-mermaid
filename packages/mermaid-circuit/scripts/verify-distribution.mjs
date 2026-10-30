import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repository = await realpath(join(packageRoot, '../..'));
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'mermaid-circuit');
assert.equal(manifest.version, '0.1.0');
assert.equal(manifest.private, undefined);
assert.equal(manifest.type, 'module');
assert.equal(manifest.license, 'MIT');
assert.equal(manifest.peerDependencies.mermaid, '12.2.0');
assert.equal(JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')).private, true);
const npm = process.env.npm_execpath;
assert(npm, 'Run with npm run verify:distribution.');
assert.equal(process.versions.node, '24.22.1', 'Use the tested Node.js runtime.');
const args = process.argv.slice(2);
assert(args.length === 0 || args.length === 2 && args[0] === '--tarball-output',
  'Usage: npm run verify:distribution -- [--tarball-output /absolute/path/package.tgz]');
assert(args.length === 0 || isAbsolute(args[1]), '--tarball-output requires an absolute path.');
const output = args.length ? resolve(args[1]) : undefined;
const inside = (root, path) => path === root || path.startsWith(root + sep);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const env = { ...process.env };
delete env.NODE_PATH;
delete env.NODE_OPTIONS;
const run = (command, arguments_, cwd, capture = false) => execFileSync(command, arguments_,
  { cwd, env, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

function unpack(bytes) {
  const tar = gunzipSync(bytes), files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, size) => header.subarray(start, start + size).toString().replace(/\0.*$/su, '');
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
    const size = parseInt(field(124, 12).trim(), 8);
    const type = field(156, 1);
    assert(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= tar.length, 'Invalid tar entry.');
    assert(type === '' || type === '0', `Unexpected tar entry type ${type}: ${name}`);
    assert(name.startsWith('package/') && !name.split('/').includes('..') && !files.has(name), `Unsafe tar path: ${name}`);
    const path = name.slice('package/'.length);
    assert(/^(?:dist\/(?:[\w-]+\/)*[\w-]+\.(?:js|d\.ts)|shapes\/shapes\.json|package\.json|README\.md|LICENSE|ACKNOWLEDGEMENTS\.md)$/u.test(path),
      `Unintended package content: ${name}`);
    files.set(path, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function browserChecks({ fixtures, appearances }) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const geometry = (svg) => {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    check(root.localName === 'svg' && !root.querySelector('parsererror'), 'Invalid SVG.');
    const originalId = root.id;
    const visit = (element) => {
      if (element.localName === 'style' || element.hasAttribute('data-circuit-background')) return undefined;
      return { tag: element.localName, attributes: [...element.attributes]
        .filter((attribute) => !['stroke', 'fill', 'style'].includes(attribute.name))
        .map((attribute) => [attribute.name, attribute.name === 'id' ? attribute.value.replace(originalId, 'circuit') : attribute.value])
        .sort(([a], [b]) => a.localeCompare(b)),
      text: [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent.trim()).filter(Boolean),
      children: [...element.children].map(visit).filter(Boolean) };
    };
    return JSON.stringify(visit(root));
  };
  const results = [];
  for (const fixture of fixtures) for (const appearance of appearances) {
    const { svg, model } = await window.renderCircuit(fixture.source, appearance.config);
    check(geometry(svg) === geometry(fixture.references[appearance.name]), `${fixture.name}: reference geometry or identities changed.`);
    const frame = document.createElement('iframe'); document.body.append(frame);
    try {
      frame.contentDocument.body.innerHTML = svg;
      const root = frame.contentDocument.querySelector('svg');
      check(root.querySelector('[data-device]') && root.querySelector('[data-wire]'), 'Empty drawing.');
      check(root.querySelectorAll('[data-device]').length === model.devices.length, 'Device count changed.');
      check(root.querySelectorAll('[data-terminal-net]').length === model.connections.length, 'Terminal count changed.');
      check(root.querySelectorAll('[data-stage]').length === model.stages.filter((stage) => !stage.implicit).length, 'Stage count changed.');
      check(root.querySelectorAll('[data-block]').length === model.blocks.length, 'Block count changed.');
      const wires = [...root.querySelectorAll('[data-wire]')].map((group) => ({ net: group.getAttribute('data-net'),
        points: JSON.parse(group.getAttribute('data-points')) }));
      for (const device of model.devices) check([...root.querySelectorAll('[data-device]')]
        .some((group) => group.getAttribute('data-device') === device.id && group.getAttribute('data-type') === device.type), `Missing device ${device.id}`);
      for (const connection of model.connections) {
        const marker = [...root.querySelectorAll('[data-terminal]')].find((element) =>
          element.getAttribute('data-terminal-device') === connection.device && element.getAttribute('data-terminal') === connection.terminal);
        check(marker?.getAttribute('data-terminal-net') === connection.net, `Net mismatch: ${connection.device}.${connection.terminal}`);
        const point = [Number(marker.getAttribute('data-x')), Number(marker.getAttribute('data-y'))];
        check(wires.some((wire) => wire.net === connection.net && [wire.points[0], wire.points.at(-1)]
          .some((end) => Math.hypot(end[0] - point[0], end[1] - point[1]) < 1e-7)), 'Disconnected terminal.');
      }
      const colors = appearance.colors;
      const checks = [
        ['[data-circuit-background]', 'fill', colors.background],
        ['[data-wire] polyline', 'stroke', colors.wire],
        ['[data-junction] circle', 'fill', colors.wire],
        ['[data-junction] circle', 'stroke', colors.wire],
        ['[data-device] [stroke]:not([stroke="none"]), [data-net-occurrence] [stroke]:not([stroke="none"])', 'stroke', colors.device],
        ['[data-device] [fill="#000"], [data-net-occurrence] [fill="#000"]', 'fill', colors.device],
        ['[data-device] [fill="#fff"], [data-device] [fill="white"], [data-net-occurrence] [fill="#fff"], [data-net-occurrence] [fill="white"]', 'fill', colors.background],
        ['[data-device] [fill="none"], [data-net-occurrence] [fill="none"]', 'fill', 'none'],
        ['[data-device-label] text, [data-ic-label] text, [data-terminal] text', 'fill', colors.label],
        ['[data-net-label] text, [data-frame-label] text', 'fill', colors.text],
        ['[data-stage] polyline, [data-block] polyline', 'stroke', colors.frame],
      ];
      check(root.querySelector('[data-circuit-background]') && root.querySelector('style'), 'Missing standalone colours.');
      for (const [selector, property, expected] of checks) for (const element of root.querySelectorAll(selector)) {
        const rgb = expected === 'none' ? 'none' : `rgb(${[1, 3, 5].map((offset) => parseInt(expected.slice(offset, offset + 2), 16)).join(', ')})`;
        check(frame.contentWindow.getComputedStyle(element)[property] === rgb, `${fixture.name}/${appearance.name}: ${selector} ${property}`);
      }
      results.push({ fixture: fixture.name, appearance: appearance.name, devices: model.devices.length,
        terminals: model.connections.length, routes: wires.length, junctions: root.querySelectorAll('[data-junction]').length, result: 'pass' });
    } finally { frame.remove(); }
  }
  return results;
}

async function verifyConsumer() {
  const { default: assert } = await import('node:assert/strict');
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { realpathSync } = await import('node:fs');
  const { readFile, realpath, lstat } = await import('node:fs/promises');
  const { dirname, join, sep } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const { registerHooks } = await import('node:module');
  const root = await realpath(process.cwd());
  const inside = (path) => path === root || path.startsWith(root + sep);
  const data = JSON.parse(await readFile('verification.json', 'utf8'));
  registerHooks({ resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.startsWith('file:')) assert(inside(realpathSync(fileURLToPath(result.url))), `Import escaped consumer: ${specifier}`);
    else assert(result.url.startsWith('node:'), `Unexpected import protocol: ${result.url}`);
    return result;
  } });
  const entry = await realpath(fileURLToPath(import.meta.resolve('mermaid-circuit')));
  const installed = dirname(dirname(entry));
  assert.equal(installed, join(root, 'node_modules/mermaid-circuit'));
  assert(!(await lstat(installed)).isSymbolicLink(), 'Workspace link is forbidden.');
  for (const [path, digest] of Object.entries(data.inventory)) {
    const actual = await realpath(join(installed, path));
    assert(inside(actual), `File escaped the consumer: ${actual}`);
    assert.equal(createHash('sha256').update(await readFile(actual)).digest('hex'), digest, `Installed file differs: ${path}`);
  }
  const { default: circuitDiagram } = await import('mermaid-circuit');
  assert.equal(circuitDiagram.id, 'circuitDiagram');
  assert.equal(typeof circuitDiagram.loader, 'function');
  assert(circuitDiagram.detector('circuitDiagram A') && circuitDiagram.detector('circuitDiagram D'));
  assert(!circuitDiagram.detector('flowchart LR'));
  const catalog = JSON.parse(await readFile(join(installed, 'shapes/shapes.json'), 'utf8'));
  const { resolveSymbol } = await import(pathToFileURL(join(installed, 'dist/drawing/symbols.js')));
  assert.equal(Object.keys(catalog).length, 110);
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(data.symbols).sort());
  for (const id of Object.keys(catalog)) {
    const symbol = resolveSymbol(id);
    assert.equal(createHash('sha256').update(symbol.svg).digest('hex'), data.symbols[id], `Changed/missing artwork: ${id}`);
    assert(symbol.svg.includes('<svg'), `Missing SVG: ${id}`);
  }
  console.log(JSON.stringify({ publicImport: 'pass', installedEntry: entry, bundledSymbols: 110, sourceSvgFilesRequired: false }));
  const tsc = await realpath(join(root, 'node_modules/.bin/tsc'));
  assert(inside(tsc), 'TypeScript must run from the consumer.');
  const types = execFileSync(process.execPath, [tsc, '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck',
    '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--listFiles', 'consumer.ts'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const typeFiles = types.trim().split(/\r?\n/u);
  for (const path of typeFiles) assert(inside(await realpath(path)), `Declaration escaped consumer: ${path}`);
  assert(typeFiles.includes(join(installed, 'dist/index.d.ts')), 'Published declarations were not used.');
  console.log(JSON.stringify({ typescript: 'pass', declarationFiles: typeFiles.length }));
  const { createServer } = await import('vite');
  const { chromium } = await import('playwright');
  const server = await createServer({ configFile: false, root, cacheDir: join(root, '.vite'),
    server: { host: '127.0.0.1', port: 0, fs: { strict: true, allow: [root] } },
    optimizeDeps: { include: ['mermaid', 'mermaid-circuit'] },
    plugins: [{ name: 'consumer-boundary', enforce: 'pre', async load(id) {
      const path = id.split('?')[0];
      if (path.startsWith('/') && !id.startsWith('/@')) assert(inside(await realpath(path)), `Runtime module escaped consumer: ${id}`);
    } }] });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.distributionReady === true);
    await page.route('**/*', (route) => { requests.push(route.request().url()); return route.abort(); });
    const results = await page.evaluate(browserChecks, data);
    assert.deepEqual(errors, [], 'Browser errors.');
    assert.deepEqual(requests, [], 'Rendering must not request artwork or other network resources.');
    for (const module of server.environments.client.moduleGraph.idToModuleMap.values()) {
      if (module.file) assert(inside(await realpath(module.file)), `Loaded source outside consumer: ${module.file}`);
    }
    for (const result of results) console.log(JSON.stringify(result));
    assert.equal(results.length, 39);
    console.log(JSON.stringify({ isolatedRendering: 'pass', networkRequestsDuringRendering: requests.length }));
  } finally {
    await browser?.close();
    await server.close();
  }
}

const workspace = await realpath(await mkdtemp(join(tmpdir(), 'mermaid-circuit-consumer-')));
assert(!inside(repository, workspace), 'Consumer must be outside the repository.');
try {
  run(process.execPath, [npm, 'run', 'build', '--workspace', 'mermaid-circuit'], repository);
  const dryRun = JSON.parse(run(process.execPath, [npm, 'pack', '--dry-run', '--json', '--workspace', 'mermaid-circuit'], repository, true))[0];
  const packed = JSON.parse(run(process.execPath, [npm, 'pack', '--json', '--workspace', 'mermaid-circuit', '--pack-destination', workspace], repository, true))[0];
  const tarball = join(workspace, packed.filename), bytes = await readFile(tarball), files = unpack(bytes);
  assert.deepEqual([...files.keys()].sort(), dryRun.files.map((file) => file.path).sort(), 'Tarball differs from dry run.');
  const expectedFiles = ['package.json', 'README.md', 'LICENSE', 'ACKNOWLEDGEMENTS.md', 'shapes/shapes.json'];
  for (const source of await readdir(join(packageRoot, 'src'), { recursive: true })) {
    if (source.endsWith('.ts')) expectedFiles.push(...['.js', '.d.ts'].map((extension) => `dist/${source.slice(0, -3).split(sep).join('/')}${extension}`));
  }
  assert.deepEqual([...files.keys()].sort(), expectedFiles.sort(), 'Unexpected or missing compiled files in tarball.');
  for (const path of ['dist/index.js', 'dist/index.d.ts', 'dist/generated/symbol-assets.js', 'shapes/shapes.json',
    'package.json', 'README.md', 'LICENSE', 'ACKNOWLEDGEMENTS.md']) assert(files.has(path), `Missing distribution file: ${path}`);
  assert.equal(JSON.parse(files.get('package.json')).version, '0.1.0');
  for (const path of ['LICENSE', 'ACKNOWLEDGEMENTS.md']) assert(files.get(path).equals(await readFile(join(packageRoot, path))), `Changed notice: ${path}`);
  const catalog = JSON.parse(files.get('shapes/shapes.json'));
  const symbols = Object.fromEntries(await Promise.all(Object.entries(catalog).map(async ([id, entry]) =>
    [id, sha256(await readFile(join(packageRoot, 'shapes', entry.file)))])));
  const appearances = [
    { name: 'default', suffix: '', config: { theme: 'default' }, colors: { background: '#FFFFFF', wire: '#000000', device: '#000000', label: '#000000', text: '#000000', frame: '#000000' } },
    { name: 'default-inverse', suffix: '-inverse', config: { theme: 'dark' }, colors: { background: '#101215', wire: '#F2F2F2', device: '#F2F2F2', label: '#F2F2F2', text: '#F2F2F2', frame: '#F2F2F2' } },
    { name: 'colored', suffix: '-colored', config: { theme: 'base', themeVariables: { background: '#FFFFFF', lineColor: '#009600', primaryBorderColor: '#840000', primaryTextColor: '#006464', textColor: '#0F0F0F' } },
      colors: { background: '#FFFFFF', wire: '#009600', device: '#840000', label: '#006464', text: '#0F0F0F', frame: '#777777' } },
  ];
  const fixtures = await Promise.all(['wireless-solenoid', 'cmos-inverter', 'cmos-nand2', 'cmos-xor12', 'xor-nand4', 'logic-variants', 'schmitt-variants', 'resistor-fuse-variants', 'capacitor-load-variants', 'diode-variants', 'mosfet-variants', 'mux-demux', 'opamp-open-loop'].map(async (name) => ({ name,
    source: await readFile(join(packageRoot, `examples/fixtures/${name}.mmd`), 'utf8'),
    references: Object.fromEntries(await Promise.all(appearances.map(async ({ name: appearance, suffix }) =>
      [appearance, await readFile(join(packageRoot, `examples/fixtures/${name}${suffix}.svg`), 'utf8')]))),
  })));
  console.log(JSON.stringify({ tarball: packed.filename, bytes: bytes.length, sha256: sha256(bytes),
    inventory: [...files.keys()].sort() }));
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ name: 'circuit-distribution-consumer', private: true, type: 'module' }));
  run(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', tarball,
    'mermaid@12.2.0', ...['typescript', 'vite', 'playwright'].map((name) => `${name}@${manifest.devDependencies[name]}`)], workspace);
  await writeFile(join(workspace, 'consumer.ts'), "import mermaid from 'mermaid';\nimport circuitDiagram from 'mermaid-circuit';\nawait mermaid.registerExternalDiagrams([circuitDiagram]);\n");
  await writeFile(join(workspace, 'index.html'), '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>');
  await writeFile(join(workspace, 'main.js'), `import mermaid from 'mermaid';
import circuitDiagram from 'mermaid-circuit';
await mermaid.registerExternalDiagrams([circuitDiagram]);
const { diagram } = await circuitDiagram.loader();
window.renderCircuit = async (source, config) => {
  mermaid.initialize({ startOnLoad: false, deterministicIds: true, deterministicIDSeed: 'circuit', ...config });
  const parsed = await mermaid.parse(source);
  if (parsed.diagramType !== 'circuitDiagram') throw new Error('Wrong diagram type.');
  const { svg } = await mermaid.render('distribution-circuit', source);
  return { svg, model: diagram.db.getModel() };
};
window.distributionReady = true;
`);
  await writeFile(join(workspace, 'verification.json'), JSON.stringify({ fixtures, appearances, symbols,
    inventory: Object.fromEntries([...files].map(([name, data]) => [name, sha256(data)])) }));
  await writeFile(join(workspace, 'verify.mjs'), `${browserChecks.toString()}\n${verifyConsumer.toString()}\nawait verifyConsumer();\n`);
  run(process.execPath, ['verify.mjs'], workspace);
  if (output) {
    assert(!inside(repository, await realpath(dirname(output))), 'Retained tarball must be outside the repository.');
    await copyFile(tarball, output);
    console.log(JSON.stringify({ verifiedTarball: output, sha256: sha256(bytes) }));
  }
  console.log('Distribution verification passed. Nothing was published.');
} finally {
  await rm(workspace, { recursive: true, force: true });
  console.log('Removed isolated consumer and local temporary tarball.');
}
