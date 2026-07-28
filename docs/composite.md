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

## Manual lines

Auto-links are convenient but always straight and dashed — they can't express a
real interconnection's route (bends, crossings, parallel runs sharing towers).
A **`CompositeLine`** is a first-class, command-driven entity (a sibling of
`DiagramInstance`) that draws that route explicitly: a straight-segment polyline
of `vertices`, each either a free `point` (fixed in composite coordinates) or an
`anchor` that references a child's external connection dot by
`(instanceId, connectionId)`.

- **Anchors follow their child.** An `anchor` vertex is resolved at layout time
  to the same world point the auto-link would use (`transform.apply` of the
  connection's arrow tip), so moving or rotating a child drags its anchored line
  ends along while free bends stay put — the "reference by id, never geometry"
  invariant, applied to lines.
- **Manual takes precedence.** Any connection id claimed by a line's anchor is
  removed from the auto-link pass, so a manual line replaces the dashed link for
  that id. Everything else still auto-links.
- **Commands only.** `AddLineCommand` / `RemoveLineCommand` / `UpdateLineCommand`
  keep undo/redo intact, exactly like the child commands.
- **Export.** `CompositeSvgExporter` renders each line as a plain solid `<path>`
  (via the shared `connectionPath`), under the same Office-safe constraints —
  presentation attributes only, no markers/classes/`<style>`.
- Unresolvable anchors (missing child/connection) are dropped; a line left with
  fewer than two points is simply not drawn (the model still keeps it), mirroring
  how dangling `libraryId`s render as placeholders.

`CompositeLayoutEngine.externalConnectionTips(children)` lists every child's
external connection dots in world coordinates — the snap/convert targets an
editor uses to draw an anchored end or turn an existing auto-link into a line.

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
`<svg>`). Labels ride with the child transform, applying a local `{0, 180}`
flip (`labelFlipDeg`) so they stay aligned with the rotated diagram's own axis
yet never read upside-down — they do not counter-rotate to horizontal.

### Diagram name label

Each child carries an always-on identifying label (`ChildLayout.name` /
`nameLabel`): the resolved diagram's `meta.name`, or the `libraryId` for an
unresolved placeholder. It is rendered larger and **bold** so it stands apart
from the element (position/bus/connection) labels.

Its placement is stored **on the instance**, relative to the child's own frame,
so it rides every move and rotation:

- **`DiagramInstance.labelAnchor`** — one of six discrete slots (`top-left`,
  `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right`).
  Slots are semantic to the child's *own* frame, so "top-left" stays the
  diagram's own top-left corner whatever its `angleDeg`. Default `top-left`.
- **`DiagramInstance.labelDirection`** — an extra quarter-turn rotation
  (0/90/180/270) of the label relative to the child, so the name can read along
  a different axis than the diagram (e.g. vertical). Default 0.

`CompositeLayoutEngine.resolveNameLabelLayout` resolves both into `nameLabel`
(`{ x, y, textAnchor, rotation, fontSize }`), where `rotation = labelDirection +`
a `{0, 180}` readability flip so the text never reads upside-down once the
child's own rotation and the direction combine. The label is drawn inside the
child's transform group and additionally rotated by `rotation` about its anchor.

Because the frame and label rotate together, keeping the label **inside** the
frame is a purely local problem: the anchor is pinned to the slot's edge and the
`text-anchor` is chosen so the text grows *into* the frame rather than out of the
corner — at any `rotation`, including when the readability flip would otherwise
sweep it out. (A very long name may still overflow the far edge, exactly as a
horizontal element label does.)

Placement is edited through **`SetChildLabelCommand`** (before/after slot +
direction snapshots), so it is undoable and serialized. The label is
**independent of the labels-visibility toggle** (on by default; the Svelte view
exposes `showChildNames` and dispatches `labeldown` when the name is pressed so
the consumer can cycle the slot / rotate it). It renders identically on screen
and in the Office-safe export (plain `<text>`, presentation attributes only).

## Serialization

`CompositeSerializer` is a sibling of `Serializer` with its own version
(currently **3**) and `kind: 'composite'`, reusing `SldParseError`. Older
documents upgrade transparently: v1 → v2 (before manual lines) adds an empty
line list; v2 → v3 adds per-child name-label placement, defaulting each child to
`labelAnchor: 'top-left'` / `labelDirection: 0`. Dangling `libraryId`s (and
dangling line anchors) are legal — they render as placeholders / are dropped
rather than failing the parse.
