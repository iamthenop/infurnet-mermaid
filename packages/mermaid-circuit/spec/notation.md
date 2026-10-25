# Notation for circuit diagrams

This specification records the approved syntax and electrical semantics of `circuitDiagram`. The parser implements the 16 authorable object types, diagram modes, typed subgraphs, and fixed-terminal connections described here. The NAND2 example is a parser acceptance fixture.

Layout, wiring, dynamic ICs, and device rendering remain unimplemented.

The notation is a deliberately restricted Mermaid flowchart-like syntax. Compatibility with the complete Mermaid flowchart grammar is not promised. Geometry and presentation are governed by [Drawing style](style.md).

## Diagram and connectivity

A diagram begins with:

```text
circuitDiagram D
```

```text
circuitDiagram A
```

Devices are declared as nodes. Connections imply nets by joining named device terminals and external endpoints. Device types and terminal names are defined here; visual geometry does not establish electrical connectivity.

### Diagram modes

A circuit diagram declares a representation mode.

`circuitDiagram D` selects digital logic representation.

`circuitDiagram A` selects electrical/device-level representation.

Registered digital logic symbols are eligible in `D`. Registered electrical device-level symbols are eligible in `A`. Shared shapes are eligible in both modes.

Shape eligibility is recorded in `shapes/shapes.json` using `allowedModes`.

Mode eligibility does not make a catalog-only shape authorable. A shape must also have an approved notation type and terminal contract.

Every stage and block inherits its diagram mode. Subgraphs cannot make an otherwise illegal device legal. Dynamic IC eligibility must be associated with the eventual IC definition, rather than the generic visual template.

Electrical connectivity is defined by nets and named device terminals in either mode. Rendering does not establish connectivity.

The parser records the diagram mode and enforces registered-shape eligibility for authorable types. Layout and rendering remain subsequent implementation work.

## Object types

The authorable object vocabulary is closed and contains these 16 types. Generic nets remain internal connectivity groups and cannot be declared with `:::net`.

| Type | Kind | Terminals |
| --- | --- | --- |
| `pmos` | Device | G, S, D |
| `nmos` | Device | G, D, S |
| `pmosBlk` | Device | G, S, D, B |
| `nmosBlk` | Device | G, D, S, B |
| `resistor` | Device | A, B |
| `capacitor` | Device | A, B |
| `diode` | Device | A, K |
| `voltageSource` | Device | P, N |
| `currentSource` | Device | P, N |
| `inverter` | Device | I, O |
| `buffer` | Device | I, O |
| `supplyNet` | Net | None |
| `ground` | Net | None |
| `pinIn` | Net | None |
| `pinOut` | Net | None |
| `pinInOut` | Net | None |

### Supply terminology and semantics

The term *supply net* follows IEEE 1801 terminology and covers electrical supply connections used for power or ground functions. `supplyNet` is this project's camelCase identifier, not an assertion that IEEE defines that programmatic spelling.

| Term | Meaning |
| --- | --- |
| `net` | Generic electrical connectivity |
| `supplyNet` | Supply net, including connections used for power or ground functions |
| `ground` | Specialized notation and graphical presentation for a ground-reference supply net |
| Supply rail | Graphical presentation of a supply connection |
| `voltageSource` | Device establishing a voltage |
| `currentSource` | Device establishing a current |

`supplyNet` is the electrical supply category. It does not imply that a source device exists at the point where its symbol is drawn. A supply net can connect to the terminals of multiple devices. Different supply-net identifiers are not electrically connected merely because they share a type.

`ground` remains a distinct authorable notation type selecting the ground-reference representation. It does not introduce a separate kind of electrical connectivity or imply that IEEE 1801 excludes ground connections from supply nets.

The word *source* is not a replacement for supply connectivity: it is ambiguous with electrical source devices and transistor source terminals. No additional supply classifications, power-domain semantics, or IEEE 1801 UPF parsing are defined here.

### SVG references

These references preserve the existing asset filenames in the [shape library](../shapes/). The supply notation identifier does not change its asset filename. The plain `net` type has no shape.

