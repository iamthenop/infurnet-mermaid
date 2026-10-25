# mermaid-circuit

An external Mermaid diagram parser with identifier `circuitDiagram`. The package is private and has not been published.

## Implemented behavior

The parser accepts `circuitDiagram D` and `circuitDiagram A`, followed by declarations and connections from the closed 16-type vocabulary in [the notation specification](spec/notation.md).

```text
circuitDiagram D
A(["A"]):::pinIn
Y(["Y"]):::pinOut
subgraph stage logic
    U1["U1"]:::inverter
end
A --- U1 |I|
U1 |O| --- Y
```

Blank lines and Mermaid `%%` comments are accepted. The parser validates mode eligibility, declaration brackets, object identity, device terminals, terminal-qualified connections, and typed stage/block membership. Optional device parameters remain uninterpreted label content.

Catalog-only shapes and dynamic ICs are not authorable. The full 103-shape catalog is not an authorable device vocabulary.

Direct device connections name both terminals in endpoint order:

```text
circuitDiagram A

R1["R1"]:::resistor
R2["R2"]:::resistor

R1 |B| --- |A| R2
```

This connects `R1.B` to `R2.A` with current flow stated from left to right. The parser normalizes connectivity into terminal-to-net relationships; generic nets are implied and cannot be declared with `:::net`.

The former colon-separated terminal syntax is rejected.

Shared terminals imply one net and a junction, while distinct terminal groups remain separate. Repeated statements do not duplicate connectivity. Direct source-to-source and source-to-drain statements are rejected; write drain-to-source connections in that order.

External endpoints may be declared using their existing types. Missing declarations are inferred from the approved MOS terminal mapping in [connection syntax](spec/notation.md#connection-syntax), never from names such as `VDD`. Endpoints without a mapped MOS connection require explicit declarations.

The normalized model remains a connectivity model, not an electrical simulator.

The parsed model records devices, nets, normalized terminal-to-net connections, ordered stages, blocks, and the declared mode. Three-terminal MOSFETs record their implicit bulk-to-source relationship; four-terminal variants expose B. Stage membership creates no electrical connections.

The public default export conforms to Mermaid's `ExternalDiagramDefinition`. Its detector checks the complete declaration token and its asynchronous loader imports the implementation only when requested. Each parse clears the database before validation and stores a complete model only on success. A failed parse leaves no accepted model, and independent databases remain isolated.

The existing renderer checks the accepted model and sizes Mermaid's supplied SVG. It still produces an empty SVG. Layout, wire routing, junction drawing, dynamic ICs, and device rendering are unimplemented. The specifications distinguish implemented notation from approved future drawing and IC requirements.

The JSON shape catalog supplies mode eligibility and fixed terminal names. It is included with the compiled package; no Python or parser-generator runtime is required. Optional diagram styles are omitted because the renderer draws no marks.

## Drawing foundation

The TypeScript modules in `src/drawing/` provide a small, standalone drawing core adapted from Schemdraw. They support manual composition with `Drawing`, `Element`, `Line`, `Wire`, and `Dot`. They do not consume the circuit model or choose device positions.

Source links, credit, and the upstream notice appear in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md). The package uses the [MIT license](LICENSE).

Transforms apply a local offset, scale, rotation, then global translation. SVG coordinates increase rightward and downward, so positive angles rotate clockwise. The same matrix transforms terminal points and symbol artwork.

The SVG serializer emits line, polyline, path, circle, and text elements with escaped values, preserving coordinates and element order. `Drawing.toSVG(margin)` wraps these fragments and catalog symbols in a standalone SVG document. The default margin is four units.

`node scripts/build-shape-assets.mjs` reads the catalog and copies each registered SVG into an ignored TypeScript module. Both build and unit-test commands run this step. The compiled module ships under `dist/generated/`, so symbol lookup needs no file or network access at runtime.

The 103 source SVGs retain their artwork and license notices. `shapes/shapes.json` remains the authority for dimensions, terminals, anchors, and mode metadata. The nine IC templates remain outside the bundle.

`resolveSymbol` returns SVG content, pane dimensions, transformed attachment points, and the matching SVG matrix. `resolveTerminal` checks a named terminal. Catalog lookup does not make a shape authorable in circuit notation.

