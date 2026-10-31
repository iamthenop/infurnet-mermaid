# Family-tree drawing

This document defines drawing behaviour for the [notation contract](notation.md).
The renderer consumes the semantic graph; placement never establishes parentage.

## Pedigree geometry

Generations run from top to bottom. Littermates share a row. The layout places
known parents and candidate sires above the relevant litter, preserving the
relationship's confirmed or uncertain status.

Generation ranks enforce the [declared biological distances](notation.md#generation-spans).
Empty ranks leave vertical space without adding ancestor nodes. Unknown spans
use the smallest feasible distance in stable graph order when several solutions
are possible.

Candidate sires sit as close above their litter as these constraints allow.
Birth dates order individuals within a row and never change generation ranks.

Each litter retains a separate junction, a vertical stem, a horizontal sibling
rail, and one vertical drop per kitten. Litters with the same parents remain
separate. A parent in several litters appears once.

There are no mating-pair
nodes or pair connectors.

Known, non-overlapping birth-date ranges constrain sibling order from oldest
to youngest. Partial or absent dates leave ordering unspecified; stable IDs
break ties. The layout never assigns missing dates.

Litter boxes are hidden by default. The standalone `renderFamily` option
`showLitterBounds: true` draws a dotted boundary for inspection. Mermaid rendering
uses the default hidden boundaries.

Litter labels remain available as SVG titles.

## Individuals

Every individual has a rounded rectangular nameplate, 36 SVG units high. Width
is at least 132 units and increases for longer labels. Plain nodes contain no
portrait circle or placeholder message.

A portrait is circular, with diameter equal to the nameplate width. The bottom
of the circle aligns with the vertical midpoint of the nameplate. The image uses
circular clipping and fills its square viewport with `xMidYMid slice`.

The
nameplate is drawn after the image, in the foreground.

Queen and tom nodes carry `♀` and `♂` beside the nameplate. These symbols do not
appear on connectors or cover the portrait or name. Human and unclassified nodes
carry no sex symbol.

Labels remain escaped SVG text, not embedded HTML.

## Connectors

| Relationship | Drawing |
| --- | --- |
| Queen to litter | Solid orthogonal line into the shared litter junction |
| Candidate sire to litter | Dashed orthogonal line into the shared litter junction |
| Litter to offspring | Solid stem, sibling rail, and individual vertical drops |
| Confirmed individual parentage | Solid orthogonal arrow to the kitten's nameplate side |
| Longer or unknown biological ancestry | Solid orthogonal arrow to the descendant's nameplate side |
| Adoption | Purple dashed arrow to the adoptee with an explicit `adopt` label |

Confirmed lines attach separately from the sibling rail. Repeated parents use
separate outgoing attachment points where needed. Long biological links and
adoption links can use outside routing lanes.

Crossing lines have no implied
genealogical meaning; dots mark litter junctions.

## Output and limits

Standalone SVG uses a white background and readable dark text and connectors.
Theme adaptation is not implemented. SVG IDs encode source IDs with a diagram
prefix, keeping clip paths separate across coexisting diagrams.

Rendering the
same semantic input with the same prefix produces identical SVG.

The layout uses `d3-dag` for initial placement, then preserves contiguous litter
blocks, date order, nameplate spacing, and pedigree routing. It does not promise
a crossing-free drawing or optimal packing for arbitrary colonies.

Genealogy
constraints that cannot fit aligned sibling rows produce a layout diagnostic;
the layout does not split an individual or invent ancestry to fit them.
This includes mutually circular candidate constraints: they remain uncertain
in the semantic graph, but cannot all be drawn above their possible offspring.