| Type | SVG |
| --- | --- |
| `pmos` | `pmos.svg` |
| `nmos` | `nmos.svg` |
| `pmosBlk` | `pmos4.svg` |
| `nmosBlk` | `nmos4.svg` |
| `resistor` | `resistor.svg` |
| `capacitor` | `capacitor.svg` |
| `diode` | `diode.svg` |
| `voltageSource` | `vsource.svg` |
| `currentSource` | `isource.svg` |
| `inverter` | `inverter.svg` |
| `buffer` | `buffer.svg` |
| `supplyNet` | `vdd.svg` |
| `ground` | `ground.svg` |
| `pinIn` | `pin-in.svg` |
| `pinOut` | `pin-out.svg` |
| `pinInOut` | `pin-io.svg` |

`shapes/shapes.json` owns SVG filenames, pane dimensions, terminal coordinates, and label anchors. This specification does not define a coordinate registry.

## Circuit structure

### Stage

A `stage` is a typed subgraph that groups devices for ordering and placement.

A stage does not define electrical connectivity. Device terminals remain connected through implied nets.

### Block

A `block` is a typed subgraph that groups related stages into a larger circuit section.

A block does not create an electrical interface, a reusable device type, or a new connectivity domain.

### Integrated circuit

An `ic` is a device representation with dynamically defined pins.

An IC is not a subgraph. Its pins form its external electrical interface. Its internal circuitry is not implied by the shape.

An IC may belong to a stage like any other device.

### Typed subgraph declarations

The intended declarations are:

```text
subgraph stage stageName
    ...
end
```

```text
subgraph block blockName
    ...
end
```

`stage` and `block` are structural keywords. There is no initial `module` subgraph type.

The following is an intended structural example, not an implemented parser fixture:

```text
circuitDiagram D

subgraph block datapath
    subgraph stage inputLogic
        direction LR
        U1["U1"]:::inverter
        U2["U2"]:::buffer
    end

    subgraph stage outputLogic
        direction LR
        U3["U3"]:::and
    end
end
```

This example illustrates structural membership only. It does not authorize the new logic gates in the currently closed object-type table. The existing 16-type vocabulary remains unchanged.

### Membership and hierarchy

1. A stage contains devices.
2. A block groups stages.
3. A stage may appear at diagram level or inside a block.
4. Stages do not contain other stages or blocks.
5. Blocks do not contain other blocks.
6. Nets remain declared outside subgraphs.
7. Each device belongs to at most one explicit stage.
8. Subgraph membership does not establish electrical connectivity.
9. All subgraphs inherit the enclosing diagram's `D` or `A` mode.
10. A subgraph cannot override diagram-mode eligibility.

