# Acknowledgements

This plugin uses code and artwork from [Schemdraw](https://github.com/cdelker/schemdraw), by Collin Delker and its contributors. Schemdraw uses the MIT license. Its full copyright and permission notice appears below.

## Drawing foundation

The port draws from these files at revision `e3cb52981f1ef297ddb083c9329ad89a6c8d1db4`:

- [schemdraw.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/schemdraw.py): ordered drawing composition, cursor movement, and saving and restoring cursor state.
- [elements/elements.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/elements/elements.py): explicit placement, reflection, named anchors, drop behavior, and basic label placement.
- [elements/lines.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/elements/lines.py): straight lines, the `-`, `-|`, and `|-` wire shapes, and filled dots.
- [transform.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/transform.py): local offset, scale, rotation, and global translation.
- [segments.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/segments.py): path, circle, text, bounds, and presentation data.
- [backends/svg.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/backends/svg.py): SVG elements with per-element drawing attributes.
- [LICENSE.txt](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/LICENSE.txt): upstream MIT notice.

The port uses SVG coordinates. X points right and Y points down. One matrix transforms both the artwork and its attachment points.

The drawing core reuses the existing TypeScript transforms, primitives, and catalog lookup. It supports manual composition and standalone SVG output. It does not port automatic lead extension, the full label API, other wire variants, or other backends.

It is not connected to the Mermaid renderer.

Catalog arc bounds use the endpoint-to-center conversion in the [SVG implementation notes](https://www.w3.org/TR/SVG/implnote.html#ArcConversionEndpointToCenter), with extrema calculated after the drawing transform. Bounds cover geometry rather than measured text or stroke extents.

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
