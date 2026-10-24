# mermaid-circuit

An external Mermaid diagram parser with identifier `circuitDiagram`. The package is private and has not been published.

## Implemented behavior

The parser accepts `circuitDiagram D` and `circuitDiagram A`, followed by declarations and connections from the closed 17-type vocabulary in [the notation specification](spec/notation.md).

```text
circuitDiagram D
A(["A"]):::pinIn
Y(["Y"]):::pinOut
subgraph stage logic
    U1["U1"]:::inverter
end
A ---|I| U1
U1 ---|O| Y
```

Blank lines and Mermaid `%%` comments are accepted. The parser validates mode eligibility, declaration brackets, object identity, device terminals, symmetric connections, and typed stage/block membership. Optional device parameters remain uninterpreted label content. Catalog-only shapes and dynamic ICs are not authorable. The full 103-shape catalog is not an authorable device vocabulary.

Direct device connections name both terminals in endpoint order:

```text
circuitDiagram A

R1["R1"]:::resistor
R2["R2"]:::resistor

R1 ---|B:A| R2
```

This connects `R1.B` to `R2.A`; `R2 ---|A:B| R1` is equivalent. The parser normalizes direct connections into terminal-to-net relationships, creating an internal net without a visible label when no explicit net exists.

Shared terminal endpoints form one net, while different terminals preserve separate series nets. An intersecting named net supplies the net identity; a connection that would merge two named nets is rejected. Repeated equivalent connections are deduplicated.

The parsed model records devices, nets, normalized terminal-to-net connections, ordered stages, blocks, and the declared mode. Three-terminal MOSFETs record their implicit bulk-to-source relationship; four-terminal variants expose B. Stage membership creates no electrical connections.

The public default export conforms to Mermaid's `ExternalDiagramDefinition`. Its detector checks the complete declaration token and its asynchronous loader imports the implementation only when requested. Each parse clears the database before validation and stores a complete model only on success. A failed parse leaves no accepted model, and independent databases remain isolated.

The existing renderer checks the accepted model and sizes Mermaid's supplied SVG, which is still empty. Placement is implemented in a separate internal module. Wire routing, junction drawing, dynamic ICs, and final circuit SVG rendering remain unimplemented.

The JSON shape catalog supplies mode eligibility and fixed terminal names. It is included with the compiled package; no Python or parser-generator runtime is required. Optional diagram styles are omitted because the renderer draws no marks.

## Drawing foundation

The TypeScript modules in `src/drawing/` provide point transforms, bounds, and SVG primitives. They adapt selected geometry and SVG operations from Schemdraw.

Source links, credit, and the upstream notice appear in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md). The package uses the [MIT license](LICENSE).

Transforms apply a local offset, scale, rotation, then global translation. SVG coordinates increase rightward and downward, so positive angles rotate clockwise. The same matrix transforms terminal points and symbol artwork.

The SVG serializer emits line, polyline, path, circle, and text elements with escaped values. It preserves supplied coordinates and element order. It produces fragments for an SVG parent, not a separate document.

`node scripts/build-shape-assets.mjs` reads the catalog and copies each registered SVG into an ignored TypeScript module. Both build and unit-test commands run this step. The compiled module ships under `dist/generated/`, so symbol lookup needs no file or network access at runtime.

The 103 source SVGs retain their artwork and license notices. `shapes/shapes.json` remains the authority for dimensions, terminals, anchors, and mode metadata. The nine IC templates remain outside the bundle.

`resolveSymbol` returns SVG content, pane dimensions, transformed attachment points, and the matching SVG matrix. `resolveTerminal` checks a named terminal. Catalog lookup does not make a shape authorable in circuit notation.

The generated module is derived data; it must not be edited or committed. These drawing tools are not yet connected to Mermaid's renderer, which still returns an empty SVG.

## Circuit placement

`src/drawing/layout.ts` places devices and supported peripheral symbols from a validated model. Its result holds positions, transforms, named anchors, and bounds for stages, blocks, and the whole drawing. The model remains unchanged; the module adds no public package export.

Omitting a stage direction selects `auto`, including in the implicit final stage. Explicit `direction LR` and `direction TB` remain available. The [placement rules](spec/style.md#placement-and-rotation) govern arrangement, orientation, and peripheral ordering.

The engine recognizes simple conduction-series chains joined by generic nets with two terminal connections, excluding shared gate inputs. Parallel groups span the same two conduction nets. The NAND2 fixture places its PMOS pull-up group across the stage and its NMOS pull-down chain vertically.

Eligible devices rotate by multiples of 90 degrees to align terminals, using one transform for artwork and named attachments. Automatic CMOS placement keeps the catalog orientation; explicit directions can rotate it. Inputs prefer alignment with their top-left recipient, and LR devices can descend to support separate input rows.

Cycles, branched conduction networks, disconnected devices, and logic signal paths use declaration order where no supported topology rule applies, subject to the CMOS placement convention. Mixed chains also fall back when neither traversal keeps every PMOS above every NMOS. The result identifies stages using the fallback arrangement.

Recognized groups remain separate; this release does not optimize a combined series-parallel network as a whole. Input ordering can prevent direct alignment; the result records whether alignment was achieved.

`pinInOut` remains unplaced because its side is undecided. Generic nets have no independent visible symbol.

Voltage sources retain their stage identity in the top region; stage bounds enclose internal devices. Empty stages retain space, and blocks without stages have no bounds.

The result supplies anchors for a later router. Wire paths, junctions, crossings, labels, frames, and final circuit SVG rendering remain unimplemented.

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
const { svg } = await mermaid.render('circuit-example', 'circuitDiagram D');
document.getElementById('output')!.innerHTML = svg;
```

Mermaid remains a peer dependency; the library does not bundle a second copy. Integration is tested against 12.2.0 with Mermaid's default strict security mode. Sandbox iframe rendering is not supported by this package. Hosts such as GitHub Markdown and Mermaid Live Editor do not support the custom type unless they load and register this package.

## Browser example and tests

From the repository root:

```sh
npm run dev --workspace mermaid-circuit
```

Open the local URL printed by Vite. The page registers the compiled package, loads `examples/basic.mmd`, and displays the returned SVG with a completion status. The fixture parses a connected inverter circuit; its SVG is empty because graphical rendering is not implemented.

```sh
npm run typecheck --workspace mermaid-circuit
npm run build --workspace mermaid-circuit
npm test --workspace mermaid-circuit
npx playwright install chromium
npm run test:browser --workspace mermaid-circuit
```

Unit tests cover detection, lazy loading, parser and definition interfaces, all 17 notation types, mode eligibility, structural membership, normalized connections, NAND2 topology, invalid input, and database reset and isolation. Browser tests use Vite and Playwright Chromium to register the compiled package with real Mermaid, inspect valid empty SVG output, reject unsupported notation, and render again after failure. See the [root README](../../README.md) for `.venv/` runtime activation and CI commands.
