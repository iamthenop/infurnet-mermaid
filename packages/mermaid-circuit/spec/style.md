# Drawing style

This specification governs how a renderer draws `circuitDiagram`. Circuit syntax, device types, terminal names, and electrical semantics are defined in [Notation for circuit diagrams](notation.md).

Fixed-symbol schematic rendering is implemented against these approved drawing requirements. They define the established CMOS schematic convention, not a universal placement policy for all analog and digital circuits.

## Orientation

1. Supply references prefer the top and ground references prefer the bottom.
2. PMOS devices sit above NMOS devices in the same stage.
3. Signals flow from left to right.
4. Inputs prefer the left and outputs prefer the right.
5. Stage frames follow the [stage presentation](#stage-presentation) convention.
6. Device placement precedes final graphical pin placement. First-recipient alignment is a preference, not a placement requirement.
7. Pin branches may split inside or outside stage frames when geometry and routing budgets permit.
8. Digital LR stages follow logic dependencies as defined under [placement and rotation](#placement-and-rotation).
9. Additional gate connections use orthogonal routing or repeated occurrences of the same named net.

Parallel PMOS and NMOS groups arranged left to right retain the same 90-unit descending stagger. Other analog LR groups do not acquire descending placement merely to align input pins.

The expression *supply rail* describes graphical placement, not an electrical object type. Stage ordering, membership, and direction declarations are defined in [the syntax rules](notation.md#syntax-rules).

## Placement and rotation

Placement produces geometry separate from the electrical model. It preserves device and terminal identities, net assignments, and structural membership.

With multiple nonempty blocks, align their vertical midpoints, preserving declaration order from left to right. Stages run downward except for the parallel branches defined below. Ungrouped stages follow below this row, with the implicit final stage last.

Without multiple nonempty blocks, stages retain one vertical sequence. Block placement preserves stage membership and electrical connectivity.

Graphical pin preferences do not determine device positions. The routing phase resolves final pin occurrences after device geometry is selected.

Stages in the same vertical diagram sequence share a horizontal centerline. Stages retain their individual widths and internal device arrangements.

| Stage direction | Device arrangement |
| --- | --- |
| `auto` | Recognized conduction-series chains run top to bottom; devices across the same two conduction nets run left to right |
| `LR` | Analog devices run left to right in declaration order; digital devices follow dependency columns |
| `TB` | Devices run top to bottom |

Explicit direction takes precedence over automatic arrangement. Shared MOSFET gates do not establish a conduction-series relationship. Sharing only one net does not establish a parallel group.

In mode `D`, an explicit `LR` stage lays out acyclic logic in dependency columns derived from output-to-input net assignments. Gates without in-stage predecessors start in the first column; each dependent gate sits one column beyond its deepest predecessor.

Digital LR placement uses dependency layers and crossing minimization. Devices at the same dependency depth may share a column. Declaration order resolves otherwise equivalent placements.

Evaluate a deterministic barycenter sweep in both layer directions, ordering gates by the average position of their connected neighbors. Compare the resulting placement with declaration order using topology and transformed terminal geometry. Accept changes only when the placement-quality estimates below improve.

Center each column vertically against the tallest column, preserving exact transformed attachments. Cyclic stages retain the existing declaration-order fallback. Dependency placement does not change stage membership or electrical connectivity.

Device orientation is independent of arrangement direction. Placement may use right-angle rotations to align connected terminals, applying the same transform to artwork and named attachments.

Symbol orientation includes rotation and reflection. A reflected symbol retains every named terminal's electrical identity. Automatic vertical reflection is permitted for digital logic gates when it reduces crossings or routing complexity.

Apply local reflection before rotation and translation, using the same transform for artwork, terminals, anchors, and bounds.

The horizontal option negates X, and the vertical option negates Y, in local coordinates.

Automatic selection may rotate eligible digital gates in right-angle increments and reverse them vertically. Evaluate terminal geometry and local complexity estimates when a connection exceeds the preferred routing budget. Preserve CMOS orientation restrictions.

Compare valid orientation candidates by estimated crossings, bends, and wire length, in that order. Prefer the default orientation when these scores are equal. Electrical connectivity and stage constraints must remain valid for every accepted candidate.

Placement computes geometry independently of routing feasibility and must not invoke full routing to score candidates. Routing consumes the selected layout afterward. A routing conflict fails rendering without invalidating the electrical model or the geometric placement.

Keep the default orientation when rotation offers no supported alignment advantage. For series chains, align consecutive attachments where the symbol geometry permits.

Automatic placement prefers the [default CMOS orientations](#symbols), including for four-terminal variants. Explicit directions may rotate those symbols when terminal alignment improves. Rotation does not exchange source and drain identities.

| Object | Preferred region | Order preference |
| --- | --- | --- |
| `voltageSource` | Top | Left to right in declaration order |
| `supplyNet` | Separate top supply region | Declaration order |
| `ground` | Bottom | Left to right in declaration order |
| `pinIn` | Left | Top to bottom in declaration order |
| `pinOut` | Right | Top to bottom in declaration order |

A single supply and ground prefer alignment with the horizontal midpoint of the CMOS conduction terminals. Without unrotated CMOS devices, they prefer alignment with the stage centerline. Multiple supply or ground symbols retain their declaration order.

Output pins prefer the right. Their preferred attachment anchors form a vertically centered group relative to the combined region of nonempty stages. Output order follows declaration order. Peripheral power and ground positions do not determine this center.

A single output shared only by unrotated PMOS and NMOS drains prefers alignment with their connecting wire, midway between the lowest PMOS drain and highest NMOS drain. This preference takes precedence over centering against the full stage region; pin clearance and routing constraints take precedence over both.

Voltage sources retain their stage identity when placed in the top region. Position does not connect a voltage source to a supply net.

Explicitly named nets may use graphical occurrences under [graphical pin placement](#graphical-pin-placement). Implicit unnamed nets remain continuously wired. `pinInOut` placement remains unsupported.

Placement returns device geometry and preferred peripheral positions. Routing resolves pin locations and branches. Neither step changes electrical assignments.

Placement must be deterministic. Nominal device and pin footprints remain separate under the tile-clearance rules below.

Retain the [pane and snap conventions](#panes-and-snap-points). Spacing remains an internal implementation detail.

The routing grid has a 10-unit pitch. Intermediate routing tracks and bends use the grid wherever they are not exact terminal attachments. Actual transformed terminal coordinates take precedence over the routing grid.

An off-grid terminal may use a short local orthogonal attachment to reach a usable grid track. Never move its anchor to fit the grid. Report a routing conflict if exact attachment, obstacle clearance, or net separation cannot be preserved.

Automatic placement and routing must not introduce new electrical connections or conceal missing connections.

Exact stage and output centering takes precedence over global snap alignment. Placement may use fractional grid offsets when required. Symbol-local terminal coordinates remain authoritative, and all transformed attachments must retain their exact positions. Routing must respect those positions.

Use declaration order when the placement rules do not distinguish objects. Connection-statement order and generated net identifiers do not determine visual order.

## Subgraph presentation

Structural membership and diagram-mode inheritance are defined in [Circuit structure](notation.md#circuit-structure).

### Stage presentation

Each stage is enclosed by a dashed frame labelled with its name. Its bounds follow [placement and rotation](#placement-and-rotation). Frame drawing is implemented.

### Block presentation

A block visually groups its contained stages within a visible frame. Its bounds enclose local symbols and routes. Block membership does not change electrical connectivity.

### Sectional net presentation

With multiple nonempty blocks, use each block as a presentation section. A visual net occurrence is one appearance of an existing net in that section. Electrical identity remains governed by [net semantics](notation.md#diagram-and-connectivity).

Represent internal cross-block named signals with section-boundary pins. A signal leaving an earlier block uses `pinOut` artwork; entry into a later block uses `pinIn` artwork. These directions describe graphical flow and do not assign electrical driver or receiver roles.

Each occurrence carries the declared net identifier and displays its label. Repeated pins refer to that same identifier. Matching label text on different identifiers does not join them.

Draw local wires from device attachments to these pins. Matching endpoints replace continuous inter-block wires. Routing records physical components within sections separately from their shared net identity.

Repeat external inputs as input-facing pins in each receiving section, without outgoing copies. The final receiving block holds the circuit output.

Repeated local pins are selected by proximity, clearance and branch complexity, not by a fixed count per stage or terminal. An eligible occurrence may serve devices from several stages in the same section.

Each section displays its connected supply and ground nets locally. A local rail refers to the existing global net; it does not declare another source or net. Power wires remain inside their section and follow the common-rail convention.

Every wire end meets a device attachment, local net symbol, or named boundary pin. Local routes remain inside section frames. Pin branches do not have a compulsory outside-stage split position.

### Parallel series branches

Recognize adjacent NMOS series stages inside one block when they share both outer conduction nets. Each internal chain link must remain a private two-terminal net. Place these branches in separate columns from left to right, keeping each chain top to bottom.

Align branch tops and retain their stage frames and membership. Their common upper and lower nets use shared rails. Unrelated stages keep the default vertical sequence.

The XOR core places `N0` above `N1` and `N2` above `N3`. Its two columns keep `nHigh` and `nLow` separate while sharing `OUT` and `VSS`.

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

Dynamic ICs do not inherit the fixed 120 × 120 symbol-pane requirement. The exact resizing, spacing, pin ordering, and routing methodology remains future work. Dynamic IC rendering is not implemented by the current plugin.

## Routing and junction presentation

Wires use orthogonal routing. Junction markers are placed at real connected splits according to the [junction contract](notation.md#junctions). Routes and crossings must not redefine electrical connectivity.

Unrotated parallel CMOS devices arranged left to right share a horizontal rail above the group and another below it. Their conduction leads run straight to these rails, so branches split and rejoin at common heights. The rails retain clearance from stage frames.

### Graphical pin placement

Graphical pins reference existing electrical net identifiers. Repeated appearances provide a conceptual Z-axis presentation: their matching identity replaces a visible interconnecting wire. They introduce no physical third coordinate, new device, terminal assignment, or net. Equal labels on different net IDs never establish connectivity. Each disconnected graphical component of a named net must have an identified occurrence; implicit unnamed nets remain continuous.

Device placement establishes the initial geometry. Pins are positioned and oriented afterward, and the renderer consumes the resolved occurrences and routes together. A rejected route must not produce an incomplete success SVG.

A logical tile is a nominal 120 × 120 footprint. Device coordinates remain continuous. Compare footprint centers directly, without rounding to a tile lattice. Sharing requires both horizontal displacement ≤ 600 and vertical displacement ≤ 480 units.

Device-to-pin placement requires an empty tile between orthogonally aligned footprints: `[D][0][P]`, horizontally or vertically. Direct adjacency and overlap are prohibited. Diagonal adjacency is permitted at displacements of at least one tile on both axes when the corresponding horizontal and vertical neighboring spaces are vacant. Apply these relationships geometrically to continuously positioned footprints. This rule does not add a 120-unit wire exclusion zone.

Input and output occurrences may rotate by 0°, 90°, 180°, or 270°. Transform artwork and anchor together, retaining the visual pin class and net identity. Labels remain upright inside the flag, clear of other artwork and unrelated wires. Source pin artwork is unchanged.

### Branch complexity and search

For a new branch, let B be its right-angle bends and C its crossings with unrelated nets. Include local attachment leads; exclude existing bends elsewhere in the trunk and same-net junctions. Unrelated overlaps and ambiguous endpoint contacts remain prohibited.

Sharing an existing pin or its trunk requires B + C ≤ 3, B ≤ 2, and C ≤ 2. Evaluate bounded straight, one-bend and two-bend candidates and reject over-budget candidates immediately. Among eligible occurrences, choose fewer crossings, fewer bends, shorter length, then declaration and occurrence order. Reuse a qualifying occurrence; do not duplicate a pin when a valid local branch exists. When no occurrence qualifies, place another occurrence of that same named net. There is no fixed maximum count or one-pin-per-terminal rule.

Ordinary device-to-device and new local connections prefer B + C ≤ 3 and may extend to B + C ≤ 5. Existing-pin sharing retains its stricter limit. Prefer a repeated named pin when it supplies a local route within the preferred budget. Consider already permitted device orientations using geometry and local estimates; device layout must not invoke the complete router.

Ordinary search tracks complexity during traversal and prunes paths exceeding five. Later routes must preserve the budgets of earlier branches. Use deterministic candidate ordering and tie-breakers. Intermediate tracks remain on the 10-unit routing grid; exact transformed attachments, including fractional placement offsets, remain authoritative. Artwork and anchors translate together and are never independently rounded.

Pin branches may cross or run near stage frames; they have no compulsory first-recipient alignment, branch column, or peripheral coordinate. Ordinary routes and common CMOS rails retain their existing frame-clearance conventions. If a complete route cannot satisfy the bounds, reject it with its net, terminal, stage/block and failed constraint; do not increase the budget or change connectivity.

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
