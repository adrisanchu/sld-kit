# @sld-kit-examples/react-box

A private Vite + React demo of the **grid-level "box" view**: a simplified
single-line diagram where each substation/bus is a voltage-coloured **box**
(name + integer bus id) and the connections between them are drawn as orthogonal
lines carrying a _kind_ — overhead (solid), cable (dashed), transformer
(two-circle glyph) or demand (triangle terminus).

**[▶ Live demo](https://adrisanchu.github.io/sld-kit/box/)**

It is built entirely on `@sld-kit/core` + `@sld-kit/react` by **extending the
composite** ("diagram of diagrams"): each box is a real child `SldDocument`
rendered in box mode; toggling box/detail (or an explorer fly-in) reveals the
full SLD underneath. The fixture is entirely **fictional** — invented names and
bus ids, no real network data.

```bash
pnpm --filter @sld-kit/core build     # adapters resolve core types from dist
pnpm run dev:example:react-box        # Vite dev server on http://localhost:5176
pnpm run build:example:react-box      # static SPA → examples/react-box/dist
pnpm --filter @sld-kit-examples/react-box test   # headless SSR smoke test
```

## What it demonstrates

- **Box mode** (`CompositeCanvas boxMode` + `boxSubLabel`) — children collapse to
  boxes coloured by voltage via `childColorClass`; the detail toggle swaps them
  for their internals.
- **Line kinds** — `CompositeLine.kind` drives the stroke and glyph; lines stay
  anchored to box terminals (`layout.snapTips`) so they follow a moved box.
- **Orthogonal drawing** — the draw tool constrains new lines to horizontal /
  vertical segments via `orthogonalizePolyline`.
- **Uniform boxes** — every box shares the core `BOX_SIZE` frame, so grid-aligned
  boxes give exactly straight ties.
- **Numeric line labels** — `LINE_RATINGS` readings are folded into each
  `CompositeLine.data`, like the power-flow example's readings. They hold
  fictional seasonal capacities (`[winter, spring, summer, autumn]`, either all
  four filled or winter + summer only) and transformer MVA ratings. The engine's
  `lineLabels` resolver (`ratingLabels`) formats them into rows: `winter/spring`
  over `summer/autumn`, or a single `winter/summer` row. The core layout places
  them. Lines without a reading have no label.
- **Double bus + coupler** — CHARLIE has two bars, each carrying its own bus id
  in `data`. Switching state is core's first-class `Position.state` (absent =
  closed). The open coupler gets core's default faded, dashed look with no app
  code. `src/topology.ts` (example-local, not core) walks the topology through
  `effectiveState`: closed positions join what they touch, open ones conduct
  nothing. Bars joined that
  way form one **bus section**. The engine's `boxSections` hook (`boxSplit`)
  draws one box per section. The coupler starts **open**, so CHARLIE shows as
  two boxes (`39770` toward ALPHA; `39771` toward DELTA and a demand) joined by
  a muted dashed tie. With the coupler closed they merge into one box,
  `39770 / 39771`. Lines whose feeder is de-energised are drawn grey on screen
  and in the export. One format resolver returns `{ stroke }` for them, used
  as the canvas `formatResolver` and the export's `theme.resolveElementFormat`. In the detail view each bar is labelled
  with its bus id instead of `BB1`/`BB2`. The child `LayoutEngine` gets a
  `busBarLabel` resolver and `busBarLabelAnchor: 'center-left'`, so the id sits
  beside the bar and never runs into a stem.
- **Three tools** in the toolbar: **Operate** (`O`), **Move** (`V`, the
  default) and **Draw** (`L`).
  - **Operate** reuses the adapter's explore mode (`explore`, `focusedId`,
    `onChildFocus`, `onElementActivate`). In box view, clicking a substation
    *expands it in place* (core `layout(doc, { expanded })`): the box morphs
    into its drawing while the camera flies in. In detail view it just flies
    in. Then click a position to open or close it. A click outside or Escape
    collapses back.
  - **Move** drags substations (in both views), selects and deletes lines,
    and pins feeder sides.
  - **Draw** adds lines.
  - Each toggle is a core `ChildDocumentCommand` wrapping an
    `UpdateElementCommand` on `Position.state`, so it's one step in the same
    undo/redo history as box moves and line edits.
  - Switch back to the box view and CHARLIE splits or merges to match. Its
    lines grey out when their bay is open.
  - The box view stays a read-only projection of switch state; you drag boxes
    and draw lines there.
- **Office-safe export** — `CompositeSvgExporter` with `boxMode`, `boxFill` and
  `boxSubLabel` produces a PowerPoint-pasteable SVG.

## Floating-connector routing (in core)

Line geometry isn't stored per view. `CompositeLayoutEngine` resolves each
endpoint to the **active view's frame** at layout time — a box-perimeter point in
box mode, the SLD arrow tip in detail mode — so the same document lays out
cleanly in both. The pieces live in `@sld-kit/core` (`packages/core/src/composite/`):

- **`PortResolver`** turns an `(instanceId, connectionId)` reference into a
  floating `Port` (`{ point, side }`), spread across same-side feeders by slot.
- **`OrthogonalRouter`** stubs out of each port perpendicular to its side and
  joins them with a Manhattan L/Z. A demand is a node-relative lead off its feeder.
- A feeder's exit side follows a `COALESCE`: per-instance pin, then
  `meta.autoFacing`, then the child's authored direction.

Because routing happens in the layout engine, `CompositeSvgExporter` exports the
same geometry the canvas draws.

Everything the app decides — voltage colours, the bus-id label, the active line
kind, dialogs — lives here, not in the package: the components only emit semantic
callbacks (the adapter contract).
