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
  document once looked up. Also carries the always-on name label's placement
  (`labelAnchor` + `labelDirection`). Use `DiagramInstance.of({...})` — the
  option-based factory mirroring `Position.of` / `Connection.of` — to place a
  child _and_ position its label in one pass; the label anchor/direction go in a
  `label: { anchor, direction }` group, so no follow-up `SetChildLabelCommand` is
  needed:

  ```ts
  composite.addChild(
    DiagramInstance.of({
      id: 'inst-a', libraryId: 'south-400', x: 0, y: 0, angleDeg: 90,
      label: { anchor: 'center-left', direction: 90 }
    })
  );
  ```
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

In **box mode** (`meta.boxMode`) every resolved child is drawn as a box with one
uniform frame, `BOX_SIZE` by default, no matter how many feeders it has. That way,
grid-aligned boxes produce exactly straight ties. Feeders are spread along the box
perimeter, ordered by their compact SLD tips. To go back to content-derived boxes
(each one sized from its child's compact `BOX_CHILD_LAYOUT`), pass
`new CompositeLayoutEngine(undefined, undefined, undefined, { boxSize: null })`. The
floating router still snaps near-aligned ports within `ALIGN_TOLERANCE`, as a
fallback for unequal slot counts. `new OrthogonalRouter(STUB_LENGTH, 0)` disables
that snap.

Auto-routed lines (`orthogonal` and `curved`) keep out of every child box. If the
router's L/Z would cut through a box, a minimal-bend orthogonal search
(`composite/avoid.ts`) detours around all boxes, inflated by `OBSTACLE_CLEARANCE`.
In detail view a line ends at an arrow tip *inside* its own diagram, so each end
first leaves that diagram with a straight **escape stem** (out to the frame edge plus
the clearance, `Port.owner`). The diagram then stays an obstacle, so the route never
cuts back through the drawings it connects. Only diagrams that overlap so much that
an escape stem ends inside them are skipped. In box view, ports sit on the box edge
and keep the fixed `STUB_LENGTH` stub. A route with nothing in its way is left
unchanged.
Pass `{ avoidObstacles: false }` as the router's third argument to turn this off.
`straight` lines keep their stored vertices and are never re-routed.

The router also avoids small jogs:

- Facing ports closer than two stubs get their stubs capped at half the gap, so
  the route never doubles back on itself.
- Only box-edge ports snap into line (`ALIGN_TOLERANCE`). A detail-view arrow tip
  is a fixed point of its drawing, so a line always ends exactly on its arrow.
- After a detour, any jog shorter than `MIN_JOG` (two corner radii) is
  straightened when the run beside it can slide onto the other run's line without
  entering a box. That trades a little clearance for a straight line. Pass
  `{ minJog: 0 }` to keep every jog.

Parallel routes don't share a bend. Lines and auto-links that join the same two
box sides with a Z form a **bundle**: each one's mid-line jog gets its own lane,
`PARALLEL_LANE_SPACING` apart and centred on the midpoint, instead of all bending on
one shared line. Lanes are assigned so the routes nest without crossing (the order
with the fewest crossings wins; ties resolve the same way every layout). A route
alone on its pair of sides keeps its midpoint jog, so single lines don't move. The
offset only shapes the L/Z the router starts from: a detour around a box still wins.
Both views bundle: detail-view tips group by their own drawing.

`curved` routing takes exactly the `orthogonal` route and draws each bend as a
circular arc of `cornerRadius` (engine option, default `CURVE_RADIUS`), clamped to
half of each adjacent segment. A jog that remains and is shorter than two radii
(between two runs heading the same way) can't fit two full arcs, so it is drawn as
one smooth S-curve, a cubic Bézier `C`, instead of a tight wiggle. Arcs and curves
are plain path commands, so the export stays Office-safe.
Flow overlays still follow the sharp polyline, so their dots cut a corner by about
`r(√2−1)`.

A child can also be drawn as **several boxes**. Pass a
`boxSections: (instance) => { sections, ties } | null` resolver in the engine
options:

- Each section has a `key`, the feeder `connectionIds` drawn from it, and an
  opaque `data` value.
- The layout places the section boxes side by side (`BOX_SECTION_GAP` apart)
  inside the child's frame (`ChildLayout.boxes`). Each feeder attaches to its
  own section's box, and auto-facing turns each box toward its own peer.
- `ties` join pairs of boxes with a muted dashed run (`ChildLayout.ties`).
- `boxSubLabel(child, section)` labels each box. Core never knows why a child
  splits: the react-box example uses it for a double bus whose coupler is open.
- Returning `null` or a single section keeps one box. The detail view ignores
  the split.
- `sectionWorldCorners(child, key)` maps one section box through the child's
  transform (rotation included), the per-section counterpart of
  `ChildLayout.worldCorners`. The adapters use it to frame a hovered section.

A box view can also open one substation **in place**:
`engine.layout(doc, { expanded: [instanceId] })`.
- The expanded child gets its full detail drawing, centred on where its box
  sits (`ChildLayout.expanded`), and its feeders attach at the drawing's tips.
- Every other child stays a box.
- This is view state, passed per call, never stored in the document.
- The React `ChildDiagramView` animates any box ↔ detail switch (this, or the
  view toggle). The previous frame's outline morphs into the new one while the
  new content fades in, and re-routed lines fade in. `prefers-reduced-motion`
  disables it, and `animateMorph={false}` opts out.

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
  keep undo/redo intact, exactly like the child commands. Group a compound edit
  into one undo step with `BatchCommand` — e.g. remove a child together with
  `doc.linesAt(childId)` (every line anchored to it, or with a `connectionId`,
  to one feeder; also how an editor tells a used terminal from a free one).
- **Editing a child's internals** (e.g. toggling a bay's `Position.state` from a
  composite view): wrap the single-diagram command in
  `ChildDocumentCommand(instanceId, cmd)`. It runs against that child's
  resolved document as one step of the composite's history, and notifies the
  composite (`touchChild`) so views re-layout. So one `CommandStack<CompositeDocument>`
  covers both levels.
