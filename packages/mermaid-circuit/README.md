# mermaid-circuit

An external Mermaid diagram scaffold with identifier `circuitDiagram`. The package is private and has not been published.

## Implemented behavior

Only this header-only fixture is supported:

```text
circuitDiagram
```

Blank lines and Mermaid `%%` comments are accepted. Other statements fail parsing. The result is an empty, valid SVG; no components, electrical connectivity, placement, or wires are implemented.

The public default export conforms to Mermaid's `ExternalDiagramDefinition`. Its detector checks the complete declaration token and its asynchronous loader imports the implementation only when requested. The parser records successful header validation in the database; the renderer checks that model and sizes Mermaid's supplied SVG. Mermaid 12.2.0 uses a database object, so `clear()` resets all scaffold state before parsing. Failed parses also clear that state.

Existing SVG assets and `shapes/index.ts` are preserved but are not used by the scaffold. The old circuit-prefixed source stubs, parser stub, test stub, and specifications remain outside the active implementation. The specifications are placeholders, not supported syntax or drawing contracts. Optional diagram styles are omitted because the scaffold draws no marks.

## Local consumption

Use Node.js 24.22.1. From the repository root:

```sh
npm ci
npm run build --workspace mermaid-circuit
```

The workspace resolves `mermaid-circuit` through its compiled `dist/index.js` and declaration export. For a separate local application, build this package first, then install it by path alongside its peer:

```sh
npm install /absolute/path/to/infurnet-mermaid/packages/mermaid-circuit mermaid@12.2.0
```

Register it in the browser host before rendering:

```ts
import mermaid from 'mermaid';
import circuitDiagram from 'mermaid-circuit';

await mermaid.registerExternalDiagrams([circuitDiagram]);
mermaid.initialize({ startOnLoad: false });
const { svg } = await mermaid.render('circuit-example', 'circuitDiagram');
document.getElementById('output')!.innerHTML = svg;
```

Mermaid remains a peer dependency; the library does not bundle a second copy. Integration is tested against 12.2.0 with Mermaid's default strict security mode. Sandbox iframe rendering is not supported by this scaffold. Hosts such as GitHub Markdown and Mermaid Live Editor do not support the custom type unless they load and register this package.

## Browser example and tests

From the repository root:

```sh
npm run dev --workspace mermaid-circuit
```

Open the local URL printed by Vite. The page registers the compiled package, loads `examples/basic.mmd`, and displays the returned SVG with a completion status. An empty diagram is expected.

```sh
npm run typecheck --workspace mermaid-circuit
npm run build --workspace mermaid-circuit
npm test --workspace mermaid-circuit
npx playwright install chromium
npm run test:browser --workspace mermaid-circuit
```

Unit tests cover detection, lazy loading, definition interfaces, unsupported input, and database reset and isolation. Browser tests use Vite and Playwright Chromium to register the compiled package with real Mermaid, inspect valid empty SVG output, reject unsupported notation, and render again after failure. See the [root README](../../README.md) for `.venv/` runtime activation and CI commands.
