# Notation for circuit diagrams

This specification records the approved syntax and electrical semantics of `circuitDiagram`. The parser implements the 17 authorable object types, diagram modes, typed subgraphs, and fixed-terminal connections described here.

The NAND2 example is a parser, placement, routing, and rendering acceptance fixture. Placement and routing are implemented separately from the electrical model. Dynamic ICs remain unimplemented.

The notation is a deliberately restricted Mermaid flowchart-like syntax. Compatibility with the complete Mermaid flowchart grammar is not promised. Geometry and presentation are governed by [Drawing style](style.md).

## Diagram and connectivity

A diagram begins with:

```text
circuitDiagram D
```

```text
circuitDiagram A
```

Devices and nets are declared as nodes. Every electrical connection joins a net to one named device terminal. Device types and terminal names are defined here; visual geometry does not establish electrical connectivity.

### Diagram modes

A circuit diagram declares a representation mode.

`circuitDiagram D` selects digital logic representation.

`circuitDiagram A` selects electrical/device-level representation.

Registered digital logic symbols are eligible in `D`. Registered electrical device-level symbols are eligible in `A`. Shared shapes are eligible in both modes.

Shape eligibility is recorded in `shapes/shapes.json` using `allowedModes`.

Mode eligibility does not make a catalog-only shape authorable. A shape must also have an approved notation type and terminal contract.

Every stage and block inherits its diagram mode. Subgraphs cannot make an otherwise illegal device legal. Dynamic IC eligibility must be associated with the eventual IC definition, rather than the generic visual template.

Electrical connectivity is defined by nets and named device terminals in either mode. Rendering does not establish connectivity.

