# Composite diagrams ("diagram of diagrams")

A **composite** places several single diagrams on one canvas, each with a rigid
body transform (translate + rotate). It is a sibling document type to
`SldDocument`, with its own model, layout engine, serializer, and exporter — it
does not extend the single-diagram path, so it carries zero risk to it.

## Model

- **`CompositeDocument`** — `meta` + an ordered map of children. Mutations are
  command-driven, exactly like `SldDocument`.
- **`DiagramInstance`** — one placed child: a `libraryId` (a reference to a
  library diagram), a per-composite instance `id` (the same diagram may be
  placed twice), and a transform `(x, y, angleDeg)`. It caches its `resolved`
  document once looked up.
- **`DocumentResolver`** — how a composite finds a child's JSON by `libraryId`.
  Your app implements it over its store; `MapResolver` is provided for tests and
  demos. A resolver that returns a `kind: 'composite'` document is treated as
  unresolvable — this closes the composite-in-composite door at the core level.

## Resolution and layout

```ts
composite.resolveChildren(resolver); // resolve every child's libraryId → SldDocument
const layout = new CompositeLayoutEngine().layout(composite);
```

`CompositeLayoutEngine`:

1. Lays out each resolved child with the ordinary `LayoutEngine`, then places it
   under its `Transform2D`. Unresolved children get a fixed placeholder frame so
   they stay selectable and movable.
2. **Auto-links** children: two _external_ endpoints in different children that
   carry the **same connection id** are the same physical asset, so a dashed
   link is drawn between their world positions. This is how a 400 kV and a
   220 kV level connect through a shared autotransformer without any manual
   wiring.

## `Transform2D`

A rigid transform: rotate `angleDeg` about a child-local `pivot` (typically the
layout center), then translate by `(x, y)`. `apply` maps child-local → composite
coordinates; `invert` does the reverse for hit-testing; `toSvgTransform()`
produces the single `transform` string used by both the live `<g>` and the SVG
export, so a child renders identically on screen and exported.

## Export

`CompositeSvgExporter` renders each child inside a rotated `<g>` via
`SvgExporter.renderContent`, under the same Office-safe constraints as the
single-diagram exporter (a rotated `<g>` of plain shapes is safe; no nested
`<svg>`). Labels counter-rotate so names stay horizontal under a rotated child.

## Serialization

`CompositeSerializer` is a sibling of `Serializer` with its own version
(currently **1**) and `kind: 'composite'`, reusing `SldParseError`. Dangling
`libraryId`s are legal — they render as placeholders rather than failing the
parse.
