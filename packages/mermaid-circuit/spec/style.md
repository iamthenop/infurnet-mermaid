# Drawing style

This specification governs how a renderer draws `circuitDiagram`. Circuit syntax, device types, terminal names, and electrical semantics are defined in [Notation for circuit diagrams](notation.md).

Fixed-symbol schematic rendering is implemented against these approved drawing requirements. They define the established CMOS schematic convention, not a universal placement policy for all analog and digital circuits.

## Orientation

1. The supply rail appears at the top and ground at the bottom.
2. PMOS devices sit above NMOS devices in the same stage.
3. Signals flow from left to right.
4. Inputs appear on the left and outputs on the right.
5. Stage frames follow the [stage presentation](#stage-presentation) convention.
6. Signals stay outside stage frames except for branches crossing the borders to reach device terminals.
7. Input signals split at junctions outside stage frames.
8. The first recipient of an input is the top-left recipient. Align its terminal horizontally with the input pin when possible while preserving input declaration order.
9. In a left-to-right stage, successive devices may sit lower as they move right to support input alignment.
10. Additional gate connections branch from the corresponding input line using orthogonal routing.

The expression *supply rail* describes graphical placement, not an electrical object type. Stage ordering, membership, and direction declarations are defined in [the syntax rules](notation.md#syntax-rules).

## Placement and rotation

Placement produces geometry separate from the electrical model. It preserves device and terminal identities, net assignments, and structural membership.

Stages appear vertically in declaration order, with the implicit final stage last. Blocks retain their stage membership and bounds for frame drawing.

Stages in the same vertical diagram sequence share a horizontal centerline. Stages retain their individual widths and internal device arrangements.

| Stage direction | Device arrangement |
| --- | --- |
| `auto` | Recognized conduction-series chains run top to bottom; devices across the same two conduction nets run left to right |
| `LR` | Devices run left to right in declaration order |
| `TB` | Devices run top to bottom |

Explicit direction takes precedence over automatic arrangement. Shared MOSFET gates do not establish a conduction-series relationship. Sharing only one net does not establish a parallel group.

Device orientation is independent of arrangement direction. Placement may use right-angle rotations to align connected terminals, applying the same transform to artwork and named attachments.

Keep the default orientation when rotation offers no supported alignment advantage. For series chains, align consecutive attachments where the symbol geometry permits.

Automatic placement prefers the [default CMOS orientations](#symbols), including for four-terminal variants. Explicit directions may rotate those symbols when terminal alignment improves. Rotation does not exchange source and drain identities.

| Object | Region | Order |
| --- | --- | --- |
| `voltageSource` | Top | Left to right in declaration order |
| `supplyNet` | Separate top supply region | Declaration order |
| `ground` | Bottom | Left to right in declaration order |
| `pinIn` | Left | Top to bottom in declaration order |
| `pinOut` | Right | Top to bottom in declaration order |

Output pins appear on the right. Their attachment anchors form a vertically centered group relative to the combined region of nonempty stages. Output order follows declaration order. Peripheral power and ground positions do not determine this center.

A single output shared only by unrotated PMOS and NMOS drains aligns with their connecting wire, midway between the lowest PMOS drain and highest NMOS drain. This alignment takes precedence over centering against the full stage region.

Voltage sources retain their stage identity when placed in the top region. Position does not connect a voltage source to a supply net.

Ordinary named and implicit nets have no independent symbol placement. The side for `pinInOut` remains undecided.

Input fan-out uses the [orientation priorities](#orientation). Return positioned input and recipient anchors for orthogonal branching. Placement does not draw branches or guarantee crossing-free routes.

In an explicitly left-to-right stage, recognized series devices remain eligible for descending placement when required for input fan-out. Conduction-terminal alignment must not defeat that placement rule. Routing remains responsible for connecting separated terminals.

Placement must be deterministic. Symbol panes must remain separate, except compact input pins may share unused margins to align with their first recipients. Their visible flags and labels must remain separate.

Retain the [pane and snap conventions](#panes-and-snap-points). Spacing remains an internal implementation detail.

Exact stage and output centering takes precedence over global snap alignment. Placement may use fractional grid offsets when required. Symbol-local terminal coordinates remain authoritative, and all transformed attachments must retain their exact positions. Routing must respect those positions.

Use declaration order when the placement rules do not distinguish objects. Connection-statement order and generated net identifiers do not determine visual order.

## Subgraph presentation

Structural membership and diagram-mode inheritance are defined in [Circuit structure](notation.md#circuit-structure).

### Stage presentation

Each stage is enclosed by a dashed frame labelled with its name. Its bounds follow [placement and rotation](#placement-and-rotation). Frame drawing is implemented.

### Block presentation

A block visually groups its contained stages. A block does not draw new electrical connections or alter existing wire topology.

The layout result contains block bounds. The renderer draws those bounds as grouping frames without changing route connectivity.

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
