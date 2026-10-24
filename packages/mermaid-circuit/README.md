# mermaid-circuit

An external Mermaid circuit renderer with identifier `circuitDiagram`. The package is private and has not been published.

## Implemented behavior

The parser accepts `circuitDiagram D` and `circuitDiagram A`, followed by declarations and connections from the closed 18-type vocabulary in [the notation specification](spec/notation.md).

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

Blank lines and Mermaid `%%` comments are accepted. The parser validates mode eligibility, declaration brackets, object identity, device terminals, symmetric connections, and typed stage/block membership. Optional device parameters remain uninterpreted label content.

Catalog-only shapes and dynamic ICs are not authorable. The full 103-shape catalog is not an authorable device vocabulary.

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

The public default export conforms to Mermaid's `ExternalDiagramDefinition`. Its detector checks the complete declaration token and its asynchronous loader imports the implementation only when requested.

Each parse clears the database before validation and stores a complete model only on success. A failed parse leaves no accepted model, and independent databases remain isolated.

The registered renderer consumes the accepted model, runs placement and routing, and draws into Mermaid's SVG context. Output includes catalog symbols, wires, junctions, crossing gaps, labels, and stage and block frames. Its viewBox encloses the rendered content.

The JSON shape catalog supplies mode eligibility and fixed terminal names. It is included with the compiled package; no Python or parser-generator runtime is required. The renderer supplies its drawing styles directly on SVG elements.

## Drawing foundation

The TypeScript modules in `src/drawing/` provide point transforms, bounds, and SVG primitives. The transform follows Schemdraw’s operation order. Primitive presentation draws on its concepts; the SVG serializer, automatic placement, routing, and Mermaid rendering are independent implementations.

Source links, credit, and the upstream notice appear in [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md). The package uses the [MIT license](LICENSE).

Transforms apply a local offset, scale and optional reflection, rotation, then global translation. SVG coordinates increase rightward and downward, so positive angles rotate clockwise. The same matrix transforms terminal points, anchors, bounds, and symbol artwork.

Horizontal reflection reverses local X; vertical reflection reverses local Y. Reflection preserves terminal names and their net assignments, and leaves the source SVG unchanged.

The SVG serializer emits line, polyline, path, circle, and text elements with escaped values. It preserves supplied coordinates and element order. It produces fragments for an SVG parent, not a separate document.

`node scripts/build-shape-assets.mjs` reads the catalog and copies each registered SVG into an ignored TypeScript module. Both build and unit-test commands run this step. The compiled module ships under `dist/generated/`, so symbol lookup needs no file or network access at runtime.

The 103 source SVGs retain their artwork and license notices. `shapes/shapes.json` remains the authority for dimensions, terminals, anchors, and mode metadata. The nine IC templates remain outside the bundle.

`resolveSymbol` returns SVG content, pane dimensions, transformed attachment points, and the matching SVG matrix. `resolveTerminal` checks a named terminal. Catalog lookup does not make a shape authorable in circuit notation.

The generated module is derived data; it must not be edited or committed. The renderer embeds these assets with their layout transforms and namespaces internal IDs for each symbol instance.

## Circuit placement

`src/drawing/layout.ts` places devices and records peripheral preferences from a validated model. Its result holds positions, transforms, named anchors, and bounds for stages, blocks, and the whole drawing. The model remains unchanged; the module adds no public package export.

