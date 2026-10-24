# Acknowledgements

This plugin uses code and artwork from [Schemdraw](https://github.com/cdelker/schemdraw), by Collin Delker and its contributors. Schemdraw uses the MIT license. Its full copyright and permission notice appears below.

## Drawing foundation

The source audit uses revision `e3cb52981f1ef297ddb083c9329ad89a6c8d1db4`. The relationship is limited to the adaptations below; this plugin is not a port of Schemdraw's drawing engine.

| Source | Plugin code | Basis and behavior kept | Changes and gaps |
| --- | --- | --- | --- |
| [`Transform.transform` and `transform_array`, transform.py:12–53](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/transform.py#L12-L53) | [`Transform`, geometry.ts](src/drawing/geometry.ts) | Algorithmic adaptation: local shift, axis scaling, rotation, then global shift; point-array mapping. | An affine matrix replaces chained point operations and checks for finite SVG coordinates. Python object APIs are not ported. |
| [`Segment.xform` and `get_bbox`, segments.py:125–158](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/segments.py#L125-L158) | [`Transform.applyAll`, `bounds`, `transformBounds`, geometry.ts](src/drawing/geometry.ts) | Conceptual adaptation: transformed points and bounds for finite paths without arrows. | Independent bounds helpers validate input and transform rectangle corners. Arrow padding, segment classes, and inherited styles are not ported. |
| [`SegmentText`, segments.py:250–429](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/segments.py#L250-L429), [`SegmentCircle`, 552–680](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/segments.py#L552-L680), [`SegmentPath`, 945–1049](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/segments.py#L945-L1049) | [`Presentation` and `Primitive`, svg.ts](src/drawing/svg.ts) | Conceptual adaptation: paths, circles, text, visibility, and per-element styles. | A tagged union replaces classes; SVG matrices retain transforms without flattening them. Arc/Bezier/image APIs, style inheritance, arrow generation, and text layout are not ported. |
| [`Figure.xform` and `plot`, svg.py:222–277](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/backends/svg.py#L222-L277), [`circle`, 363–375](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/backends/svg.py#L363-L375), [`path`, 458–479](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/backends/svg.py#L458-L479) | [`serializePrimitive`, svg.ts](src/drawing/svg.ts) | Independent code emits SVG paths, circles, and text, informed by the backend’s use of these shapes. | It retains SVG coordinates and insertion order. Unit conversion, Y inversion, clipping, z-order sorting, full documents, and backend text layout are not ported. |
| [`Element._place`, elements.py:395–479](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/elements/elements.py#L395-L479) | [`resolveSymbol`, symbols.ts](src/drawing/symbols.ts), [`place`, layout.ts](src/drawing/layout.ts) | Conceptual correspondence: the same transform positions artwork and named anchors. | Catalog SVGs and fixed panes replace Python element definitions. Anchor-driven cursor placement, shared defaults, and element labels are not ported. |
| [`Element2Term._place`, elements.py:911–1056](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/elements/elements.py#L911-L1056) | [`layout.ts`](src/drawing/layout.ts) | No port. The plugin places devices from the circuit model and its own drawing rules. | Lead extension, `to`/`tox`/`toy`, and drawing-cursor behavior are not ported. |
| [`Drawing.add`, schemdraw.py:320–340](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/schemdraw.py#L320-L340), [`_drawsvg` and `draw`, 461–515](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/schemdraw.py#L461-L515) | [`renderer.ts`](src/renderer.ts), [`layout.ts`](src/drawing/layout.ts), [`routing.ts`](src/drawing/routing.ts) | Independent code places and routes circuits, then draws them through Mermaid. | No `Drawing` port. Cursor state, backend selection, interactive plotting, and drawing-stack behavior are not ported. |

### Coordinate checks

Schemdraw uses Y-up coordinates before its SVG backend scales and negates Y. The plugin works in canvas space, where positive angles turn clockwise.

For a visual comparison, reflect point and translation Y coordinates and negate the rotation angle. Apply the same conversion to the local offset. Axis scale factors stay unchanged.

The source audit compared the pinned upstream transform with compiled TypeScript across 105 configurations. These covered rotations, reflections, unequal scales, zero scale, local offsets, and global shifts. The 840 point comparisons included the SVG coordinate conversion.

It also compared 105 transformed rectangle bounds against upstream segment bounds. The maximum absolute difference was about `5.69e-14` in both checks.

These checks cover the listed geometry only. They do not test layout or routing against Schemdraw.

## Symbol artwork

The SVG files adapt Schemdraw's [electrical elements](https://schemdraw.readthedocs.io/en/stable/elements/electrical.html) and [ICs](https://schemdraw.readthedocs.io/en/stable/elements/intcircuits.html). Each file keeps its source link and MIT notice.

The build copies the registered SVGs as strings. It keeps all text and notices intact. The nine IC templates stay outside this bundle.

## Schemdraw MIT notice

The following is Schemdraw's full notice from the pinned upstream revision:

```text
Copyright (c) 2014-2026 Collin J. Delker

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

## Mermaid

[Mermaid](https://github.com/mermaid-js/mermaid) provides the host diagram engine and plugin API. It was created by Knut Sveidqvist and is maintained by the Mermaid contributors. This plugin uses Mermaid as a peer dependency under the [MIT license](https://github.com/mermaid-js/mermaid/blob/develop/LICENSE).
