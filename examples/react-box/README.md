# @sld-kit-examples/react-box

A private Vite + React demo of the **grid-level "box" view**: a simplified
single-line diagram where each substation/bus is a voltage-coloured **box**
(name + integer bus id) and the connections between them are drawn as orthogonal
lines carrying a _kind_ — overhead (solid), cable (dashed), transformer
(two-circle glyph) or demand (triangle terminus).

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
  anchored to box terminals (`externalConnectionTips`) so they follow a moved box.
- **Orthogonal drawing** — the draw tool constrains new lines to horizontal /
  vertical segments via `orthogonalizePolyline`.
- **Office-safe export** — `CompositeSvgExporter` with `boxMode`, `boxFill` and
  `boxSubLabel` produces a PowerPoint-pasteable SVG.

## Floating-connector router (`src/box/`)

The box/detail toggle used to break: line geometry was stored per-view (fixed
connectors, a fixture alignment pass, an absolute demand point), so a path valid
in one view stranded the demand or dived into a box in the other. `src/box/` is a
self-contained, OOP **floating-connector router** — an example-local prototype of
`docs/requirements/simplified-sld-box/floating-connectors-plan.md`, kept out of
the published packages for now:

- **`PortResolver`** turns a `(instanceId, connectionId)` reference into a
  floating `Port` (`{ point, side }`) resolved to the **active view's frame** — a
  box-perimeter point (spread across same-side feeders by slot) in box mode, the
  **SLD arrow tip** in detail mode. Nothing is stored; ports recompute per layout.
- **`OrthogonalRouter`** stubs out of each port perpendicular to its side, then
  joins with a Manhattan L/Z (near-aligned facing ports snap to a straight
  trunk). A demand is a node-relative **lead** — a stub off its feeder, never an
  absolute point.
- **`BoxLayoutEngine` extends `CompositeLayoutEngine`**, reusing the child layout
  but overriding line resolution with the router. Because it subclasses the core
  engine, `new CompositeSvgExporter(boxEngine)` exports the *same* routed geometry
  — screen and export stay in lock-step.

The result: the same document lays out cleanly in **both** views with no stored
per-view geometry (the fixture's `alignVertical` + demand-point hacks are gone).

Everything the app decides — voltage colours, the bus-id label, the active line
kind, dialogs — lives here, not in the package: the components only emit semantic
callbacks (the adapter contract).