The generated module is derived data; it must not be edited or committed. These drawing tools are not connected to Mermaid's renderer, which still returns an empty SVG. Automatic placement, routing, and circuit rendering remain unimplemented.

### Manual drawing

`Drawing.add` returns the placed element, including its transformed anchors and bounds. Elements stay in drawing order. `here` and `theta` expose the current position and direction.

`move(dx, dy)` and `moveFrom(point, dx, dy, direction)` change the cursor without drawing. `push()` saves the cursor; `pop()` restores it. An empty stack leaves the cursor unchanged.

An `Element` uses a catalog symbol. Its options include `at`, `rotation`, `scale`, `reverse`, `flip`, `anchor`, `drop`, and `labels`. `anchor` aligns a named local anchor with `at`.

Named anchors include the catalog terminals, the pane `center`, and `anchor` where the catalog defines one. Placed elements also expose `xy`, the transformed local origin.

`reverse` reflects horizontally about the local center; `flip` reflects about the local X axis. Anchor alignment is applied with those reflections. Scale accepts one number or an X/Y pair.

Artwork and anchors use the same transform. A symbol keeps its fixed catalog geometry; the core does not extend its leads.

Without `drop`, a catalog element leaves the cursor unchanged. A named or local-point `drop` moves it to that transformed anchor or point and adopts the element direction. As in Schemdraw, an explicit zero rotation with a point drop preserves the prior direction.

`Line(length, options)` defaults to length three and drops at `end`; its other anchors are `start` and `center`.

`Wire` takes `at` (or the cursor), `to`, and one of three shapes: `-`, `-|`, or `|-`. Its points are absolute drawing coordinates. Endpoints remain exact.

Orthogonal wires update direction to their final leg; a straight wire keeps the prior direction. A wire exposes `start`, `end`, and `mid` anchors; for an orthogonal wire, `mid` is the midpoint of its final leg. Zero-length final legs retain Schemdraw's fallback direction: up for `-|`, left for `|-`.

`Dot(radius, options)` draws a filled circle and moves the cursor to its position. Its default radius is 0.075. It keeps the prior direction unless given an explicit nonzero rotation or named drop.

Choose line lengths and dot radii to suit the catalog's 120-unit panes.

Labels require text and a named anchor or point, with an optional offset. Their positions follow the element transform; text stays upright. Wire label points and offsets use drawing coordinates.

Bounds include transformed geometry and label anchor points, but exclude stroke widths and text glyph extents. The core does not measure fonts or prevent overlaps. SVG overflow remains visible; callers can increase the margin for labels and thick strokes.

After building, run this example from the package directory with Node's module input mode. The drawing core is internal; it has no package-root export.

```sh
node --input-type=module <<'JS'
import { Drawing, Element, Wire, Dot } from './dist/drawing/core.js';

const drawing = new Drawing();
const first = drawing.add(new Element('resistor', {
  at: [-120, -60],
  labels: [{ text: 'R1', at: 'center', offset: [0, -30] }],
}));
const second = drawing.add(new Element('resistor', {
  at: [120, 0],
  labels: [{ text: 'R2', at: 'center', offset: [0, -30] }],
}));
const wire = drawing.add(new Wire({
  at: first.anchors.B, to: second.anchors.A, shape: '-|',
}));
drawing.add(new Dot(3, { at: wire.anchors.mid }));
console.log(drawing.toSVG(12));
JS
```

This draws two registered symbols, one wire, a dot, and labels. It tests drawing mechanics; it neither creates nor validates electrical connectivity. The port excludes other wire shapes, arrow options, automatic junctions, IC construction, and Schemdraw's other backends and full fluent API.

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

Unit tests cover detection, lazy loading, parser and definition interfaces, all 16 notation types, mode eligibility, structural membership, normalized connections, NAND2 topology, invalid input, and database reset and isolation. Browser tests use Vite and Playwright Chromium to register the compiled package with real Mermaid, inspect valid empty SVG output, reject unsupported notation, and render again after failure. See the [root README](../../README.md) for `.venv/` runtime activation and CI commands.
