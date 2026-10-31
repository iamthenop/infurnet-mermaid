# Notation for circuit diagrams

This specification records the approved syntax and electrical semantics of `circuitDiagram`. The parser implements the 83 authorable object types, diagram modes, typed subgraphs, and fixed-terminal connections described here. The NAND2 example is a parser acceptance fixture.

Basic placement, orthogonal wiring, and symbol rendering are implemented. Mode `A` supports named IC pins on any side, including multiple pins per side.

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

The parser records the diagram mode and enforces registered-shape eligibility for authorable types. Basic layout and rendering consume that model without changing connectivity.

## Object types

The authorable object vocabulary is closed and contains these 83 types. Generic nets remain internal connectivity groups and cannot be declared with `:::net`.

| Type | Kind | Terminals |
| --- | --- | --- |
| `pmos` | Device | G, S, D |
| `nmos` | Device | G, D, S |
| `pmosBlk` | Device | G, S, D, B |
| `nmosBlk` | Device | G, D, S, B |
| `nmosDiode` | Device | G, D, S |
| `pmosDiode` | Device | G, S, D |
| `nmosCircle` | Device | G, D, S |
| `pmosCircle` | Device | G, S, D |
| `nmos2Diode` | Device | G, D, S |
| `pmos2Diode` | Device | G, S, D |
| `nmos2Circle` | Device | G, D, S |
| `pmos2Circle` | Device | G, S, D |
| `analogNFet` | Device | G, D, S |
| `analogPFet` | Device | G, S, D |
| `analogNFetBulk` | Device | G, D, S, B |
| `analogPFetBulk` | Device | G, S, D, B |
| `analogNFetCenteredGate` | Device | G, D, S |
| `analogPFetCenteredGate` | Device | G, S, D |
| `analogPFetNoArrow` | Device | G, S, D |
| `analogBiasedFet` | Device | G, D, S |
| `analogBiasedFetBulk` | Device | G, D, S, B |
| `analogBiasedFetCenteredGate` | Device | G, D, S |
| `analogBiasedFetNoArrow` | Device | G, D, S |
| `nfet2` | Device | G, D, S |
| `pfet2` | Device | G, D, S |
| `resistor` | Device | A, B |
| `resistorIEC` | Device | A, B |
| `resistorVar` | Device | A, B |
| `resistorVarIEC` | Device | A, B |
| `thermistor` | Device | A, B |
| `photoresistor` | Device | A, B |
| `photoresistorIEC` | Device | A, B |
| `fuseIEC` | Device | A, B |
| `fuseUs` | Device | A, B |
| `capacitor` | Device | A, B |
| `capacitor2` | Device | A, B |
| `capacitorPolar` | Device | A, B |
| `capacitor2Polar` | Device | A, B |
| `capacitorVar` | Device | A, B |
| `capacitorTrim` | Device | A, B |
| `lamp` | Device | A, B |
| `lamp2` | Device | A, B |
| `breaker` | Device | A, B |
| `diac` | Device | A, B |
| `diode` | Device | A, K |
| `diodeFilled` | Device | A, K |
| `schottky` | Device | A, K |
| `diodeTunnel` | Device | A, K |
| `diodeShockley` | Device | A, K |
| `zener` | Device | A, K |
| `diodeTVS` | Device | A, K |
| `varactor` | Device | A, K |
| `led` | Device | A, K |
| `led2` | Device | A, K |
| `photodiode` | Device | A, K |
| `voltageSource` | Device | P, N |
| `currentSource` | Device | P, N |
| `motor` | Device | A, B |
| `solenoid` | Device | A, B |
| `fuse` | Device | A, B |
| `antenna` | Device | A |
| `opamp` | Device | in1, in2, out, vd, vs |
| `nand` | Device | I1, I2, O |
| `and` | Device | I1, I2, O |
| `or` | Device | I1, I2, O |
| `nor` | Device | I1, I2, O |
| `xor` | Device | I1, I2, O |
| `xnor` | Device | I1, I2, O |
| `schmittAnd` | Device | I1, I2, O |
| `schmittNand` | Device | I1, I2, O |
| `notNot` | Device | I, O |
| `schmitt` | Device | I, O |
| `schmittNot` | Device | I, O |
| `mux` | Device | Fixed by size; see [MUX and DEMUX](#mux-and-demux) |
| `demux` | Device | Fixed by size; see [MUX and DEMUX](#mux-and-demux) |
| `ic` | Device | Dynamic |
| `inverter` | Device | I, O |
| `buffer` | Device | I, O |
| `supplyNet` | Net | None |
| `ground` | Net | None |
| `pinIn` | Net | None |
| `pinOut` | Net | None |
| `pinInOut` | Net | None |

The logic types `nand`, `and`, `or`, `nor`, `xor`, `xnor`, `inverter`, `buffer`, `notNot`, `schmitt`, `schmittNot`, `schmittAnd`, and `schmittNand` are authorable only in mode `D`. They select conventional logic symbols; Schmitt symbols also denote hysteresis. The renderer draws their connections without logic simulation, threshold calculations, or hysteresis simulation.

The types `resistorIEC`, `resistorVar`, `resistorVarIEC`, `thermistor`, `photoresistor`, `photoresistorIEC`, `fuseIEC`, and `fuseUs` are authorable only in mode `A`. Their arrows and markings add no electrical terminals.

These shapes convey conventional schematic meanings without simulating resistance, adjustment, temperature response, light response, or fuse operation.

The types `capacitor2`, `capacitorPolar`, `capacitor2Polar`, `capacitorVar`, `capacitorTrim`, `lamp`, `lamp2`, `breaker`, and `diac` are authorable only in mode `A`. Their existing polarity, adjustment, and other markings add no terminals or connections. DIAC uses `A` and `B`; `K` is not a valid DIAC terminal.

The renderer does not simulate capacitance, breakdown, switching, lamp operation, or circuit safety.

The types `diodeFilled`, `schottky`, `diodeTunnel`, `diodeShockley`, `zener`, `diodeTVS`, `varactor`, `led`, `led2`, and `photodiode` are authorable only in mode `A`. For these types and `diode`, `A` names the anode and `K` names the cathode. Rotation preserves these identities.

Existing arrows, polarity marks, and capacitance markings add no electrical terminals. The renderer does not simulate breakdown voltage, emission, illumination, capacitance, or current-voltage characteristics.

The MOSFET variants in the vocabulary table are authorable only in mode `A`. Their exact terminal coordinates and dimensions remain defined by [the shape catalog](../shapes/shapes.json), including the alternate-orientation variants. Symbol names such as `nmosDiode` and `pmosDiode` do not create gate-to-drain connections.

`opamp` is authorable only in mode `A`. Its registered terminals are `in1` (inverting input), `in2` (non-inverting input), `out` (output), `vd` (positive supply), and `vs` (negative supply).

Connections are established only by authored terminal relationships. No feedback, supply connection, or internal amplifier behaviour is implied.

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
| `nmosDiode` | `nmos-diode.svg` |
| `pmosDiode` | `pmos-diode.svg` |
| `nmosCircle` | `nmos-circle.svg` |
| `pmosCircle` | `pmos-circle.svg` |
| `nmos2Diode` | `nmos2-diode.svg` |
| `pmos2Diode` | `pmos2-diode.svg` |
| `nmos2Circle` | `nmos2-circle.svg` |
| `pmos2Circle` | `pmos2-circle.svg` |
| `analogNFet` | `analog-nfet.svg` |
| `analogPFet` | `analog-pfet.svg` |
| `analogNFetBulk` | `analog-nfet-bulk.svg` |
| `analogPFetBulk` | `analog-pfet-bulk.svg` |
| `analogNFetCenteredGate` | `analog-nfet-centered-gate.svg` |
| `analogPFetCenteredGate` | `analog-pfet-centered-gate.svg` |
| `analogPFetNoArrow` | `analog-pfet-no-arrow.svg` |
| `analogBiasedFet` | `analog-biased-fet.svg` |
| `analogBiasedFetBulk` | `analog-biased-fet-bulk.svg` |
| `analogBiasedFetCenteredGate` | `analog-biased-fet-centered-gate.svg` |
| `analogBiasedFetNoArrow` | `analog-biased-fet-no-arrow.svg` |
| `nfet2` | `nfet2.svg` |
| `pfet2` | `pfet2.svg` |
| `resistor` | `resistor.svg` |
| `resistorIEC` | `resistor-iec.svg` |
| `resistorVar` | `resistor-var.svg` |
| `resistorVarIEC` | `resistor-var-iec.svg` |
| `thermistor` | `thermistor.svg` |
| `photoresistor` | `photoresistor.svg` |
| `photoresistorIEC` | `photoresistor-iec.svg` |
| `fuseIEC` | `fuse-iec.svg` |
| `fuseUs` | `fuse-us.svg` |
| `capacitor` | `capacitor.svg` |
| `capacitor2` | `capacitor2.svg` |
| `capacitorPolar` | `capacitor-polar.svg` |
| `capacitor2Polar` | `capacitor2-polar.svg` |
| `capacitorVar` | `capacitor-var.svg` |
| `capacitorTrim` | `capacitor-trim.svg` |
| `lamp` | `lamp.svg` |
| `lamp2` | `lamp2.svg` |
| `breaker` | `breaker.svg` |
| `diac` | `diac.svg` |
| `diode` | `diode.svg` |
| `diodeFilled` | `diode-filled.svg` |
| `schottky` | `schottky.svg` |
| `diodeTunnel` | `diode-tunnel.svg` |
| `diodeShockley` | `diode-shockley.svg` |
| `zener` | `zener.svg` |
| `diodeTVS` | `diode-tvs.svg` |
| `varactor` | `varactor.svg` |
| `led` | `led.svg` |
| `led2` | `led2.svg` |
| `photodiode` | `photodiode.svg` |
| `voltageSource` | `vsource.svg` |
| `currentSource` | `isource.svg` |
| `motor` | `motor.svg` |
| `solenoid` | `solenoid.svg` |
| `fuse` | `fuse.svg` |
| `antenna` | `antenna.svg` |
| `opamp` | `opamp.svg` |
| `nand` | `nand.svg` |
| `and` | `and.svg` |
| `or` | `or.svg` |
| `nor` | `nor.svg` |
| `xor` | `xor.svg` |
| `xnor` | `xnor.svg` |
| `notNot` | `not-not.svg` |
| `schmitt` | `schmitt.svg` |
| `schmittNot` | `schmitt-not.svg` |
| `schmittAnd` | `schmitt-and.svg` |
| `schmittNand` | `schmitt-nand.svg` |
| `inverter` | `inverter.svg` |
| `buffer` | `buffer.svg` |
| `supplyNet` | `vdd.svg` |
| `ground` | `ground.svg` |
| `pinIn` | `pin-in.svg` |
| `pinOut` | `pin-out.svg` |
| `pinInOut` | `pin-io.svg` |

`shapes/shapes.json` owns SVG filenames, pane dimensions, terminal coordinates, and label anchors. This specification does not define a coordinate registry.

## MUX and DEMUX

`mux` and `demux` are digital devices, eligible only in mode `D`. They use a mandatory `size=2` or `size=4` parameter below the instance name:

```text
M2["M2<br/>size=2"]:::mux
M4["M4<br/>size=4"]:::mux
D2["D2<br/>size=2"]:::demux
D4["D4<br/>size=4"]:::demux
```

The size is the number of MUX data inputs or DEMUX data outputs. Missing, invalid, and conflicting sizes are rejected. Other label parameters retain their display-only behavior.

| Device | Size | Left data inputs | Right data outputs | Bottom selects |
| --- | --- | --- | --- | --- |
| `mux` | 2 | I0, I1 | O | S0 |
| `mux` | 4 | I0, I1, I2, I3 | O | S0, S1 |
| `demux` | 2 | I | O0, O1 | S0 |
| `demux` | 4 | I | O0, O1, O2, O3 | S0, S1 |

Data indices increase from top to bottom; select indices increase from left to right. `S0` is the least significant select bit, followed by `S1`. The binary select value identifies the numbered input or output; the renderer does not simulate selection.

All listed terminals exist and remain visible even when unconnected. Unconnected terminals acquire no inferred nets. Unsupported names, size-incompatible indices, and side qualifiers are rejected.

Use the existing named-terminal connection syntax without IC side qualifiers. Distinct data and select terminals remain separate unless authored connections join them. No enable, reset, clock, or inverted-select terminal is defined.

These devices use dynamic [trapezoid geometry](style.md#mux-and-demux-presentation). The read-only IC templates remain visual references, outside the 110-entry shape catalog.

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

The following accepted notation illustrates structural membership:

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

This example groups devices without defining electrical connections.

### Membership and hierarchy

1. A stage contains devices.
2. A block groups stages and may contain direct device declarations.
3. A stage may appear at diagram level or inside a block.
4. Stages do not contain other stages or blocks.
5. Blocks do not contain other blocks.
6. Nets remain declared outside subgraphs.
7. Each device belongs to at most one explicit stage.
8. Subgraph membership does not establish electrical connectivity.
9. All subgraphs inherit the enclosing diagram's `D` or `A` mode.
10. A subgraph cannot override diagram-mode eligibility.

These rules define the initial two-level grouping model, not reusable modules or arbitrary hierarchical circuits. Devices declared directly in a block share an implicit local stage, created at the first such declaration. Devices outside all subgraphs retain the implicit final-stage behavior defined in the [syntax rules](#syntax-rules).

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

Unconnected pin declarations, physical package numbering, and reusable IC definition and instance syntax remain future design work.

The `ic` type is authorable in mode `A`. Connections define its pin names and sides; repeated assignments must agree. Side qualifiers on catalog devices remain invalid.

Pin names may contain letters, digits, `+`, and `-`. Side qualifiers also apply to IC endpoints in direct device-to-device connections. No reusable IC definitions, package numbering, or arbitrary pin-order rules are implemented.

The renderer draws stage and block groups with their actual devices.

## Connection syntax

Connections are written from left to right in the stated direction of current flow. This is diagram notation, not electrical simulation or design-rule checking. The direction does not establish voltage polarity, current magnitude, or extra connections.

Each device endpoint names its terminal beside the device identifier. A terminal on the right endpoint may appear before or after that identifier:

```text
P0 |D| --- |S| P1
P0 |D| --- P1 |S|
```

Both forms connect `P0.D` to `P1.S` with the same stated direction. The reversed source-to-drain form, `P1 |S| --- |D| P0`, is invalid. Reordering whole statements in the document does not change electrical membership.

### Local op-amp negative feedback

The sole permitted direct same-device connection is an op-amp output to its own inverting input, written in this direction:

```text
U1 |out| --- |in1| U1
```

Both terminals belong to one implied net. Repeated declarations do not duplicate membership. All other direct same-device terminal pairs remain invalid, including the reversed form and connections to `in2` or either supply terminal.

A local return may instead pass through one explicitly connected `resistor` or `capacitor`:

```text
U1 |out| --- |A| RF
RF |B| --- |in1| U1
```

The passive component retains its ordinary device identity and two distinct terminal nets. Its position does not establish feedback. The return must connect the output and inverting input of the same op-amp.

A resistor from the inverting-input net to an explicitly declared ground forms the divider's ground leg. Neither that leg nor an external output is inferred. The [feedback presentation rules](style.md#local-op-amp-feedback) change drawing geometry without creating electrical connections.

This contract does not introduce positive feedback, arbitrary passive networks, general cycle routing, or electrical simulation.

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
| `pmos`, `pmosBlk`, `pmosDiode`, `pmosCircle`, `pmos2Diode`, `pmos2Circle`, `analogPFet`, `analogPFetBulk`, `analogPFetCenteredGate`, `analogPFetNoArrow`, `pfet2` | S | `supplyNet` |
| `nmos`, `nmosBlk`, `nmosDiode`, `nmosCircle`, `nmos2Diode`, `nmos2Circle`, `analogNFet`, `analogNFetBulk`, `analogNFetCenteredGate`, `nfet2` | S | `ground` |
| Any authorable MOSFET | G | `pinIn` |
| Any authorable MOSFET | D | `pinOut` |

The `analogBiasedFet`, `analogBiasedFetBulk`, `analogBiasedFetCenteredGate`, and `analogBiasedFetNoArrow` types have no source-polarity inference. Their source endpoints require explicit declarations unless another mapped connection establishes the endpoint. No MOSFET infers an endpoint from `B`.

An undeclared endpoint is created once, using its first mapped connection's type and its identifier as its label. Later references reuse that endpoint without changing its type, even when another connected terminal has a different inference mapping. Names such as `VDD` and `GND` do not determine type, and neither does the endpoint's written side.

Reordering connections can change which type is inferred first, but does not change net membership. An explicit endpoint declaration takes precedence over inference.

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

Direct source-to-source and source-to-drain connections are rejected; write drain-to-source connections in that order. No other terminal-pair restrictions are introduced. Unknown devices and terminals, unlabeled device endpoints, and direct endpoint-to-endpoint connections are rejected.

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

This creates one net containing `R1.B`, `R2.A`, and `R3.A`. Repeated statements do not duplicate terminal memberships. Reordering whole statements preserves net membership; it does not reverse their endpoints.

The following instead creates two distinct nets:

```text
R1 |B| --- |A| R2
R2 |B| --- |A| R3
```

`R2.A` and `R2.B` remain separate terminals. Device membership in a stage or block does not join them.

A group connected to one named external endpoint uses that endpoint's identity. Existing normalization rejects attempts to assign different named endpoints to the same terminal group. This checks identifier consistency, not electrical current or voltage.

Junction placement belongs to rendering and is outside the parser's responsibility.

### Antenna connections

Mode `A` accepts `antenna`. Its sole terminal `A` may be omitted on either endpoint, including forward references to its declaration. This resolves a device terminal; it does not infer a new external endpoint type.

```text
Antenna --- |A| L:Remote
```

### IC pin connections

An IC connection uses the same net-to-terminal notation as other devices.

The IC endpoint additionally identifies the side on which the named terminal appears.

```text
net --- |pinName| side:device
device:side |pinName| --- net
```

The permitted side identifiers are:

| Identifier | Side |
| --- | --- |
| `T` | Top |
| `B` | Bottom |
| `L` | Left |
| `R` | Right |

The side marker faces the connection. A source endpoint on the left uses `device:side`; a destination endpoint on the right uses `side:device`. The opposite marker position is invalid.

The side qualifier is part of the connection endpoint notation. It is not part of the device identifier or terminal name.

A connected IC pin has its name, electrical connection, and placement side established by one connection statement.

For example:

```text
A --- |IN1| L:U1
U1:L |IN1| --- A
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
circuitDiagram A

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
U1:R |OUT| --- Y

VDD --- |VCC| T:U1
U1:B |GND| --- VSS
```

This five-pin example is accepted in mode `A`. Each IC requires at least one connected named pin; unused sides need no pin. Repeated uses of a pin must retain its original side.

The five named terminals belong to the IC instance. Their sides are specified by their connection endpoints. Electrical connectivity is established by the corresponding nets.

Pins on each side retain their first connection-statement order. Their spacing and body dimensions follow [IC presentation](style.md#integrated-circuit-presentation). The example does not define physical package pin numbers or internal behavior.

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
10. Optional device parameters appear below the instance name, separated by `<br/>` in the label. Only MUX/DEMUX `size` parameters are interpreted, as defined in [MUX and DEMUX](#mux-and-demux).
11. Connections follow the [connection syntax](#connection-syntax); written left-to-right order states current-flow direction.
12. A device terminal connects to one net.
13. Nets connect to device terminals, not directly to other nets.
14. Subgraphs use the [typed declarations](#typed-subgraph-declarations) and terminate with `end`.
15. Stage names use camelCase.
16. Subgraphs follow the [membership and hierarchy rules](#membership-and-hierarchy).
17. Stages stack vertically in declaration order, except for parallel branches placed together under [Basic automatic drawing](style.md#basic-automatic-drawing).
18. `direction LR` selects left-to-right stage placement. It is the stored default when no direction is written; connectivity-based defaults are defined in [Basic automatic drawing](style.md#basic-automatic-drawing).
19. `direction TB` selects top-to-bottom stage placement. Digital dependency levels follow the [orientation rules](style.md#orientation).
20. Devices declared outside all subgraphs occupy an implicit final stage. Direct block devices follow the [membership rules](#membership-and-hierarchy).
21. There are no notation-level style declarations.

## Bulk semantics

All authorable three-terminal MOSFETs record an implicit bulk-to-source relationship. That relationship adds no rendered terminal or independently authorable bulk connection.

The explicit-bulk types are `pmosBlk`, `nmosBlk`, `analogNFetBulk`, `analogPFetBulk`, and `analogBiasedFetBulk`. Their `B` terminal connects independently through authored connections. Bulk connections must not be inferred from visual geometry.

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
    NMOS1 |D| --- |S| NMOS0
    NMOS1 |S| --- VSS
```

This fixture establishes parallel PMOS pull-up devices, series NMOS pull-down devices, shared input nets, an internal intermediate net, explicit supply and ground connections, named device terminals, and different stage placement directions.