- **Export.** `CompositeSvgExporter` renders each line as a plain solid `<path>`
  (via the shared `connectionPath`), under the same Office-safe constraints —
  presentation attributes only, no markers/classes/`<style>`.
- **Labels.** A line can carry an opaque `data` channel, which is roundtripped
  but never read, like `SldElement.data`. To label lines, pass a
  `lineLabels: (line) => string[] | null` resolver in the engine options. The
  layout places the rows beside the line's arc-length midpoint (`ln.label`:
  rows, anchor and backing box). They sit right of a vertical run, centred above
  a horizontal one, and clear of a transformer glyph. The canvas and the
  exporter draw the same placement, so labels follow dragged boxes and both
  views. A label that would overlap other text, a line or a box is moved (see
  [Text collisions](#text-collisions)). `SetLineDataCommand` keeps `data` edits
  undoable. For the line's own name, see [Line names](#line-names).
- Unresolvable anchors (missing child/connection) are dropped; a line left with
  fewer than two points is simply not drawn (the model still keeps it), mirroring
  how dangling `libraryId`s render as placeholders.

`CompositeLayout.snapTips` lists every child's external connection dots in world
coordinates — the snap/convert targets an editor uses to draw an anchored end or
turn an existing auto-link into a line. Each tip sits exactly where a line
anchored to that feeder attaches: in box mode a perimeter point on the feeder's
effective side (`pin ?? auto-facing ?? authored`), in detail mode the SLD arrow
tip, so snap rings never drift from the lines they create.

## Line names

A tie-line is an entity in its own right: the connection id two children share
is the line's identity, and each child only labels *its* end with the far
substation ("WEST 1", "SOUTH 1"). To show the line's own name (e.g.
`L-400 kV West-South 1`), set **`CompositeLine.name`**. The core layout places
it (`CompositeLineLayout.nameLabel`: text, anchor point, `textAnchor`,
rotation, size), and both adapters and the exporter draw that same placement.
Names are always on: they ignore the labels-visibility toggle, like the diagram
name label.

### Placement

`CompositeLine.namePlacement` (default `middle` · `above` · `parallel`) is the
line analogue of a child's label slot:

- **`along`**: `start` | `middle` | `end`, at 20% / 50% / 80% of the line's arc
  length.
- **`side`**: `above` | `below` the line.
- **`orientation`**: `parallel` (along the segment, a small gap off the stroke),
  `perpendicular` (across it, growing away from the line) or `horizontal`
  (never rotated, beside the line).

The rules that keep a name readable:

- **Reading frame, not vertex order.** `start` and `above` are measured with
  the line walked left to right (bottom to top when vertical), whatever order
  its vertices were drawn in. "Above" means the side above the text as it
  reads along the local segment: up on a horizontal run, left on a vertical
  one. So swapping the two diagrams a line joins re-derives the same visual
  spot, and the text still reads correctly.
- **Never upside-down.** Rotated text is normalized to read left to right
  (`readableAngle`). A run within `VERTICAL_READING_TOLERANCE` (10°) of
  vertical reads bottom to top, so a hand-drawn "vertical" leaning a fraction
  of a degree past vertical doesn't flip its text. Beyond that band the
  rotation follows the segment, so a perpendicular name on a slightly tilted
  run may read top to bottom.
- **Never on a short jog.** If the target point lands on a segment too short
  for the name (a small dog-leg of an orthogonal route), the name moves to the
  nearest segment long enough to hold it (`roomyPointAtFraction`), or onto the
  longest segment when none fits.
- **Clear of glyphs.** At `middle`, a transformer line's name keeps clear of
  its two-circle glyph.
- **Stored placement first.** The name sits where `namePlacement` says unless
  that spot collides; then it moves (see [Text collisions](#text-collisions)).

### Text collisions

**Hanging-tie labels go first** (box view). The ties leaving one box edge are
arranged together, sorted along it, and the first clear arrangement wins (else
the cheapest): every lead at its default length; alternate leads lengthened one
row (`HANGING_STAGGER_STEP`, room for a label grown to the zoom-aware ceiling,
see below; a zig-zag); or, on a vertical edge, a staircase
where each label leans away from the longer leads beside it (`textAnchor`
`start` or `end`), which fits however close the ties sit. The lead is the
label's leader, so a staggered tie draws nothing extra; its glyph moves out
with it and must stay clear too. A lone tie can lengthen its lead to dodge a
line or box. A staggered tie records it in `stagger`.

Then, after every line is placed, the layout walks the lines in document order
and checks each text (the `lineLabels` rows, then the name), clear of the final
hanging ties and their labels too. A text whose default
slot is clear never moves, and nothing is ever hidden. Otherwise it is moved to
the cheapest of these slots:

1. **Beside its line:** the same spot on the other side, or sliding along the
   line, nearest first, up to 0.4 of its length each way (both sides at each
   step, never closer than 8% to an end).
2. **A callout,** only when no spot beside the line is clear: the text sits
   further out, one `CALLOUT_STEP` (8 px) at a time up to 12 rows, at spots
   spread along the line every 0.1 of its length. A thin leader joins it back
   to its own line and ends in a dot on it. This is what a line sandwiched in a
   tight parallel group gets (ties 14 to 16 px apart leave no room beside it):
   the callouts sit side by side just outside the group, each with its leader
   crossing the neighbouring lines.

What a slot costs: overlapping another text costs most, then a box or glyph,
then a line or leader (with a few px of room for the stroke). A callout costs a
little on its own, so a clear spot beside the line always wins, plus a hair per
row out, so the nearest clear row wins. Its leader crossing a neighbouring line
is nearly free; crossing another text, box or leader is not. The result is
deterministic and runs in core, so both canvases and the export agree. A spatial
grid keeps it cheap: a few ms on a 60-substation grid, about 25 ms on top of the
layout when every tie runs in a labelled bundle of three.

A moved text records where it went: `ln.labelSlot` / `ln.nameSlot` (arc
fraction, side and, for a callout, `offset`). A callout carries
`label.leader` / `nameLabel.leader` (`TextLeader`: `points` + `dot`), drawn as a
`LEADER_STROKE_WIDTH` stroke at `LEADER_OPACITY` with a `LEADER_DOT_RADIUS` dot,
in the line's colour on the canvases. `lineNameLayout` honours `nameSlot`, so a
zoom-aware canvas resizing a name keeps it (and its leader) in its slot. The
pass runs at the layout size; texts grown on screen stay apart through their
growth caps (see the zoom-aware texts below). Text widths are estimated (0.6 em
per character, erring wide), so the checks are conservative.

### Size

- **Normal size:** the engine option `lineNameFontSize` (world units, default
  `LINE_NAME_FONT_SIZE` = 12). Match it to the labels around the lines, e.g. 16
  in box view to match the rating rows. The gap from the line scales with it.
- **Fit to the line:** a name is never wider than `LINE_NAME_MAX_LINE_FRACTION`
  (90%) of its line's longest straight run, bends ignored (`lineNameFitSize`),
  so it shrinks on short lines. It stops shrinking at
  `LINE_NAME_MIN_SCALE` (half the normal size) and overhangs a very short line
  rather than becoming unreadable (`fittedLineNameSize`). Text has no DOM to
  measure in core, so widths are estimated (0.6 em per character, erring wide);
  in practice a name at the limit fills about three quarters of its line.
- **Zoom-aware names (canvas, opt-in):** pass `lineNameScreenSize={{ minPx }}`
  to `CompositeCanvas`. When zoomed out, each name grows to at least `minPx` on
  screen, so it stays readable from afar, but never past its line's limit
  (`nameLabel.maxFontSize`). Zoomed in, it keeps its layout size and scales
  with the drawing, in sync with the labels around it. The canvas re-places
  names per zoom through `readableLineNameSize` + `lineNameLayout`, without
  re-running the layout. The export has no zoom, so it always uses the layout
  size.
- **Zoom-aware texts (canvas, opt-in):** `textScreenSize={{ minPx, maxSize }}`
  does the same for every line text: rating rows, line names and hanging-tie
  labels. Zoomed out, each grows to at least `minPx` on screen, up to one
  ceiling for every kind, `maxSize` world units (default `TEXT_GROWTH_MAX_SIZE`,
  20, level with the diagram name label), so grown texts read as one consistent size
  and keep their proportion to the drawing. Each also stops wherever it would
  start touching something it was clear of (another text, a line, a leader, a
  box or a glyph), so the arranged texts never overlap again. Staggered
  hanging-tie rows are sized for the ceiling (`HANGING_STAGGER_STEP`), so a
  crowded box edge's labels grow as far as any other. The canvas computes the
  caps once per layout (`textGrowthCaps`, a largest font size per text, with
  neighbours checked at the same common size) and re-places the texts per zoom
  (`readableTexts`, through `lineLabelLayout`, `lineNameLayout` and
  `hangingLabelLayout`, so moved texts, callouts and staggered ties keep their
  slots). A name is still held to its line. It supersedes `lineNameScreenSize`
  when both are set. Computing the caps adds about 2 ms per layout on a
  60-substation grid, 14 ms when every tie runs in a labelled bundle of three.

### Editing

- **`SetLineNameCommand(id, before, after)`** renames a line and/or moves its
  name (`{ name?, placement? }` snapshots; an absent name clears it), undoable
  like `SetChildLabelCommand`.
- **Naming an auto-link** materializes it: `CompositeLine.fromLink(link, { name,
  namePlacement })` builds a straight line anchored at both shared feeders, with
  id = the shared connection id. Adding it with `AddLineCommand` is one undo
  step. It suppresses and visually replaces the auto-link (the same chord), and
  deleting it brings the unnamed auto-link back. An editor falls back to a fresh
  id if a line already took the connection id.
- **Export.** `CompositeSvgExporter` writes each name as a plain `<text>`,
  wrapped in a `rotate` group only when rotated, with presentation attributes
  only (Office-safe). Composites without names export byte-for-byte as before.

## Large composites

Tools for composites with tens or hundreds of children. The engine options are
opt-in, so a small composite lays out exactly as before.

### Geographic placement

A diagram can say where it is: `meta.location: { lat, lng }` on `DocumentMeta`,
in decimal degrees. It's optional, validated on load (dropped unless both values
are finite and in range) and roundtripped, with no schema bump. Location is a
fact about the diagram's real-world site, so it lives on the diagram; the
composite only stores where each child is drawn.

To place many children from their locations:

```ts
const anchors = projectLocations(docs.map((d) => d.meta.location!)); // north up
const topLeft = arrangeByAnchors(
  docs.map((d, i) => ({ id: d.meta.id, anchor: anchors[i], size: boxSizeOf(d) })),
  { gap: 100, compaction: 0.6 }
);
```

`arrangeByAnchors`:

1. puts items with the same anchor side by side (e.g. two voltage levels of one site);
2. blends each axis toward its rank order: `compaction` 0 keeps the true
   proportions, 1 spaces items evenly. Either way, the order along each axis is
   kept, so who sits west / north of whom doesn't change;
3. scales so neighbours sit about one box apart, capped (above 0) at a few times
   the boxes' own area;
4. pushes remaining overlaps apart with `removeOverlaps`.

It returns top-left points with the arrangement starting at (0, 0). Nothing here
reads a document, so the same helpers work for any rectangles.

`removeOverlaps(items, { gap, fixed, expand })` separates overlapping rectangles
with the smallest moves: each overlapping pair is pushed apart along the axis
it overlaps least, in the order it already has. `fixed` ids never move.
`expand` (on by default) first spreads a dense crowd out uniformly, which
settles large piles much faster.

### Detail spread

A child's `x` / `y` is one point shared by both views, but a full drawing is
much bigger than its box. Laid out from the same points, detail drawings would
overlap. With `new CompositeLayoutEngine(…, { detailSpread: { gap } })`:

- the stored position stays the **box-view** position;
- in detail view, each drawing is centred on its box centre, and overlapping
  drawings are pushed apart at layout time. Nothing is persisted, and the export
  (same engine) matches the screen;
- `layout(doc, { fixed })` keeps the given children put (e.g. the one being
  dragged, so its neighbours make room instead);
- `child.spreadOffset` is how far a drawing was moved. Adding it to the child's
  `x` / `y` makes the shown spot the stored one, so a drag starting in detail
  view doesn't jump.

Auto-facing derives feeder sides from the box centres, before the spread, so a
feeder leaves on the same side in both views.

### Locks

`DiagramInstance.locked` (optional, saved; absent = unlocked) pins a child's
position: its stored `x` / `y` is exact in **both** views, and no layout
algorithm moves it. The detail spread keeps it fixed, and so does Tidy unless
asked to include locked children. A lock is about position only: the child's
lines still route, and it can still be deleted or expanded in place. It belongs
to the placement in this composite, not to the diagram.

`SetChildrenLockedCommand(ids, locked)` takes a list of ids, ready for
multi-select, and restores each child's previous state on undo. An app that
locks a child shown displaced by the spread should first move its `x` / `y` to
the shown spot (`spreadOffset`), so both views agree.

### Frozen layout and Tidy

By default every `layout()` is solved from scratch: every line re-routes around
every box, and the detail spread re-solves. On a large composite, a drag then
re-routes lines far from the dragged box and shifts drawings that weren't
touched. `{ freeze: true }` makes layouts change only where the document did:

- a line keeps its last route until one of its **own** end ports changes;
  another box moving across it doesn't re-route it;
- in detail view, a drawing whose frame didn't change keeps its spot and holds
  still; only moved or new drawings are placed, around the others.

The state is kept per composite, inside the engine. `engine.invalidate(doc?)`
forgets it.

Tidy re-runs the algorithms on demand:

```ts
const cmd = tidyCommand(doc, engine, { includeLocked: false });
if (cmd) stack.execute(cmd, doc); // else nothing moved; routes were still re-solved
```

It always re-routes every line and re-solves the spread. In box view it also
pushes overlapping boxes apart (gap `TIDY_BOX_GAP`). In detail view with
`includeLocked`, locked drawings join the spread and their new spots are
stored; they stay locked. Position changes come back as one undoable command;
re-solved routes are view state, with nothing to undo.

One known limit: a drawing placed between two drawings that hold still, with
no room for it, can stay overlapping until the next Tidy.

### Structural sharing

`layout()` always hands back the same `ChildLayout` object for a child that
came out the same as in the engine's previous layout of that composite (same
instance and drawing, same placement). A child's drawing is reused until its
document changes (the engine subscribes to each child document it draws).
Renderers can skip unchanged children by identity: React `memo`, Vue
`shallowRef`, Svelte `immutable`. Treat layouts as read-only.

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

- **`DiagramInstance.labelAnchor`** — one of eight discrete slots named
  `{vertical}-{horizontal}` (`top-left`, `top-center`, `top-right`,
  `center-left`, `center-right`, `bottom-left`, `bottom-center`,
  `bottom-right` — `center-center` is omitted). Slots are semantic to the
  child's *own* frame, so "top-left" stays the diagram's own top-left corner
  whatever its `angleDeg`. Default `top-left`.
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
(currently **2**) and `kind: 'composite'`, reusing `SldParseError`. The
composite schema is early-stage and **current-only**: its version was reset
(older shapes are rebuilt, not migrated), and later additions — line `kind`,
`meta.boxMode`, `portDirections`, `meta.autoFacing`, line `data`, `name` and
`namePlacement`, and a child's `locked` — are all optional fields under v2, so
v1 documents load unchanged. A version **newer** than the current one is rejected with
`Unsupported composite version N (maximum: 2)`, including documents saved
under the old, pre-reset numbering (e.g. `version: 3`), which the library
can't interpret. An app should surface that message rather than a generic
"not found"; the Svelte example offers to rebuild a seeded demo.
Dangling `libraryId`s (and dangling line anchors) are legal — they render as
placeholders / are dropped rather than failing the parse.