The parser records the diagram mode and enforces registered-shape eligibility for authorable types. Placement follows the [drawing specification](style.md#placement-and-rotation). Wire routing and fixed-symbol SVG rendering are implemented.

## Object types

The object vocabulary is closed and contains these 17 types:

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
| `net` | Net | None |
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

A stage does not define electrical connectivity. Device terminals remain connected through named nets.

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

This example illustrates structural membership only. It does not authorize the new logic gates in the currently closed object-type table. The existing 17-type vocabulary remains unchanged.

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

Typed subgraph parsing and structural validation are implemented. Fixed-symbol schematic rendering is implemented; dynamic IC construction remains unimplemented.

## Connection syntax

A named-net connection joins exactly one net to one named device terminal. Direct device shorthand is normalized into these terminal-to-net relationships.

The net and device may appear in either order.

```text
net ---|terminal| device
device ---|terminal| net
```

The label between vertical bars identifies the terminal belonging to the device endpoint.

Reversing the written endpoints does not change electrical connectivity.

Connection order does not imply signal direction, voltage polarity, current direction, or power flow.

The following connections are electrically equivalent:

```text
A ---|I| U1
U1 ---|I| A
```

Direct device-to-device connections require both terminal names and are normalized into the netlist. Unlabeled device-to-device connections and direct net-to-net connections remain prohibited. Shared connectivity may use explicitly named or parser-generated implicit nets.

For fixed-terminal devices, the terminal label must match a terminal defined by the device's notation contract.

### Direct device connections

```text
device1 ---|terminal1:terminal2| device2
```

The two terminal identifiers correspond to the device endpoints in written order. Both must name valid terminals on their respective devices. Direct shorthand is permitted only between declared, authorable devices with distinct identifiers; forward references are accepted.

For example, `R1 ---|B:A| R2` connects `R1.B` to `R2.A`. The reversed expression `R2 ---|A:B| R1` is electrically equivalent. The colon separates two terminal names; it does not specify IC pin placement or signal direction.

#### Direct connection normalization

A direct device connection is shorthand for two device terminals sharing one electrical net.

The parser must represent the relationship through the existing netlist.

A direct connection does not introduce a separate electrical edge type.

If the connected terminal group already belongs to one named net, that net is used.

If the connected terminal group has no named net, the parser creates one implicit net.

All device terminals joined through a chain of direct connections belong to the same net when the chain shares terminal endpoints.

Two different explicitly named nets must not be silently merged through shorthand. Such a conflict is rejected.

Repeated equivalent connections do not create additional electrical relationships.

The written order of connection statements does not change the electrical relationships they establish.

#### Explicit and implicit net equivalence

```text
circuitDiagram A

R1["R1"]:::resistor
R2["R2"]:::resistor
n1(("n1")):::net

R1 ---|B| n1
n1 ---|A| R2
```

The following represents equivalent connectivity:

```text
circuitDiagram A

R1["R1"]:::resistor
R2["R2"]:::resistor

R1 ---|B:A| R2
```

Both representations connect precisely the same two device terminals. The first uses the author-declared net `n1`; the second uses an implicit net generated by the parser. The difference in net naming does not change electrical connectivity.

#### Branches and series connections

Direct connections may form a network through a shared terminal endpoint:

```text
circuitDiagram A

R1["R1"]:::resistor
R2["R2"]:::resistor
R3["R3"]:::resistor

R1 ---|B:A| R2
R1 ---|B:A| R3
```

This produces one shared implicit net containing `R1.B`, `R2.A`, and `R3.A`. The two statements do not create separate nets.

Conversely, the following connections between those devices describe two distinct nets:

```text
R1 ---|B:A| R2
R2 ---|B:A| R3
```

`R2.A` and `R2.B` are distinct terminals. This establishes a series connection rather than joining all three devices into one net.

#### Named-net intersections

When direct connections intersect an explicitly named net, the parser uses that net's identity:

```text
circuitDiagram A

R1["R1"]:::resistor
R2["R2"]:::resistor
n1(("n1")):::net

R1 ---|B:A| R2
R2 ---|A| n1
```

Both `R1.B` and `R2.A` resolve to `n1`. The resolution also works when the explicit net connection appears before the shorthand statement.

The following input is invalid because the shorthand would combine terminal groups attached to different named nets:

```text
circuitDiagram A

R1["R1"]:::resistor
R2["R2"]:::resistor
n1(("n1")):::net
n2(("n2")):::net

R1 ---|B| n1
R2 ---|A| n2

R1 ---|B:A| R2
```

The parser rejects this conflict without replacing, renaming, or merging `n1` and `n2`.

### IC pin connections

An IC connection uses the same net-to-terminal notation as other devices.

The IC endpoint additionally identifies the side on which the named terminal appears.

```text
net ---|pinName| side:device
side:device ---|pinName| net
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
A ---|IN1| L:U1
L:U1 ---|IN1| A
```

Both statements describe terminal `IN1` on the left side of IC `U1`, connected to net `A`.

No separate pin-placement statement is required for that connection.

The IC's named terminals form its electrical interface. Pin placement does not independently establish additional connectivity.

### Symmetric fixed-terminal example

The following is an intended notation example:

```text
circuitDiagram D

A(["A"]):::pinIn
Y(["Y"]):::pinOut

subgraph stage logic
    U1["U1"]:::inverter
end

A  ---|I| U1
U1 ---|O| Y
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

A    ---|IN1| L:U1
L:U1 ---|IN2| B
R:U1 ---|OUT| Y

VDD  ---|VCC| T:U1
B:U1 ---|GND| VSS
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
6. Ordinary nets use circular `((...))` syntax.
7. Supply and ground nets use `{{...}}` syntax.
8. Input, output, and bidirectional pins use `([...])` syntax.
9. Labels preserve the author's device or net name.
10. Optional device parameters appear below the instance name, separated by `<br/>` in the label. The notation does not interpret parameter values.
11. Connections follow the [connection syntax](#connection-syntax). The net and device endpoints may appear in either order.
12. A device terminal connects to one net.
13. Nets connect to device terminals, not directly to other nets.
14. Subgraphs use the [typed declarations](#typed-subgraph-declarations) and terminate with `end`.
15. Stage names use camelCase.
16. Subgraphs follow the [membership and hierarchy rules](#membership-and-hierarchy).
17. Stages retain declaration order. Their visual arrangement follows the [drawing specification](style.md#placement-and-rotation).
18. An omitted stage direction records `auto`, including for the implicit final stage. Automatic placement follows the [drawing specification](style.md#placement-and-rotation).
19. Explicit direction syntax accepts `direction LR` and `direction TB`. There is no `direction auto` statement; omit the statement to select automatic placement.
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
    n01(("n01")):::net

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
    OUT ---|D| PMOS0
    OUT ---|D| PMOS1

    A ---|G| NMOS0
    B ---|G| NMOS1
    OUT ---|D| NMOS0
    n01 ---|S| NMOS0
    n01 ---|D| NMOS1
    VSS ---|S| NMOS1
```

This fixture establishes parallel PMOS pull-up devices, series NMOS pull-down devices, shared input nets, an internal intermediate net, explicit supply and ground connections, named device terminals, and different stage placement directions.
