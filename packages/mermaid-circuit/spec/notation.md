# Notation for circuit diagrams

This specification records the approved syntax and electrical semantics of `circuitDiagram`. It does not claim that circuit parsing or rendering is implemented. The NAND2 example below is a specification fixture, not an acceptance requirement for the header-only scaffold.

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

Digital logic symbols are eligible in `D`. Electrical device-level symbols are eligible in `A`. Shared shapes are eligible in both modes.

Shape eligibility is recorded in `shapes/shapes.json` using `allowedModes`.

Mode eligibility does not make a catalog-only shape authorable. A shape must also have an approved notation type and terminal contract.

Electrical connectivity is defined by nets and named device terminals in either mode. Rendering does not establish connectivity.

The current header-only implementation does not parse the new mode declarations. Mode parsing, eligibility enforcement, and rendering are subsequent implementation work.

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

When implemented, `shapes/shapes.json` owns SVG filenames, pane dimensions, terminal coordinates, and label anchors. This specification does not define a coordinate registry.

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
11. Connections use `net ---|terminal| device`.
12. A device terminal connects to one net.
13. Nets connect to device terminals, not directly to other nets.
14. A stage is declared with `subgraph stageName` and terminated with `end`.
15. Stage names use camelCase.
16. Stages do not nest.
17. Only devices belong inside stages.
18. Stages stack vertically in declaration order.
19. `direction LR` places stage devices side by side and is the default.
20. `direction TB` stacks stage devices vertically.
21. Devices declared outside all stages occupy a final stage.
22. There are no notation-level style declarations.

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

    subgraph pullUp
        direction LR
        PMOS0["PMOS0"]:::pmos
        PMOS1["PMOS1"]:::pmos
    end

    subgraph pullDown
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
