# Drawing style

This specification governs how a renderer draws `circuitDiagram`. Circuit syntax, device types, terminal names, and electrical semantics are defined in [Notation for circuit diagrams](notation.md).

These are approved drawing requirements, not a claim that schematic rendering is implemented. They define the established CMOS schematic convention, not a universal placement policy for all analog and digital circuits.

## Orientation

1. The supply rail appears at the top and ground at the bottom.
2. PMOS devices sit above NMOS devices in the same stage.
3. Signals flow from left to right.
4. Inputs appear on the left and outputs on the right.
5. Each stage is enclosed by a dashed frame labelled with its name.
6. Signals stay outside stage frames except for branches crossing the borders to reach device terminals.
7. Input signals split at junctions outside stage frames.
8. The first gate driven by an input is aligned horizontally with that input pin.
9. In a left-to-right stage, each successive device sits lower than the device to its left.
10. Additional gate connections branch from the corresponding input line using orthogonal routing.

The expression *supply rail* describes graphical placement, not an electrical object type. Stage ordering, membership, and direction declarations are defined in [the syntax rules](notation.md#syntax-rules).

## Symbols

1. A transistor gate appears on the left.
2. PMOS sources appear at the top.
3. NMOS sources appear at the bottom.
4. Three-terminal MOSFETs omit the bulk connection.
5. Four-terminal MOSFETs expose the bulk terminal.
6. A bubble at the gate marks PMOS.
7. NMOS has no gate bubble.
8. Resistors and sources are drawn vertically.
9. A voltage source has its positive terminal at the top.
10. Symbols use black strokes with a nominal width of 2 units.
11. Terminals lie on established snap points.
12. Wires join terminal coordinates without unintended jogs.

Bulk connectivity is governed by [bulk semantics](notation.md#bulk-semantics), not by symbol positioning.

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

## Panes and snap points

Standard shapes occupy a 120 × 120 pane. Pin flags occupy a 240 × 120 pane.

Snap points are defined at these fractions of a 120-unit span:

`0, 1/4, 1/3, 1/2, 2/3, 3/4, 1`

| Pane span | Snap positions |
| --- | --- |
| 120 units | 0, 30, 40, 60, 80, 90, 120 |
| 240 units | 0, 30, 40, 60, 80, 90, 120, 150, 160, 180, 200, 210, 240 |

Every terminal, line endpoint, and line bend lies on a snap point. Circles conform when their centers or edges lie on snap points.

The following internal symbol details are exempt:

- Voltage-source polarity marks.
- Third ground bar.
- Current-source arrow.
- Four-terminal transistor bulk arrows.

## Terminal positioning conventions

| Family | Terminal locations |
| --- | --- |
| Two-terminal vertical shapes | Top center and bottom center |
| Transistors | Gate at left center; source and drain at x=90 on upper and lower edges; optional bulk at right center |
| Logic gates | Input at left center; output at right center |

Exact per-symbol coordinates belong to `shapes/shapes.json` when the catalog is implemented. This document does not create another coordinate registry.

## Shape references

The intended [shape library](../shapes/) supplies SVG symbols. `shapes/shapes.json` is the authoritative shape metadata catalog when present; `shapes/INDEX.md` is its human-readable reference. These catalog artifacts are not created by this specification work.

The existing resistor SVG and TypeScript index describe a horizontal resistor. Their correction to match the vertical-resistor requirement remains deferred; this specification does not claim that the current asset conforms.
