# Drawing style

This specification governs how a renderer draws `circuitDiagram`. Circuit syntax, device types, terminal names, and electrical semantics are defined in [Notation for circuit diagrams](notation.md).

The basic renderer implements the placement and routing subset described here. The CMOS conventions are not a general layout policy for every electrical circuit.

## Orientation

1. The supply rail appears at the top and ground at the bottom.
2. PMOS devices sit above NMOS devices in the same stage.
3. Signals flow from left to right.
4. Inputs appear on the left and outputs on the right.
5. Stage frames follow the [stage presentation](#stage-presentation) convention.
6. Signals cross stage and block frames as required to reach their terminals.
7. Junction placement follows the nearest shared scope in [Routing and junction presentation](#routing-and-junction-presentation).
8. Analog devices with separate control terminals retain a vertical stagger for input access in a left-to-right row. Parallel two-terminal devices align their conduction endpoints. Digital stages use signal-dependency levels: gates at the same level share a column in LR, or a row in TB, in declaration order.
9. Gate connections branch from the corresponding input line using orthogonal routing.

The expression *supply rail* describes graphical placement, not an electrical object type. Stage ordering, membership, and direction declarations are defined in [the syntax rules](notation.md#syntax-rules).

## Subgraph presentation

Structural membership and diagram-mode inheritance are defined in [Circuit structure](notation.md#circuit-structure).

### Stage presentation

Each explicit stage is enclosed by a dashed frame labelled with its name. Stage placement remains governed by its declared direction, as defined in the [syntax rules](notation.md#syntax-rules).

### Block presentation

A block visually groups its contained stages and direct devices. A block does not draw new electrical connections or alter existing wire topology.

Blocks use solid outlines around dashed stage frames; neither frame creates an electrical connection. Blocks default to side-by-side placement with aligned vertical midpoints. Component alignment for explicit DC connections may move frames with their contents.

Block frames use 45 units of inner padding. The default horizontal gap between block placement groups is 300 units, before frame and label extents.

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
10. Symbols use the selected [colour appearance](#colour-appearances), with a nominal stroke width of 2 units.
11. Terminals lie on established snap points.
12. Wires join terminal coordinates without unintended jogs.

Bulk connectivity is governed by [bulk semantics](notation.md#bulk-semantics), not by symbol positioning.

## Colour appearances

Circuit colours follow graphical classes, not electrical roles. Theme selection changes only presentation: electrical connections, placement, routes, symbol transforms, labels, and bounds remain fixed. Fonts, stroke widths, and line styles retain their existing values.

| Graphical class | `default` | `default-inverse` | `colored` |
| --- | --- | --- | --- |
| Background | `#FFFFFF` | `#101215` | `#FFFFFF` |
| Wires and junction dots | `#000000` | `#F2F2F2` | `#009600` |
| Device strokes | `#000000` | `#F2F2F2` | `#840000` |
| Device and terminal labels | `#000000` | `#F2F2F2` | `#006464` |
| Net and frame labels | `#000000` | `#F2F2F2` | `#0F0F0F` |
| Stage and block frames | `#000000` | `#F2F2F2` | `#777777` |

The circuit appearance names map to Mermaid's supported configuration:

| Circuit appearance | Mermaid configuration |
| --- | --- |
| `default` | `theme: default` |
| `default-inverse` | `theme: dark` |
| `colored` | `theme: base` with the palette variables below |

For `colored`, set `background`, `lineColor`, `primaryBorderColor`, `primaryTextColor`, and `textColor` to the corresponding table values. Resolved variables control the background, wires and dots, device strokes, device/terminal labels, and net/frame labels, respectively. Frame strokes use the explicit frame colour above.

`default-inverse` and `colored` are circuit palette names, not Mermaid theme identifiers or circuit notation. Host configuration and diagram frontmatter use Mermaid's own precedence. The three mappings above are the supported circuit appearances; other Mermaid themes have no circuit palette.

The diagram styles contract supplies colours scoped to each circuit SVG. Exported SVGs include their styles and a background behind the drawing. Theme changes must not recolour other diagrams or retain colours from an earlier render.

Graphical pin, supply, and ground symbols use the device-stroke colour. Symbol interiors stay transparent where the artwork is transparent; filled marks use the device colour. Background knockout fills match the selected background, without altering the source artwork or adding body fills.

## Integrated circuit presentation

An IC body is a single device shape. Its displayed dimensions depend on its pin arrangement. Pin attachments are positioned along the selected body sides, and pin labels identify the corresponding named terminals. Pin identity and placement sides are defined in [Integrated circuit pins](notation.md#integrated-circuit-pins).

Internal IC circuitry is not rendered merely because an IC body is present.

The nine existing [IC templates](../shapes/ic-templates/) provide visual references. The templates do not establish pin ordering, package numbering, or electrical connectivity.

IC bodies have a minimum width and height of 120 units. Pins on each side are centered as a group, 60 units apart in their [notation order](notation.md#dynamic-ic-connection-example). Top and bottom pins run left to right; left and right pins run top to bottom.

For each dimension, the body span is `max(120, (n + 1) × 60)`, where `n` is the larger pin count on the two corresponding sides. Leads extend 30 units beyond the body. One pin per side retains the approved 120 × 120 body and 180 × 180 extent.

### MUX and DEMUX presentation

MUX and DEMUX use dynamic trapezoids with the fixed terminals and ordering defined in [the notation contract](notation.md#mux-and-demux). The MUX has a taller input edge and shorter output edge; the DEMUX reverses those edges. Neither shape has a select inversion bubble.

Reuse the IC pin spacing and outer extent calculation above. The taller body edge spans the calculated height minus the two 30-unit lead margins. Inset each end of the shorter edge by another 60 units.

Horizontal data leads join each vertical body edge to its outer attachment. Selects descend from the sloped outline to the bottom of the pane, centered 60 units apart.

In LR stages, data flows left to right and selects attach below. TB stages rotate the complete shape and its terminals through the existing 90-degree transform. Terminal labels use the dynamic IC alignment rules.

Digital dependency levels account for every data output. For stages containing these larger bodies, column spacing uses the largest pane width plus the existing 240-unit gap; row spacing uses the largest pane height plus 120 units.

## Routing and junction presentation

Wires use orthogonal routing. Junction markers follow the [junction contract](notation.md#junctions). A junction belongs to the nearest shared scope of the branches it joins: their stage, then their block, then the diagram.

Stage frames enclose their junctions with at least 30 units of clearance; block frames enclose shared block junctions within their inner padding. Routes and crossings must not redefine electrical connectivity.

## Local op-amp feedback

The [notation contract](notation.md#local-op-amp-negative-feedback) defines recognized direct and passive returns. Only the local route from one op-amp's output back to its own inverting input may double back around the body. Ordinary input, output, supply, and unrelated routes retain their existing constraints.

A recognized return uses orthogonal segments with the existing 60-unit outward approach at both op-amp terminals. It avoids device bodies and terminal labels. Where multiple ordinary segments form the return, their shared net identity and assembled connectivity must be validated.

Place the return resistor or capacitor above the op-amp on the returning path. Place the divider's ground resistor on its separate ground leg. Adjust only recognized feedback components; unrelated devices retain their placement, and an obstructed local arrangement must fail rather than move them.

Keep the op-amp's normal orientation and the external output proceeding rightward. Branch the return near the output, after its terminal approach. Prefer a clear return with fewer bends; this exception does not permit unrestricted multi-bend routing.

Draw a junction dot at a genuine three-way output or divider branch. Two-way return bends and unrelated wire crossings receive no dot. Supply wires receive no feedback U-turn exemption.

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

Terminal labels anchor to the transformed snap point on the symbol pane, with a four-unit gap from the wire. Standard 120 × 120 symbols use these alignments:

| Terminal side | Label position | Text alignment |
| --- | --- | --- |
| Left | Above and left of the snap | Bottom right |
| Right | Above and right of the snap | Bottom left |
| Top | Above and right of the snap | Bottom left |
| Bottom | Below and right of the snap | Top left |

Custom IC left and right labels use the same side alignments. Top and bottom IC labels rotate 90° counterclockwise, with their relative top edge beside the snap. Top labels use their top-left anchor; bottom labels use their top-right anchor.

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

The same counts also apply within each block. Count its original devices and each distinct connected net once, using the same exclusions. A block's first input occurrence can serve its local branches; extra copies require both the diagram and that block to satisfy D ≥ 4 × I.

A `pinOut` has one graphical occurrence and is never proxied. A `pinIn` may be proxied only when D ≥ 4 × I; reaching that threshold permits copies but does not require them. Supply, ground, and bidirectional-pin eligibility remains unchanged.

Repeated occurrences retain their source net identifier. No planar wire connects separate occurrences used as proxies. Generic internal nets have no graphical proxy type, and proxies must not obscure a parallel branch's shared endpoints.

An input occurrence serves at most three branches. If that limit requires a proxy forbidden by the threshold, routing fails explicitly. Junction dots mark actual branch points within a shared net; crossings of unrelated nets receive no dot.

Every junction is T-shaped: three orthogonal arms with one pair extending in opposite directions. Four-way connected junctions are rejected. Crossings between unrelated nets remain unconnected crossings.

Parallel branches visibly share both endpoint conductors, including branches in separate stages. Stages containing parallel chains of the same device type sit side by side within their block, while their device membership stays intact.

Common conductors for parallel groups remain straight. Their branch feed points use the midpoint between the outermost conduction terminals, so the split and rejoin centerlines agree. Terminal branches reach that conductor without bending the shared line.

At parallel splits and joins, the two branch arms extend in opposite directions (180°) from their midpoint. The feed or return stem meets that midpoint perpendicularly. A stem must not overlap a branch arm and move the visible junction away from the center.

Feeds into parallel branches default to entering from above, with the two branch arms extending left and right. The same rule applies to shared IC pin branches. Return joins and other junctions may rotate the T while retaining three arms.

Aligned two-terminal devices use equal wire lengths between the split, their terminals, and the join.

Parallel two-terminal loads sit below a connected controller output to allow a centered feed stem. Parallel joins reach the return conductor through a centered stem. These stems take precedence over reducing the bend count.

Every connected device terminal has a straight outward wire approach of at least 60 units beyond its snap point. The symbol geometry and terminal coordinates stay fixed.

Routing tries a straight connection first, then the two orthogonal one-bend forms. A separate straight approach segment precedes that route when needed for terminal clearance.

A straight wire may cross at most two unrelated wires, and a bent wire at most one. Overlapping unrelated wires, reverse turns, and traversal through symbol bodies are rejected.

Prefer moving components to introducing detours. Equivalent one-bend routes follow the terminal entry direction where feasible. Avoid unnecessary U-turns and doubling back; shorter wires must not displace clearer routing.

Supply and ground occurrences never rotate or reflect. Pins may rotate only with a connected device. Every symbol transformation also transforms its terminal attachments without changing their identities.

A lower NAND sharing its second input with an upper NAND supports vertical mirroring to align the shared-input branches. Symmetry extends to corresponding `pinIn`, `pinOut`, and `pinInOut` occurrences, split junctions, and wire entry directions where feasible.

Pins of the same type and side prefer a shared column within their block, or at diagram level when ungrouped. Their wire junctions retain any needed staggering. A column moves as a group only when topology, body clearance, and crossing limits remain valid.

Equivalent reflected branches match device types and terminal sides, then prefer reflected pin positions. Connection declaration order does not override that match. Symmetry does not justify additional proxies.

An input pin prefers the midpoint of its connected branch group, subject to wire clearance. A single connection aligns naturally with its terminal.

Exact group centering may translate a whole symbol by a fractional grid offset, including 15 units. Symbol-local attachments remain authoritative; artwork and attachment points move together. Routing meets those exact transformed positions.

The router reports a failure if the permitted wire shapes and net occurrences cannot connect a net. It does not discard assignments or run a global layout search. The fixed spacing favors clear routes over a small bounding box.

Rendered connectivity is checked against the source model. Wire segments must connect every assigned terminal; only eligible named-net proxies may join separate drawn components by identity. A crossing between unrelated nets does not join those nets.

DC circuits retain explicit wires to source terminals when the source defines those connections. Rendering does not add supply rails, ground references, component labels, or internal relay contacts absent from the source.

A `voltageSource` defaults to the left of its local connected circuit, vertically centered against the other components' extents. Its outgoing conventional-current path runs clockwise when the source topology permits that arrangement. Placement preserves polarity and connectivity; it does not invent a return path.

A fuse on the positive supply path defaults to horizontal placement when no explicit stage direction prevents it. Adjacent stages reserve space for their supply and ground symbols, including the minimum terminal approaches.
