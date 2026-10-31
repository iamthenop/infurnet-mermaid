# Dependencies and acknowledgements

## Layout evaluation

The initial evaluation inspected [d3-pedigree-tree 1.1.1](https://github.com/solgenomics/d3-pedigree-tree) under MIT, including its source at revision
`f799b499c8019cfccd550d4297196e365c208d5c`. It supports multiple parents; it is
not restricted to two-parent families.

Its sibling group IDs derive from the
parent ID list, and its link junctions are keyed by those groups. Directly mapping
individuals would therefore combine the two Maybelle/Sancho litters.

Adding
litter nodes avoids that merge but introduces another automatic sibling-group
layer, whose generated links would then need to be bypassed. The API also uses
uniform node spacing rather than individual nameplate and portrait bounds.

The implementation instead selects [d3-dag 1.2.2](https://github.com/erikbrinkman/d3-dag)
under the workorder's approved fallback. Its typed DAG API accepts explicit
litter nodes, per-node sizes, and layer constraints. Sugiyama placement supplies
an initial horizontal ordering.

The plugin then packs litter blocks, respects
birth ordering, and builds its own junctions and orthogonal connectors.

The dependency determines no biological meaning. The parser and validator own
individual identity, litter membership, uncertainty, and adoption. No code or
artwork was copied from d3-pedigree-tree.

## Runtime license inventory

This table records the selected dependency and its installed transitive closure
from the workspace lockfile. These packages retain their upstream notices in
npm distributions. Mermaid 12.2.0 is a separately installed MIT-licensed peer.

The package does not vendor or bundle their source files.

| Package | Version | License |
| --- | --- | --- |
| convert-hrtime | 5.0.0 | MIT |
| d3-array | 3.2.4 | ISC |
| d3-dag | 1.2.2 | MIT |
| function-timeout | 1.0.2 | MIT |
| get-own-enumerable-keys | 1.0.0 | MIT |
| identifier-regex | 1.1.0 | MIT |
| internmap | 2.0.3 | ISC |
| is-identifier | 1.1.0 | MIT |
| is-obj | 3.0.0 | MIT |
| is-regexp | 3.1.0 | MIT |
| javascript-lp-solver | 1.0.3 | Unlicense |
| make-asynchronous | 1.1.0 | MIT |
| p-event | 6.0.1 | MIT |
| p-timeout | 6.1.4 | MIT |
| quadprog | 1.6.1 | MIT |
| reserved-identifiers | 1.2.0 | MIT |
| stringify-object | 6.0.0 | BSD-2-Clause |
| super-regex | 1.1.0 | MIT |
| time-span | 5.1.0 | MIT |
| type-fest | 4.41.0 | (MIT OR CC0-1.0) |
| web-worker | 1.5.0 | Apache-2.0 |

## d3-dag notice

```text
MIT License

Copyright (c) 2018 Erik Brinkman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


## Example artwork

The illustrative cat portrait in `examples/fixtures/cat.svg` is original
repository artwork distributed under this package's [MIT license](LICENSE).
