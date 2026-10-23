# Acknowledgements

This plugin uses code and artwork from [Schemdraw](https://github.com/cdelker/schemdraw), by Collin Delker and its contributors. Schemdraw uses the MIT license. This package's [LICENSE](LICENSE) retains its copyright and permission notice.

## Drawing foundation

The port draws from these files at revision `e3cb52981f1ef297ddb083c9329ad89a6c8d1db4`:

- [transform.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/transform.py): local offset, scale, rotation, and global translation.
- [segments.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/segments.py): path, circle, text, bounds, and presentation data.
- [backends/svg.py](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/schemdraw/backends/svg.py): SVG elements with per-element drawing attributes.
- [LICENSE.txt](https://github.com/cdelker/schemdraw/blob/e3cb52981f1ef297ddb083c9329ad89a6c8d1db4/LICENSE.txt): upstream MIT notice.

The port uses SVG coordinates. X points right and Y points down. One matrix transforms both the artwork and its attachment points.

## Symbol artwork

The SVG files adapt Schemdraw's [electrical elements](https://schemdraw.readthedocs.io/en/stable/elements/electrical.html) and [ICs](https://schemdraw.readthedocs.io/en/stable/elements/intcircuits.html). Each file keeps its source link and MIT notice.

The build copies the registered SVGs as strings. It keeps all text and notices intact. The nine IC templates stay outside this bundle.