These rules define the initial two-level grouping model, not reusable modules or arbitrary hierarchical circuits. Devices outside all explicit stages retain the implicit final-stage behavior defined in the [syntax rules](#syntax-rules).

A block groups its child stages. It does not introduce an electrical ordering rule.

### Integrated circuit pins

1. An IC has a unique device identifier.
2. An IC has a visual body and a collection of named electrical pins.
3. IC pins are defined dynamically for the particular device.
4. Each pin has a name and a placement side.
5. Placement sides are `T`, `B`, `L`, and `R`.
6. The same IC may have multiple pins on any side.
7. Pin names identify electrical terminals independently of their positions.
8. A connection to an IC identifies the named terminal and its placement side using the connection syntax defined in [Connection syntax](#connection-syntax).
9. The connection joins the named terminal to a net. The side qualifier controls only that terminal's placement.
10. An IC may represent an analog or digital component; eligibility is not inferred from its outline.

| Side | Meaning |
| --- | --- |
| `T` | Top |
| `B` | Bottom |
| `L` | Left |
| `R` | Right |

The approved connection notation provides side assignment for connected IC pins. A separate pin-placement declaration is not required for those pins.

The ordering of multiple pins on one side, unconnected pin declarations, physical package numbering, IC definition and instance syntax, and automatic body sizing remain future design work.

The `ic` device representation is not yet included in the closed authorable object-type table. Dynamic IC parsing and rendering are not implemented.

Typed subgraph parsing and structural validation are implemented. Dynamic IC construction and schematic rendering remain unimplemented.

## Connection syntax

Connections are written from left to right in the stated direction of current flow. This is diagram notation, not electrical simulation or design-rule checking. The direction does not establish voltage polarity, current magnitude, or extra connections.

Each device endpoint names its terminal beside the device identifier. A terminal on the right endpoint may appear before or after that identifier:

```text
P0 |D| --- |S| P1
P0 |D| --- P1 |S|
```

Both forms connect `P0.D` to `P1.S` with the same stated direction. Reversing the endpoints reverses that direction, but both terminals still belong to the same net. The order of statements in the document does not change electrical membership.

### External endpoints

External endpoints use their identifiers without terminal labels:

```text
VDD --- P0 |S|
A --- |G| P0
P0 |D| --- B
B --- N1 |D|
A --- N1 |G|
N1 |S| --- GND
```

Devices must be declared. Endpoint declarations use the existing `supplyNet`, `ground`, `pinIn`, `pinOut`, and `pinInOut` types. Explicit declarations determine endpoint type and label, even when their connections appear earlier in the document.

Missing endpoint declarations may be inferred from the connected MOS device and terminal:

| Connected device | Terminal | Inferred endpoint type |
| --- | --- | --- |
| `pmos`, `pmosBlk` | S | `supplyNet` |
| `nmos`, `nmosBlk` | S | `ground` |
| Any of these MOS devices | G | `pinIn` |
| Any of these MOS devices | D | `pinOut` |

An undeclared endpoint is created once, using its first mapped connection's type and its identifier as its label. Later references reuse that endpoint. Names such as `VDD` and `GND` do not determine type, and neither does the endpoint's written side.

Inference is resolved before connectivity, so an earlier connection can reuse an endpoint inferred by a later MOS connection. No inference mapping is defined for other device terminals; endpoints without a mapped connection require explicit declarations. `pinInOut` remains explicitly declarable and is not inferred.

For example, after declaring three PMOS devices, these statements share one inferred supply endpoint:

```text
VDD --- P0 |S|
VDD --- P1 |S|
VDD --- P2 |S|
```

All three source terminals belong to the same net. This does not use a direct source-to-source statement.

### Direct device connections

Both endpoints must identify declared devices with distinct identifiers and valid terminals. Forward references to declared devices are accepted.

```text
circuitDiagram A
R1["R1"]:::resistor
R2["R2"]:::resistor
R1 |B| --- |A| R2
```

This connects `R1.B` to `R2.A`. The parser retains the existing `CircuitModel.nets` and terminal-to-net `Connection` representation. It creates one internal generic net when the terminal group has no external endpoint.

Generic nets cannot be authored with `:::net`. The former `R1 ---|B:A| R2` syntax is rejected rather than retained as an alias.

Direct `P0 |S| --- |S| P1` connections are rejected. No additional terminal-pair restrictions are introduced. Unknown devices and terminals, unlabeled device endpoints, and direct endpoint-to-endpoint connections are rejected.

### Implied nets and junctions

Connections sharing a terminal form one electrical group without a net or junction declaration:

```text
circuitDiagram A
R1["R1"]:::resistor
R2["R2"]:::resistor
R3["R3"]:::resistor
R1 |B| --- |A| R2
R1 |B| --- |A| R3
```

This creates one net containing `R1.B`, `R2.A`, and `R3.A`. Repeated statements do not duplicate terminal memberships. Reordered or reversed statements preserve net membership, although reversing an endpoint pair changes its stated current-flow direction.

The following instead creates two distinct nets:

```text
R1 |B| --- |A| R2
R2 |B| --- |A| R3
```

`R2.A` and `R2.B` remain separate terminals. Device membership in a stage or block does not join them.

A group connected to one named external endpoint uses that endpoint's identity. Existing normalization rejects attempts to assign different named endpoints to the same terminal group. This checks identifier consistency, not electrical current or voltage.

Junction placement belongs to rendering and is outside the parser's responsibility.

### IC pin connections

An IC connection uses the same net-to-terminal notation as other devices.

The IC endpoint additionally identifies the side on which the named terminal appears.

```text
net --- |pinName| side:device
side:device |pinName| --- net
```

The permitted side identifiers are:

| Identifier | Side |
| --- | --- |
| `T` | Top |
| `B` | Bottom |
| `L` | Left |
| `R` | Right |

The side identifier is written directly before the IC device identifier, separated by one colon.

The side qualifier is part of the connection endpoint notation. It is not part of the device identifier or terminal name.

A connected IC pin has its name, electrical connection, and placement side established by one connection statement.

For example:

```text
A --- |IN1| L:U1
L:U1 |IN1| --- A
```

Both statements describe terminal `IN1` on the left side of IC `U1`, connected to net `A`.

No separate pin-placement statement is required for that connection.

The IC's named terminals form its electrical interface. Pin placement does not independently establish additional connectivity.

### Fixed-terminal example

The following is an intended notation example:

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

This demonstrates that a device may appear on the left side of a connection. Both `I` and `O` remain the existing inverter terminals. No new electrical connection type is introduced.

### Dynamic IC connection example

```text
circuitDiagram D

A(["A"]):::pinIn
B(["B"]):::pinIn
Y(["Y"]):::pinOut

VDD{{"VDD"}}:::supplyNet
VSS{{"VSS"}}:::ground

subgraph stage logic
    U1["U1"]:::ic
end

A --- |IN1| L:U1
B --- |IN2| L:U1
R:U1 |OUT| --- Y

VDD --- |VCC| T:U1
B:U1 |GND| --- VSS
```

This example illustrates the approved connection notation for a future dynamic IC device. The `ic` type is not yet authorable by the current parser.

The five named terminals belong to the IC instance. Their sides are specified by their connection endpoints. Electrical connectivity is established by the corresponding nets.

The example does not establish physical package pin numbers, ordering among multiple pins on one side, or IC internal behavior.

## Syntax rules

1. The intended first statement is `circuitDiagram D` or `circuitDiagram A`.
2. Blank lines and lines beginning with `%%` are ignored.
3. Node identifiers contain letters and digits and are unique within the diagram.
4. A node declaration uses Mermaid-style brackets followed by `:::type`.
5. Device declarations use square brackets.
6. Generic nets are implied by connections; `:::net` declarations are rejected.
7. Supply and ground nets use `{{...}}` syntax.
8. Input, output, and bidirectional pins use `([...])` syntax.
9. Labels preserve the author's device or net name.
10. Optional device parameters appear below the instance name, separated by `<br/>` in the label. The notation does not interpret parameter values.
11. Connections follow the [connection syntax](#connection-syntax); written left-to-right order states current-flow direction.
12. A device terminal connects to one net.
13. Nets connect to device terminals, not directly to other nets.
14. Subgraphs use the [typed declarations](#typed-subgraph-declarations) and terminate with `end`.
15. Stage names use camelCase.
16. Subgraphs follow the [membership and hierarchy rules](#membership-and-hierarchy).
17. Stages stack vertically in declaration order.
18. `direction LR` places stage devices side by side and is the default.
19. `direction TB` stacks stage devices vertically.
20. Devices declared outside all explicit stages occupy an implicit final stage.
21. There are no notation-level style declarations.

## Bulk semantics

Three-terminal `pmos` and `nmos` devices have their bulk implicitly tied to their source. Use `pmosBlk` or `nmosBlk` when the bulk connects to a separate net. Bulk connections must not be inferred from visual geometry.

## Junctions

Junctions are not authorable circuit objects. The circuit model establishes shared-net connectivity. The renderer adds junction markers at routed branch points for nets connected to three or more terminals. Wire crossings do not independently establish electrical connectivity.

## NAND2 reference

Its transistor-level representation uses electrical-device shapes despite implementing a digital logic function.

```text
circuitDiagram A

    A(["A"]):::pinIn
    B(["B"]):::pinIn
    OUT(["OUT"]):::pinOut
    VDD{{"VDD"}}:::supplyNet
    VSS{{"VSS"}}:::ground

    subgraph stage pullUp
        direction LR
        PMOS0["PMOS0"]:::pmos
        PMOS1["PMOS1"]:::pmos
    end

    subgraph stage pullDown
        direction TB
        NMOS0["NMOS0"]:::nmos
        NMOS1["NMOS1"]:::nmos
    end

    A ---|G| PMOS0
    B ---|G| PMOS1
    VDD ---|S| PMOS0
    VDD ---|S| PMOS1
    PMOS0 |D| --- OUT
    PMOS1 |D| --- OUT

    A ---|G| NMOS0
    B ---|G| NMOS1
    OUT ---|D| NMOS0
    NMOS0 |S| --- |D| NMOS1
    NMOS1 |S| --- VSS
```

This fixture establishes parallel PMOS pull-up devices, series NMOS pull-down devices, shared input nets, an internal intermediate net, explicit supply and ground connections, named device terminals, and different stage placement directions.
