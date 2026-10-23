# Drawing style

This specification governs how a renderer draws `circuitDiagram`. Circuit syntax, device types, terminal names, and electrical semantics are defined in [Notation for circuit diagrams](notation.md).

These are approved drawing requirements, not a claim that schematic rendering is implemented. They define the established CMOS schematic convention, not a universal placement policy for all analog and digital circuits.

## Orientation

1. The supply rail appears at the top and ground at the bottom.
2. PMOS devices sit above NMOS devices in the same stage.
3. Signals flow from left to right.
4. Inputs appear on the left and outputs on the right.
5. Stage frames follow the [stage presentation](#stage-presentation) convention.
6. Signals stay outside stage frames except for branches crossing the borders to reach device terminals.
7. Input signals split at junctions outside stage frames.
8. The first gate driven by an input is aligned horizontally with that input pin.
9. In a left-to-right stage, each successive device sits lower than the device to its left.
10. Additional gate connections branch from the corresponding input line using orthogonal routing.

The expression *supply rail* describes graphical placement, not an electrical object type. Stage ordering, membership, and direction declarations are defined in [the syntax rules](notation.md#syntax-rules).

## Subgraph presentation

Structural membership and diagram-mode inheritance are defined in [Circuit structure](notation.md#circuit-structure).

### Stage presentation

Each stage is enclosed by a dashed frame labelled with its name. Stage placement remains governed by its declared direction, as defined in the [syntax rules](notation.md#syntax-rules).

### Block presentation

A block visually groups its contained stages. A block does not draw new electrical connections or alter existing wire topology.

The precise block-border styling, padding, and treatment of routes crossing its boundary remain for the placement and rendering implementation.

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

A connection label identifies the named terminal of its device endpoint.

The terminal label is drawn adjacent to the device attachment point, rather than at the midpoint of the connecting wire.

Terminal-label placement is independent of the written order of the net and device endpoints.

For an IC, the side qualifier selects the body side. The terminal label remains associated with the named IC pin.

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
