# mermaid-circuit

An external Mermaid circuit renderer with identifier `circuitDiagram`. The package is private and has not been published.

## Implemented behavior

The parser accepts `circuitDiagram D` and `circuitDiagram A`, followed by declarations and connections from the closed 21-type vocabulary in [the notation specification](spec/notation.md).

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

The full 110-shape catalog is not an authorable device vocabulary. The parser now admits `fuse` in mode `A` and `nand` in mode `D`. Mode `A` also accepts a limited `ic`: four named pins, one per side, using the [IC pin notation](spec/notation.md#integrated-circuit-pins).

Mode `A` accepts `motor` and `solenoid`. Both use terminals `A` and `B`:

```text
circuitDiagram A
M1["M1"]:::motor
S1["S1"]:::solenoid
M1 |B| --- |A| S1
```

The motor is a circle with `M` inside. The solenoid is a circle with a straight arrow through its center. This arrow shows motion; it adds no electrical rule.

The five new catalog-only shapes are `lamp`, `lamp2`, `breaker`, `antenna`, and `opamp`. They work with the standalone drawing core but cannot be declared in circuit notation.

Existing diode assets are unchanged. Use `diode` for an ordinary rectifier diode.

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

The registered renderer places devices from the accepted model, routes orthogonal wires, and draws catalog artwork through the TypeScript drawing core. It preserves terminal and net identities, adds junction dots at shared-net branches, and shows stage and block frames. The [drawing specification](spec/style.md#basic-automatic-drawing) defines the supported placement and routing rules.

Routing supports straight wires and the two one-bend forms. Named-net copies follow the [proxy policy](spec/style.md#basic-automatic-drawing); generic internal nets have no proxy symbols. An unsupported route fails explicitly instead of dropping a connection.

The floorplanner recognizes supported series and parallel groups from their conduction terminals. Digital gates follow dependency levels, so the four-NAND XOR occupies three columns. This is a basic renderer, with no global layout search or general IC sizing policy.

The JSON shape catalog supplies mode eligibility and fixed terminal names. It is included with the compiled package; no Python or parser-generator runtime is required.

## Drawing foundation

The TypeScript modules in `src/drawing/` provide a small, standalone drawing core adapted from Schemdraw. They support manual composition with `Drawing`, `Element`, `Line`, `Wire`, and `Dot`. The floorplanner and router now connect this core to the circuit model and Mermaid renderer.

Source links, credit, and the upstream notice appear in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md). The package uses the [MIT license](LICENSE).

Transforms apply a local offset, scale, rotation, then global translation. SVG coordinates increase rightward and downward, so positive angles rotate clockwise. The same matrix transforms terminal points and symbol artwork.

The SVG serializer emits line, polyline, path, circle, and text elements with escaped values, preserving coordinates and element order. `Drawing.toSVG(margin)` wraps these fragments and catalog symbols in a standalone SVG document. The default margin is four units.

`node scripts/build-shape-assets.mjs` reads the catalog and copies each registered SVG into an ignored TypeScript module. Both build and unit-test commands run this step. The compiled module ships under `dist/generated/`, so symbol lookup needs no file or network access at runtime.

The 110 source SVGs retain their artwork and license notices. `shapes/shapes.json` remains the authority for dimensions, terminals, anchors, and mode metadata. The nine IC templates remain outside the bundle.

`resolveSymbol` returns SVG content, pane dimensions, transformed attachment points, and the matching SVG matrix. `resolveTerminal` checks a named terminal. Catalog lookup does not make a shape authorable in circuit notation.

The generated module is derived data; it must not be edited or committed. The automatic renderer uses the same bundled artwork as manual drawings.

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

This draws two registered symbols, one wire, a dot, and labels. It tests drawing mechanics; it neither creates nor validates electrical connectivity.

The manual API excludes other wire shapes, arrow options, and Schemdraw's other backends and full fluent API. Automatic junction detection and the limited four-pin IC belong to the circuit renderer.

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

Open the local URL printed by Vite. The page registers the compiled package, loads `examples/basic.mmd`, and displays the returned SVG with a completion status. The fixture renders a connected CMOS inverter.

```sh
npm run typecheck --workspace mermaid-circuit
npm run build --workspace mermaid-circuit
npm test --workspace mermaid-circuit
npx playwright install chromium
npm run test:browser --workspace mermaid-circuit
```

Unit tests cover the 21 notation types, device connections, hierarchy, parser failures, and database isolation. They also check placement, routing limits, and the NAND and XOR truth tables.

Browser tests register the compiled package with real Mermaid in Chromium. They check all five drawings, their symbol transforms and wire endpoints, failed input, and recovery after failure. See the [root README](../../README.md) for `.venv/` runtime activation and CI commands.

## Generated circuit examples

Each SVG is produced by the registered Mermaid plugin from its source fixture. The generator prints device, terminal, occurrence, proxy, bend, and crossing counts, plus placement and routing times. Proxy counts include only copies after a net’s first occurrence.

| Circuit | Source | Generated SVG |
| --- | --- | --- |
| Wireless solenoid controller | [Mermaid](examples/fixtures/wireless-solenoid.mmd) | [Drawing](examples/fixtures/wireless-solenoid.svg) |
| CMOS inverter | [Mermaid](examples/fixtures/cmos-inverter.mmd) | [Drawing](examples/fixtures/cmos-inverter.svg) |
| CMOS NAND2 | [Mermaid](examples/fixtures/cmos-nand2.mmd) | [Drawing](examples/fixtures/cmos-nand2.svg) |
| CMOS XOR, twelve transistors | [Mermaid](examples/fixtures/cmos-xor12.mmd) | [Drawing](examples/fixtures/cmos-xor12.svg) |
| XOR, four NAND gates | [Mermaid](examples/fixtures/xor-nand4.mmd) | [Drawing](examples/fixtures/xor-nand4.svg) |

Regenerate all five with the existing Node and Chromium environment:

```sh
npm run render:fixtures --workspace mermaid-circuit
```

The controller preserves the supplied `ctl` terminal and explicit DC connections to the voltage source. Its `ctl` and `no` pins represent the relay interface without invented internal contacts.

Its IC uses the fixed geometry in [IC presentation](spec/style.md#integrated-circuit-presentation). The drawing does not verify physical module labels or battery, fuse, and wiring selection.
