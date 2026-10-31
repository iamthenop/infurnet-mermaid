# Family-tree notation

This is the notation contract for the catmode implementation commissioned by
[Issue #24](https://github.com/iamthenop/infurnet-mermaid/issues/24), with the
owner's approved notation resolutions and [PR #25 R2](https://github.com/iamthenop/infurnet-mermaid/pull/25)
generation spans. Drawing rules live in [style.md](style.md).

## Declaration

Start with `familyTree TB`, then `catmode`. Omitting `TB` also selects top-to-bottom
layout. Version 1 requires catmode and supports only this direction.

```text
familyTree TB
    catmode
    Rose["Rose"]:::queen
    Stanley["Stanley"]:::tom
    subgraph L1["Litter 1"]
        Braus["Fräulein Bräuß"]:::queen
        Jimmy
    end
    Rose --> L1
    Stanley --> L1
```

Newlines or semicolons separate statements. `%%` starts a comment outside a
quoted value. Labels and metadata accept semicolons or `%%` inside quotes.

Metadata objects can span lines. Strings accept single or double quotes, with
backslash escapes for the matching quote and for backslash itself.

## Individuals and classes

Identifiers start with a Unicode letter or underscore. Later characters can
also be digits or hyphens. IDs are case-sensitive.

Repeated references denote one individual. Labels default to the ID; repeated
labels must agree.

`ID["Label"]`, `ID:::queen`, and `ID["Label"]:::tom` declare individuals.
`class A,B queen` applies a class to existing or newly referenced individuals.
Multiple `:::` suffixes are supported.

Classes are retained in the model.
Only `queen`, `tom`, and `human` have built-in meaning; they are mutually exclusive.

Unclassified individuals can have biological ancestry edges. A parent connected
to a litter needs `queen` or `tom`; direct edges do not infer a reproductive role.

Custom classes do not change styles or reproductive roles.

## Metadata

Use `ID@{ img: "cat.jpg", birth: "2025-06" }`. Metadata may follow a label,
appear in a separate declaration, or precede or follow inline classes.

| Property | Accepted value |
| --- | --- |
| `img` | Relative or HTTP(S) image URL, or base64 PNG, JPEG, GIF, or WebP data URL |
| `birth` | Gregorian `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, with year 0001–9999 |

Dates must be valid at their stated precision. Metadata keys other than these
two are rejected. Repeated values must agree.

Image URLs must be nonempty and
contain no literal whitespace or control characters; percent-encode URL spaces.
The parser checks reference syntax, not image availability.

Missing image files
do not prevent the diagram from rendering. Relative URLs resolve in the host page
or standalone SVG's location.

Biological relationships determine generation. Birth dates constrain ordering,
never ancestry. Edge notation declares generation distances as described below.

## Litters

`subgraph L1["Litter 1"]` through `end` declares one litter. Its body contains
only offspring declarations. Put parents and relationships outside the litter.

An individual can occur in only one birth litter. Parent references outside
that litter preserve the individual's identity.

Litters have zero or one declared queen, zero or more candidate sires, and zero
or more offspring. A litter without a queen receives its own unknown queen.
Unknown queens from separate litters remain distinct.

A litter ID cannot also
name an individual. Nested or repeated litter declarations are rejected.

## Relationships

| Source notation | Meaning |
| --- | --- |
| `Queen --> Litter` | Biological maternity for that litter |
| `Tom --> Litter` | Candidate sire for that litter |
| `Parent --> Kitten` | Confirmed individual biological parentage |
| `Ancestor ---> Descendant` | Biological ancestry spanning exactly two generations |
| `Ancestor ----> Descendant` | Biological ancestry spanning exactly three generations |
| `Ancestor -*-> Descendant` | Biological ancestry spanning an unknown positive number of generations |
| `Human -.->\|adopt\| Cat` | Adoption, independent of biological ancestry |

Arrow endpoints accept node labels, classes, and metadata. Chains such as
`A --> B --> C` expand into adjacent relationships. Repeating an identical edge
does not create another relationship.

A litter cannot be an edge source.
Adoption endpoints are individuals; adoption can also connect cats.

Confirmed parentage overrides uncertainty only for the named individual.
It never confirms paternity for littermates. The semantic model retains the
litter's candidate edges even when an individual's paternity is confirmed.

Confirmed maternity similarly replaces a litter-specific unknown for that
individual's ancestry. It cannot contradict a declared litter queen.

Omitting sires means unknown paternity; it creates no father node. A node labelled
`Unknown` is an ordinary individual with its own ID. Only references to that ID
reuse it.

Adoption does not change birth-litter membership, reproductive roles,
or biological generation.

## Generation spans

Between individuals, `-->` spans exactly one generation. Each additional dash
adds one generation: `--->` spans two and `---->` spans three.
The parser stores the positive integer distance without adding intermediate individuals.

`-*->` asserts ancestry with an unknown positive span. Other biological paths
can constrain its distance; otherwise layout uses the smallest valid separation.
The declared span remains unknown in the semantic graph even when layout fixes
its distance.

All biological paths must agree. This graph is valid:

```text
familyTree TB
    catmode
    A --> B
    B --> C
    A ---> C
```

Replacing the last edge with `A --> C` creates a conflict. Diagnostics identify
the conflicting edges. An unknown span must also fit the other constraints while
remaining positive.

Longer and unknown ancestry edges do not declare immediate parentage. They do
not replace a litter's candidate sires or count as another confirmed parent.
Only ordinary `-->` is accepted for biological edges into litters.

Span notation never creates placeholder ancestors, changes endpoint IDs, or
reverses ancestry. Adoption contributes no biological distance constraint.

## Diagnostics

Parsing fails on unsupported statements, missing delimiters, or conflicting
declarations. Validation rejects multiple litter queens, multiple confirmed
parents of the same reproductive role, repeated birth-litter membership, and
biological ancestry cycles, including self-parentage. A candidate sire cannot
be a descendant of a possible offspring through confirmed ancestry.

Human individuals may participate in adoption, but not cat biological ancestry
or cat birth litters. Diagnostic messages name the affected IDs; errors tied to
source statements also include their parser line number.

Full flowchart syntax is not supported: `classDef`, arbitrary edge labels,
other node shapes, nested subgraphs, and styling directives are rejected.
