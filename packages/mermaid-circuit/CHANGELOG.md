# Changelog

## 0.1.1 — source release candidate

The code for this release is in [PR #23](https://github.com/iamthenop/infurnet-mermaid/pull/23). Version `0.1.1` has not been published to npm.

### Added

- Ten logic and Schmitt variants.
- Eight resistor and fuse variants.
- Nine capacitor and two-terminal load symbols.
- Ten diode variants.
- Twenty-one MOSFET variants.
- Four fixed MUX/DEMUX configurations: two-way and four-way selection for each device.
- A five-terminal op-amp.
- Local op-amp negative-feedback routing, with a direct return or one ordinary resistor or capacitor.
- Op-amp examples for open-loop use, a voltage follower, and a non-inverting amplifier. Two examples omit supply connections.

### Fixed

External MUX/DEMUX select inputs now route to bottom select terminals in the default LR layout. Separate S0 and S1 rows preserve the required terminal approach.

### Candidate inventory

| Item | Value |
| --- | ---: |
| Authorable object types | 83 |
| Registered SVG symbols | 110 |
| Circuit fixtures | 17 |
| Saved SVG references | 51 |
| Mermaid peer version | 12.2.0 |

All saved SVG references are checked without being rewritten. The package check includes the changelog. It tests the installed tarball in an isolated app.

### Known routing limitations

The renderer has no global layout search. Ordinary routes support straight wires and the two one-bend forms; unsupported routes fail explicitly.

Local feedback support is limited to the approved return from an op-amp output to its own inverting input. It does not add positive feedback, arbitrary passive networks, or general cycle routing.

The select-input fix covers separate external inputs; arbitrary shared-net arrangements remain unverified.

The package draws circuits and checks their connections. It does not simulate how they behave. See the package README for [implemented behavior](README.md#implemented-behavior) and the specifications for [notation](spec/notation.md) and [drawing rules](spec/style.md).

## 0.1.0 — published

Version `0.1.0` is published on npm. The changes listed above belong to the `0.1.1` source release candidate.
