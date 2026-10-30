# mermaid-circuit

An external Mermaid circuit renderer with identifier `circuitDiagram`. Version `0.1.0` is a release candidate; it has not been published to npm. The package is prepared for tarball installation, while the repository-root workspace remains private.

## Implemented behavior

The parser accepts `circuitDiagram D` and `circuitDiagram A`, followed by declarations and connections from the closed 80-type vocabulary in [the notation specification](spec/notation.md).

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

The full 110-shape catalog is not an authorable device vocabulary. The digital vocabulary includes `and`, `or`, `nor`, `xor`, `xnor`, `notNot`, `schmitt`, `schmittNot`, `schmittAnd`, and `schmittNand`, alongside `nand`, `inverter`, and `buffer`. Their terminals and mode restrictions are defined in [the notation specification](spec/notation.md#object-types).

The resistor and fuse variants include `resistorIEC`, `resistorVar`, `resistorVarIEC`, `thermistor`, `photoresistor`, `photoresistorIEC`, `fuseIEC`, and `fuseUs`. See [the notation specification](spec/notation.md#object-types) for their terminal contracts and mode restrictions.

Mode `A` also accepts `antenna` and dynamic `ic` devices using the [IC pin notation](spec/notation.md#integrated-circuit-pins). Multiple pins may share a side.

Mode `A` accepts `motor` and `solenoid`. Both use terminals `A` and `B`:

```text
circuitDiagram A
M1["M1"]:::motor
S1["S1"]:::solenoid
M1 |B| --- |A| S1
```

The motor is a circle with `M` inside. The solenoid is a circle with a straight arrow through its center. This arrow shows motion; it adds no electrical rule.

The capacitor and load additions are `capacitor2`, `capacitorPolar`, `capacitor2Polar`, `capacitorVar`, `capacitorTrim`, `lamp`, `lamp2`, `breaker`, and `diac`. See [the notation specification](spec/notation.md#object-types) for their terminal contracts and mode restrictions.

The `opamp` symbol remains available only through the standalone drawing core. The `antenna` device is authorable in mode `A`.

Use `diode` for an ordinary rectifier diode. The authorable variants are `diodeFilled`, `schottky`, `diodeTunnel`, `diodeShockley`, `zener`, `diodeTVS`, `varactor`, `led`, `led2`, and `photodiode`. Their terminal contracts and mode restrictions are defined in [the notation specification](spec/notation.md#object-types).

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

MOSFET variants now include diode and circle artwork, analog N/P-channel symbols, biased FETs, and alternate orientations. Their terminal contracts, bulk relationships, and endpoint inference follow [the notation specification](spec/notation.md#bulk-semantics).

The normalized model remains a connectivity model, not an electrical simulator.

The parsed model records devices, nets, normalized terminal-to-net connections, ordered stages, blocks, and the declared mode. Three-terminal MOSFETs record their implicit bulk-to-source relationship; four-terminal variants expose B. Stage membership creates no electrical connections.

The public default export conforms to Mermaid's `ExternalDiagramDefinition`. Its detector checks the complete declaration token and its asynchronous loader imports the implementation only when requested. Each parse clears the database before validation and stores a complete model only on success. A failed parse leaves no accepted model, and independent databases remain isolated.

The registered renderer places devices from the accepted model, routes orthogonal wires, and draws catalog artwork through the TypeScript drawing core. It preserves terminal and net identities, adds junction dots at shared-net branches, and shows stage and block frames. The [drawing specification](spec/style.md#basic-automatic-drawing) defines the supported placement and routing rules.

Routing supports straight wires and the two one-bend forms. Named-net copies follow the [proxy policy](spec/style.md#basic-automatic-drawing); generic internal nets have no proxy symbols. An unsupported route fails explicitly instead of dropping a connection.

The floorplanner recognizes supported series and parallel groups from their conduction terminals. Digital gates follow dependency levels, so the four-NAND XOR occupies three columns.

This is a basic renderer, with no global layout search. IC bodies grow to fit their named pins.

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

The manual API excludes other wire shapes, arrow options, and Schemdraw's other backends and full fluent API. Automatic junction detection and dynamic IC bodies belong to the circuit renderer.

## Distribution candidate

The tested runtime is Node.js 24.22.1 with its bundled npm. Other Node.js versions have not been verified. Mermaid 12.2.0 remains a peer dependency.

From a repository checkout, build and inspect the package:

```sh
npm ci
npm run build --workspace mermaid-circuit
npm pack --dry-run --json --workspace mermaid-circuit
npm pack --workspace mermaid-circuit
tar -tzf mermaid-circuit-0.1.0.tgz
```

The tarball contains compiled ESM, TypeScript declarations, the shape catalog, bundled symbol artwork, this README, the MIT license, and acknowledgements. The 110 registered symbols are bundled in JavaScript; runtime rendering does not read source SVG files. The nine unregistered IC templates are excluded.

Run the isolated consumer check from the checkout:

```sh
npx playwright install chromium
npm run verify:distribution --workspace mermaid-circuit
```

The check builds and packs the package, audits the actual archive, and installs it into a temporary app outside the repository. It compiles a TypeScript consumer, checks all 110 symbols, and renders all five reference circuits in all three appearances. It checks geometry, connectivity, and colours against the saved SVGs, with network requests blocked during rendering.

Imports must resolve inside the isolated app. The check uses Node.js and existing JavaScript tooling; no Python runtime is needed. It removes its temporary app and tarball on success or failure.

To retain the exact tarball that passed verification, supply an output path outside the repository:

```sh
npm run verify:distribution --workspace mermaid-circuit -- --tarball-output /absolute/output/mermaid-circuit-0.1.0.tgz
```

The output directory must already exist. The verifier prints the tarball's filename, byte size, SHA-256 digest, content inventory, and each circuit/theme result. Delete locally generated tarballs after use; do not commit them.

In an independent ESM app, install that verified tarball alongside Mermaid:

```sh
npm install /absolute/output/mermaid-circuit-0.1.0.tgz mermaid@12.2.0
```

Use the [host registration example](#local-consumption) below. The public ESM entry point, declaration files, and export map are unchanged.

The [package workflow](../../.github/workflows/package-verify.yml) runs on relevant pull requests and supports manual execution. It retains a verified tarball as a GitHub Actions artifact. It does not publish, tag, or create a release; a passing run establishes a validated release candidate only for the checked commit.

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

### Circuit colours

Select circuit colours through [Mermaid's theme configuration](https://mermaid.js.org/config/theming.html). The exact palettes and class mappings are defined in [Drawing style](spec/style.md#colour-appearances). Colour selection leaves the drawing's geometry, connections, and fonts unchanged.

For standard black on white:

```ts
mermaid.initialize({ startOnLoad: false, theme: 'default' });
```

For the inverse appearance:

```ts
mermaid.initialize({ startOnLoad: false, theme: 'dark' });
```

For the KiCad-inspired coloured appearance:

```ts
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    background: '#FFFFFF',
    lineColor: '#009600',
    primaryBorderColor: '#840000',
    primaryTextColor: '#006464',
    textColor: '#0F0F0F',
  },
});
```

The circuit names `default-inverse` and `colored` are not built-in Mermaid theme names. Use `dark` or `base` as shown above. No circuit notation or configuration key is added.

Diagram frontmatter can override the host setting using the same configuration fields:

```text
---
config:
  theme: dark
---
circuitDiagram A
R["R"]:::resistor
```

Exported SVGs carry their background and scoped styles. They retain their colours outside the host page, including when different circuit themes share one page.

### Run the browser example

From the repository root:

```sh
npm run dev --workspace mermaid-circuit
```

Open the local URL printed by Vite. The page registers the compiled package, loads `examples/basic.mmd`, and displays the returned SVG with a completion status. The fixture renders a connected CMOS inverter.

Use the circuit and appearance selectors to inspect all ten fixtures in all three palettes. A preview can also be selected with `?fixture=cmos-nand2&appearance=colored` on that local URL.

```sh
npm run typecheck --workspace mermaid-circuit
npm run build --workspace mermaid-circuit
npm test --workspace mermaid-circuit
npx playwright install chromium
npm run test:browser --workspace mermaid-circuit
```

Unit tests cover the 80 notation types, device connections, hierarchy, parser failures, and database isolation. They also check placement, routing limits, and the NAND and XOR truth tables.

Browser tests register the compiled package with real Mermaid in Chromium. They check all eleven drawings, their symbol transforms and wire endpoints, failed input, and recovery after failure. See the [root README](../../README.md) for `.venv/` runtime activation and CI commands.

## Generated circuit examples

See [Remote Control Trap](examples/remote-control-trap.md) for a complete Markdown example with an embedded schematic, Mermaid source code, and links to other themes.

Each SVG is produced by the registered Mermaid plugin from its source fixture. The generator prints device, terminal, occurrence, proxy, bend, and crossing counts, plus placement and routing times. Proxy counts include only copies after a net’s first occurrence.

| Circuit | Source | Default | Inverse | Coloured |
| --- | --- | --- | --- | --- |
| Wireless solenoid controller | [Mermaid](examples/fixtures/wireless-solenoid.mmd) | [SVG](examples/fixtures/wireless-solenoid.svg) | [SVG](examples/fixtures/wireless-solenoid-inverse.svg) | [SVG](examples/fixtures/wireless-solenoid-colored.svg) |
| CMOS inverter | [Mermaid](examples/fixtures/cmos-inverter.mmd) | [SVG](examples/fixtures/cmos-inverter.svg) | [SVG](examples/fixtures/cmos-inverter-inverse.svg) | [SVG](examples/fixtures/cmos-inverter-colored.svg) |
| CMOS NAND2 | [Mermaid](examples/fixtures/cmos-nand2.mmd) | [SVG](examples/fixtures/cmos-nand2.svg) | [SVG](examples/fixtures/cmos-nand2-inverse.svg) | [SVG](examples/fixtures/cmos-nand2-colored.svg) |
| CMOS XOR, twelve transistors | [Mermaid](examples/fixtures/cmos-xor12.mmd) | [SVG](examples/fixtures/cmos-xor12.svg) | [SVG](examples/fixtures/cmos-xor12-inverse.svg) | [SVG](examples/fixtures/cmos-xor12-colored.svg) |
| XOR, four NAND gates | [Mermaid](examples/fixtures/xor-nand4.mmd) | [SVG](examples/fixtures/xor-nand4.svg) | [SVG](examples/fixtures/xor-nand4-inverse.svg) | [SVG](examples/fixtures/xor-nand4-colored.svg) |
| Logic variants | [Mermaid](examples/fixtures/logic-variants.mmd) | [SVG](examples/fixtures/logic-variants.svg) | [SVG](examples/fixtures/logic-variants-inverse.svg) | [SVG](examples/fixtures/logic-variants-colored.svg) |
| Schmitt variants | [Mermaid](examples/fixtures/schmitt-variants.mmd) | [SVG](examples/fixtures/schmitt-variants.svg) | [SVG](examples/fixtures/schmitt-variants-inverse.svg) | [SVG](examples/fixtures/schmitt-variants-colored.svg) |
| Resistor and fuse variants | [Mermaid](examples/fixtures/resistor-fuse-variants.mmd) | [SVG](examples/fixtures/resistor-fuse-variants.svg) | [SVG](examples/fixtures/resistor-fuse-variants-inverse.svg) | [SVG](examples/fixtures/resistor-fuse-variants-colored.svg) |
| Capacitor and load variants | [Mermaid](examples/fixtures/capacitor-load-variants.mmd) | [SVG](examples/fixtures/capacitor-load-variants.svg) | [SVG](examples/fixtures/capacitor-load-variants-inverse.svg) | [SVG](examples/fixtures/capacitor-load-variants-colored.svg) |
| Diode variants | [Mermaid](examples/fixtures/diode-variants.mmd) | [SVG](examples/fixtures/diode-variants.svg) | [SVG](examples/fixtures/diode-variants-inverse.svg) | [SVG](examples/fixtures/diode-variants-colored.svg) |
| MOSFET variants | [Mermaid](examples/fixtures/mosfet-variants.mmd) | [SVG](examples/fixtures/mosfet-variants.svg) | [SVG](examples/fixtures/mosfet-variants-inverse.svg) | [SVG](examples/fixtures/mosfet-variants-colored.svg) |

The capacitor and load fixture tests schematic rendering with series and parallel connections. It does not establish that the arrangement is a validated physical circuit.

Generate the three MOSFET SVGs and verify the thirty existing references without rewriting them:

```sh
npm run render:fixtures --workspace mermaid-circuit
```

The controller preserves the supplied `ctl` terminal and explicit DC connections to the voltage source. Its `ctl` and `no` pins represent the relay interface without invented internal contacts.

Its IC uses the pin-dependent geometry in [IC presentation](spec/style.md#integrated-circuit-presentation). The drawing does not verify physical module labels or battery, fuse, and wiring selection.

## Designer follow-up: recommended circuit size

A recommended terminal-count limit has not been measured. A later layout evaluation should identify when clarity or render time starts to degrade, using both analog and digital circuits. The designer can then add a size recommendation based on those results; no maximum is claimed in this release.
