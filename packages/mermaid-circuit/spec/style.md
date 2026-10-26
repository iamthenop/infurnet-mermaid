# Drawing style

This specification governs how a renderer draws `circuitDiagram`. Circuit syntax, device types, terminal names, and electrical semantics are defined in [Notation for circuit diagrams](notation.md).

The basic renderer implements the placement and routing subset described here. The CMOS conventions are not a general layout policy for every electrical circuit.

## Orientation

1. The supply rail appears at the top and ground at the bottom.
2. PMOS devices sit above NMOS devices in the same stage.
3. Signals flow from left to right.
4. Inputs appear on the left and outputs on the right.
5. Stage frames follow the [stage presentation](#stage-presentation) convention.
6. Signals stay outside stage frames except for branches crossing the borders to reach device terminals.
7. Input signals split at junctions outside stage frames.
8. The first gate driven by an input is aligned horizontally with that input pin.
9. Analog devices with separate control terminals retain a vertical stagger for input access in a left-to-right row. Parallel two-terminal devices align their conduction endpoints. Digital stages use signal-dependency levels: gates at the same level share a column in LR, or a row in TB, in declaration order.
10. Additional gate connections branch from the corresponding input line using orthogonal routing.

The expression *supply rail* describes graphical placement, not an electrical object type. Stage ordering, membership, and direction declarations are defined in [the syntax rules](notation.md#syntax-rules).

## Subgraph presentation

Structural membership and diagram-mode inheritance are defined in [Circuit structure](notation.md#circuit-structure).

### Stage presentation

Each stage is enclosed by a dashed frame labelled with its name. Stage placement remains governed by its declared direction, as defined in the [syntax rules](notation.md#syntax-rules).

### Block presentation

A block visually groups its contained stages. A block does not draw new electrical connections or alter existing wire topology.

Blocks use solid outlines around dashed stage frames; neither frame creates an electrical connection. Blocks default to side-by-side placement with aligned vertical midpoints. Component alignment for explicit DC connections may move frames with their contents.

## Symbols

Rules 1–7 describe the default CMOS MOSFET representations: `nmos`, `pmos`, `nmosBlk`, and `pmosBlk`. Other FET variants retain their own approved symbol geometry and terminal mappings in `shapes/shapes.json`.

1. A transistor gate appears on the left.
2. PMOS sources appear at the top.
3. NMOS sources appear at the bottom.
4. Three-terminal MOSFETs omit the bulk connection.
5. Four-terminal MOSFETs expose the bulk terminal.
6. A bubble at the gate marks PMOS.
7. NMOS has no gate bubble.
8. The default IEEE zigzag resistor is drawn horizontally. Source-symbol orientation follows the selected shape and its terminal coordinates in `shapes/shapes.json`. The existing `voltageSource` and `currentSource` symbols have vertical terminals; generic, waveform, controlled-source, and battery variants may use horizontal terminals.
9. A voltage source has its positive terminal at the top.
10. Symbols use black strokes with a nominal width of 2 units.
11. Terminals lie on established snap points.
12. Wires join terminal coordinates without unintended jogs.

Bulk connectivity is governed by [bulk semantics](notation.md#bulk-semantics), not by symbol positioning.

## Integrated circuit presentation

An IC body is a single device shape. Its displayed dimensions depend on its pin arrangement. Pin attachments are positioned along the selected body sides, and pin labels identify the corresponding named terminals. Pin identity and placement sides are defined in [Integrated circuit pins](notation.md#integrated-circuit-pins).

Internal IC circuitry is not rendered merely because an IC body is present.

The nine existing [IC templates](../shapes/ic-templates/) provide visual references. The templates do not establish pin ordering, package numbering, or electrical connectivity.

The supported four-pin IC has a fixed 120 × 120 rectangular body with one centered pin per side. Each lead is 30 units long, giving a 180 × 180 extent. This geometry applies only to the approved one-pin-per-side case.

General IC resizing and pin ordering remain outside this release.

## Routing and junction presentation

Wires use orthogonal routing. Junction markers are placed according to the [junction contract](notation.md#junctions), with input splits positioned outside stage frames as specified above. Routes and crossings must not redefine electrical connectivity.

## Labels

1. The instance name appears at the bottom right of a device.
2. The instance label matches the schematic instance name.
3. Parameters occupy a second line beneath the instance name when present.
4. A pin name is centered within its pin flag.
5. A supply net name appears above its graphical rail.
6. A ground-reference name appears below its ground bars.
7. Internal net names appear above their wires, near the left end.

### Terminal labels

A named-net connection label identifies the named terminal of its device endpoint.

The terminal label is drawn adjacent to the device attachment point, rather than at the midpoint of the connecting wire.

Terminal-label placement is independent of the written order of the net and device endpoints.

For an IC, the side qualifier selects the body side. The terminal label remains associated with the named IC pin.

A direct device connection carries two terminal names. Each name is drawn beside its corresponding device attachment.

The first terminal name belongs to the left textual endpoint. The second belongs to the right textual endpoint.

Reversing the written connection does not change its electrical relationship.

Implicit nets do not receive visible net-name labels.

Terminal labels do not define electrical connectivity. Their identities are governed by [Connection syntax](notation.md#connection-syntax).

## Panes and snap points

Standard shapes, including pin flags, occupy a 120 × 120 pane.

Snap points are defined at these fractions of a 120-unit span:

`0, 1/4, 1/3, 1/2, 2/3, 3/4, 1`

| Pane span | Snap positions |
| --- | --- |
| 120 units | 0, 30, 40, 60, 80, 90, 120 |
| 240 units | 0, 30, 40, 60, 80, 90, 120, 150, 160, 180, 200, 210, 240 |

External electrical terminals, symbol attachment anchors, and routed wire endpoints and bends use the approved snap positions.

Internal SVG symbol geometry follows the approved visual reference. Body contours, circles, arrows, polarity marks, zigzags, and other internal strokes are not required to fall on snap points. Internal geometry must remain within its assigned pane.

The distinction between symbol geometry and external attachment points does not change electrical connectivity.

## Terminal positioning conventions

| Family | Terminal locations |
| --- | --- |
| Two-terminal vertical shapes | Top center and bottom center |
| Default CMOS MOSFETs | Gate at left center; source and drain at x=90 on the upper and lower edges; optional bulk at right center |
| Other FET variants | Use the individual shape's named terminal coordinates in `shapes/shapes.json` |
| Logic gates | Input at left center; output at right center |

Exact per-symbol coordinates are recorded in `shapes/shapes.json`. This specification does not establish another coordinate registry.

## Shape references

SVG assets live in the [shape library](../shapes/).

`shapes/shapes.json` is the maintained authority for SVG filenames, pane dimensions, named terminal coordinates, and attachment anchors.

`shapes/index.ts` exposes the catalog to TypeScript consumers without maintaining a second coordinate inventory.

## Rendering reference

Schemdraw's [Basic Electrical Elements](https://schemdraw.readthedocs.io/en/stable/elements/electrical.html) catalog is the primary visual reference for electrical schematic symbols.

Applicable IEEE standards govern standardized terminology and symbols. `notation.md` governs electrical semantics. This specification governs approved drawing conventions. Schemdraw informs visual details not otherwise fixed by those authorities.

The standard resistor uses Schemdraw's IEEE-style zigzag representation with three peaks on each side. The IEC rectangular representation is not the default.

Schemdraw is a visual reference, not a Python runtime dependency. Symbols are implemented as SVG assets within the Mermaid plugin.

When a reference conflicts with an approved contract, record the discrepancy. Do not silently redefine the contract.

## Default symbols and variants

The unqualified `resistor`, `diode`, `capacitor`, `source`, and `ground` symbol keys select the conventional forms defined in the shape catalog.

The resistor default uses the IEEE zigzag. The diode default is an ordinary junction diode. The capacitor default is nonpolarized with straight plates. The source default is a plain source circle. The ground default is the three-bar ground symbol.

Alternative representations require explicit shape keys. Shape selection does not change electrical connectivity.

The shape catalog may contain symbols that the current circuit notation cannot yet express. Catalog availability does not imply parser, renderer, or electrical-model support.

## Basic automatic drawing

Layout objectives follow this priority order:

1. Electrical topology and net identity.
2. Source notation fidelity.
3. Proxy eligibility restrictions.
4. Recognizable circuit structure.
5. Parallel-branch representation.
6. Symmetry and component alignment.
7. Minimal bends and crossings.
8. Wire length.

Higher-priority constraints prevail when objectives conflict.

Placement and routing are separate operations. Placement uses terminal-to-net membership to detect series chains and parallel groups. Parallel membership requires both conduction nets; a single shared net is insufficient.

Series devices default to top-to-bottom placement, while parallel devices default to left-to-right placement. Explicit stage directions are retained. Declaration order breaks ties and places devices whose connections do not establish a supported arrangement.

Supply occurrences default above their group, ground below, input pins left, and output pins right. A net's first symbol is its original graphical occurrence; further copies are proxies. The counts reported by the renderer distinguish occurrences from proxies.

Proxy eligibility is evaluated on the original circuit graph, before adding graphical copies. Let I count the original `pinIn` nodes. Let D count all original nodes except `pinIn`, `supplyNet`, `ground`, and `pinOut`; this includes `pinInOut` and `voltageSource`.

A `pinOut` has one graphical occurrence and is never proxied. A `pinIn` may be proxied only when D ≥ 4 × I; reaching that threshold permits copies but does not require them. Supply, ground, and bidirectional-pin eligibility remains unchanged.

Repeated occurrences retain their source net identifier. No planar wire connects separate occurrences used as proxies. Generic internal nets have no graphical proxy type, and proxies must not obscure a parallel branch's shared endpoints.

An input occurrence serves at most three branches. If that limit requires a proxy forbidden by the threshold, routing fails explicitly. Junction dots mark actual branch points within a shared net; crossings of unrelated nets receive no dot.

Parallel branches visibly share both endpoint conductors, including branches in separate stages. Stages containing parallel chains of the same device type sit side by side within their block, while their device membership stays intact.

Common conductors for parallel groups remain straight. Their branch feed points use the midpoint between the outermost conduction terminals, so the split and rejoin centerlines agree. Terminal branches reach that conductor without bending the shared line.

Parallel two-terminal loads align below a connected controller output so their common input conductor meets that output horizontally. Shared IC pins use a common junction and continuous wires. Return branches share one conductor instead of adding a second return level.

Routing tries an orthogonal straight connection first, then horizontal-first and vertical-first one-bend connections. A straight wire may cross at most two unrelated wires, and a bent wire at most one. Overlapping unrelated wires, reverse turns, and traversal through symbol bodies are rejected.

Prefer moving components to introducing detours. Equivalent one-bend routes follow the terminal entry direction where feasible. Avoid unnecessary U-turns and doubling back; shorter wires must not displace clearer routing.

Supply and ground occurrences never rotate or reflect. Pins may rotate only with a connected device. Every symbol transformation also transforms its terminal attachments without changing their identities.

A lower NAND sharing its second input with an upper NAND supports vertical mirroring to align the shared-input branches. Symmetry extends to corresponding input pins, split junctions, and wire entry directions where feasible. Symmetry does not justify additional proxies.

Exact group centering may translate a whole symbol by a fractional grid offset, including 15 units. Symbol-local attachments remain authoritative; artwork and attachment points move together. Routing meets those exact transformed positions.

The router reports a failure if the permitted wire shapes and net occurrences cannot connect a net. It does not discard assignments or run a global layout search. The fixed spacing favors clear routes over a small bounding box.

Rendered connectivity is checked against the source model. Wire segments must connect every assigned terminal; only eligible named-net proxies may join separate drawn components by identity. A crossing between unrelated nets does not join those nets.

DC circuits retain explicit wires to source terminals when the source defines those connections. Rendering does not add supply rails, ground references, component labels, or internal relay contacts absent from the source.

A `voltageSource` defaults to the left of its local connected circuit, vertically centered against the other components' extents. Its outgoing conventional-current path runs clockwise when the source topology permits that arrangement. Placement preserves polarity and connectivity; it does not invent a return path.