Omitting a stage direction selects `auto`, including in the implicit final stage. Explicit `direction LR` and `direction TB` remain available. The [placement rules](spec/style.md#placement-and-rotation) govern arrangement, orientation, and peripheral ordering.

The engine recognizes simple conduction-series chains joined by generic nets with two terminal connections, excluding shared gate inputs.

Parallel groups span the same two conduction nets. The NAND2 fixture places its PMOS pull-up group across the stage and its NMOS pull-down chain vertically.

Eligible devices rotate by multiples of 90 degrees to align terminals, using one transform for artwork and named attachments. Automatic CMOS placement keeps the catalog orientation; explicit directions can rotate it. Final pin positions follow device geometry. Parallel CMOS groups retain their stagger; input alignment does not force other LR groups into descending rows.

Digital LR stages use dependency columns. Four alternating barycenter sweeps evaluate row ordering from topology and transformed terminal geometry, retaining declaration order on ties.

Digital gates evaluate supported right-angle rotations and vertical reflection using driver-to-input geometry, terminal escape directions, estimated bends, crossings and Manhattan length. Default orientation resolves ties. This deterministic search changes one gate at a time and does not guarantee a global optimum.

Placement does not call the router or require a feasible route. The renderer routes the selected geometry once; a routing conflict rejects the render without changing the electrical model. Geometric estimates are not measurements of final wires.

Horizontal reflection is available in the transform layer but is not selected automatically. Automatic reflection does not apply to CMOS transistors.

Cycles, branched conduction networks, disconnected devices, and logic signal paths use declaration order where no supported topology rule applies, subject to the CMOS placement convention. Mixed chains also fall back when neither traversal keeps every PMOS above every NMOS. The result identifies stages using the fallback arrangement.

Recognized groups remain separate; this release does not optimize a combined series-parallel network as a whole. The initial layout records input-alignment preferences; routing may select different pin geometry.

`pinInOut` remains unplaced because its side is undecided. Cross-block named nets use repeated boundary pins under the [sectional drawing rules](spec/style.md#sectional-net-presentation). Other explicitly named nets may also acquire repeated graphical occurrences when local sharing fails.

Voltage sources retain their stage identity in the top region; stage bounds enclose internal devices. Empty stages retain space, and blocks without stages have no bounds.

## Routing and SVG output

`src/drawing/routing.ts` connects each model net at its exact transformed attachment points. It retains net identities, terminal attachments, orthogonal segments, junctions, and independent crossings.

Sectional routes also record separate physical components and their named endpoints. Centering offsets are preserved, including 15-unit translations.

Intermediate routing tracks use a 10-unit grid. Exact transformed attachments remain authoritative: a terminal at 255 stays at 255. Short local orthogonal segments join off-grid attachments to usable grid tracks.

Routes avoid symbol panes. Ordinary wires and common CMOS rails retain frame clearance; pin branches may split inside or outside stages. Junction dots mark shared-net branches; white gaps distinguish independent crossings on the white drawing background.

The renderer embeds the approved artwork and draws routes from that same routing result. Device parameters split at `<br/>` into additional text lines. Labels use SVG text nodes, and generated implicit-net identifiers remain invisible.

`pinInOut` placement and dynamic ICs are unsupported. A routing failure rejects the render with the affected net and attachment when available. It never returns a successful circuit with an omitted connection.

Routing uses a finite search area around the placed circuit and does not globally optimize the drawing. Dense or obstructed diagrams can fail even when a different routing strategy might succeed.

Pin placement uses a logical 120 × 120 tile without snapping devices to a tile lattice. An existing occurrence may serve a device within 600 horizontal and 480 vertical units, measured between footprint centers. Orthogonally aligned pins require one empty tile between their footprint and a device; diagonal adjacency requires vacant horizontal and vertical neighboring spaces.

For each branch, complexity is its right-angle bends plus unrelated-net crossings. Sharing an existing pin requires a combined maximum of three, with at most two bends and two crossings. Ordinary and new local routes prefer three and may extend to five. Search rejects candidates beyond the budget during traversal. Later routes must not invalidate earlier branch budgets.

Repeated pins reference the same electrical net ID. They provide a conceptual Z-axis connection without drawing a planar wire between occurrences. They are not three-dimensional wires or new electrical terminals. Equal display labels do not join different net IDs. Unnamed implicit nets remain continuously wired.

Input and output flags may rotate by any right angle. Their labels stay upright inside the artwork, and their anchors receive the same transform. The renderer uses the final pins and routes returned together by routing, rather than adding symbols independently. See the [drawing contract](spec/style.md#graphical-pin-placement) for the governing rules.

Cross-section implicit nets require an explicit net declaration to provide a boundary label. The existing placement fallback remains available when its connections can be routed faithfully.

## Layout-engine evaluation

R4-R1 reproduced the ELK.js 0.12.0 and Dagre 3.1.1 comparison on the four-NAND XOR, transistor XOR, CMOS inverter, NAND2, and NOR3 models. Both candidates produced identical graph coordinates across three repeated runs. The [PR #13 evaluation report](https://github.com/iamthenop/infurnet-mermaid/pull/13) supplies measured results, executable adapters, commands, and integration gaps.

ELK's evaluation used fixed terminal ports and orthogonal routes; Dagre's endpoints lay on node boundaries and required adaptation. Both represented stage and block membership. Preserving the package's CMOS and sectional drawing conventions requires additional integration work.

The report separates graph-only coordinates, adapter output rendered through Mermaid, and normal production plugin output. Reproduced adapter examples include an ELK XOR using native routes and Dagre placements using the current router. Temporary adapter output is not a production fixture, and its failures do not establish engine limitations.

Graph bounds and edge metrics are not interchangeable with measurements of a complete schematic. The native ELK adapter does not yet enforce all grid, centering, or frame-clearance rules. Neither candidate has been integrated with every approved CMOS and sectional drawing convention.

No external layout library has been adopted or added to the package dependencies. Engine selection remains with the repository owner after visual review of the candidates. The independent reflection, layered-ordering, and grid-routing changes use the existing engine.

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

Mermaid remains a peer dependency; the library does not bundle a second copy. Integration is tested against 12.2.0 with Mermaid's default strict security mode.

Sandbox iframe rendering is not supported by this package. Hosts such as GitHub Markdown and Mermaid Live Editor do not support the custom type unless they load and register this package.

## Browser example and tests

From the repository root:

```sh
npm run dev --workspace mermaid-circuit
```

Open the local URL printed by Vite. The page registers the compiled package, loads `examples/basic.mmd`, and displays the returned SVG with a completion status. The fixture renders a connected digital inverter through `mermaid.render()`.

```sh
npm run typecheck --workspace mermaid-circuit
npm run build --workspace mermaid-circuit
npm test --workspace mermaid-circuit
npx playwright install chromium
npm run test:browser --workspace mermaid-circuit
```

Unit tests cover detection, lazy loading, parser and definition interfaces, all 17 notation types, mode eligibility, structural membership, normalized connections, NAND2 topology, invalid input, and database reset and isolation. Routing tests verify terminal reachability, distinct nets, junctions, crossings, and exact attachment coordinates.

Browser tests register the compiled package with real Mermaid and compare rendered artwork, transforms, routes, labels, and frames. They also verify reproducible fixtures, unsupported-input errors, safe text, and recovery after failure. See the [root README](../../README.md) for `.venv/` runtime activation and CI commands.

## Generated review fixtures

The ten `.mmd` sources and matching `.svg` outputs live in [`examples/fixtures/`](examples/fixtures/). They cover a single device, series, parallel, shared input, CMOS inverter, explicit LR rotation, NAND2, three-input CMOS NOR, two-input CMOS XOR, and four-NAND digital XOR. Open the SVG files directly in a browser to inspect them.

The [four-NAND XOR source](examples/fixtures/xor-nand4.mmd) uses the digital `nand` device and three distinct intermediate nets. Its [generated SVG](examples/fixtures/xor-nand4.svg) demonstrates gate-level logic alongside the transistor-level `xor2` example.

Digital LR placement follows logic dependencies: N1 occupies the first column, N2 sits above N3 in the second, and N4 occupies the third. The outer gates align with the middle pair's vertical midpoint.

The transistor-level XOR fixture has twelve transistors and thirty-six terminal assignments. Its output is high when exactly one input is high.

The `inputInverters` block sits left of `xorCore`, with their vertical midpoints aligned. Each section shows local VDD and VSS rails.

A and B appear as inputs in both sections. Only ¬A and ¬B leave the inverters through output-facing boundary pins, retaining the net identifiers Abar and Bbar.

The two NMOS series branches sit side by side in the core. Local A, B, ¬A, and ¬B input pins beside these branches replace the long signal buses.

All repeated pins and rails retain their original net identifiers. The `.mmd` source remains one electrical circuit using the existing notation.

The fixture is generated by this plugin’s TypeScript placement and routing. The separately positioned Schemdraw comparison used manual coordinates and named signal stubs; it was not automatic plugin output.

Regeneration requires Node.js 24.22.1, this workspace's installed npm dependencies, and Playwright's installed Chromium. Use the repository's existing `.venv` runtime and browser cache. From the repository root:

```sh
export PATH="$PWD/.venv/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.venv/browsers"
npm run render:fixtures --workspace mermaid-circuit
```

With those environment variables set, the equivalent command from `packages/mermaid-circuit/` is:

```sh
npm run render:fixtures
```

The command builds the package and starts the existing Vite browser host. Chromium invokes that host's registered plugin through `mermaid.render()` for each source. Only the returned SVG is written, using stable fixture IDs.

Generation fails on any parse, layout, routing, rendering, or empty-output error. All ten renders must succeed before outputs are written. Browser tests compare the tracked SVGs with fresh plugin output and a repeated render.

These SVGs come from the plugin. Reference illustrations show intended appearance; they cannot prove that the plugin works. The owner decides whether the drawings meet the approved design.
