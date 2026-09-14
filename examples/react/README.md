# @sld-kit-examples/react

A Vite + React SPA demonstrating [`@sld-kit/react`](../../packages/react) over
[`@sld-kit/core`](../../packages/core). **`private: true` — never published.**

Like its Svelte sibling it doubles as an integration test: it builds against the
local packages through `workspace:*`, so a breaking change to the adapter's
public API breaks this app's typecheck in CI.

All data is **fictional** — an invented "Example" 400 kV substation built with
the declarative `buildDocument` API.

## Running

```bash
pnpm install
pnpm run build              # build the packages first (core → react)
pnpm run dev:example:react  # http://localhost:5175
```

The header toggles between two views: the single-diagram **Editor** and the
composite **Overview**.

## Editor view

- **`useSldDocument`** — the version-counter bridge, driving a
  `useMemo(() => engine.layout(doc), [engine, doc, version])` chain.
- **`useCommandStack`** — drives the toolbar's undo/redo enabled state.
- **`SldCanvas`** — pan (drag / wheel / space+drag), zoom (Ctrl/Cmd+wheel,
  two-finger pinch), selection with shift-multi-select, and the imperative ref
  (`zoomIn` / `zoomOut` / `zoomToFit`).
- **`SldToolbar`** — the floating editor chrome, fully wired: view controls,
  color-mode (by type ↔ by voltage), label-mode cycle, and — in edit mode —
  select, matrix (grid reset via `SnapshotCommand`), bus-bar and position
  placement, the `PositionTypeFlyout`, delete and undo/redo. It internally uses
  `PositionTypeFlyout`, `MatrixCreatorFlyout` and `ExportFlyout`.
- **The overlay slots** — `LaneOverlay` in `background` (lane add via
  `AddLaneCommand`); `GridOverlay` and `GhostPreview` in `children` while a
  placement tool is active.
- **Commands** — `AddPositionCommand`, `AddBusBarCommand`, `AddLaneCommand`,
  `DeleteElementsCommand`, `SnapshotCommand`, all undoable through the toolbar.
- **Export** — office-safe SVG and JSON via `SvgExporter` / `Serializer`, saved
  with the adapter's `downloadText`.
- **Theming** — the `--sld-pos` token contract in `src/app.css`, with a dark-mode
  toggle proving the colors are entirely app-side.

## Overview view (`Overview.tsx`)

A "diagram of diagrams": a 400 kV level above a 220 kV level, auto-linked by
their shared TIE feeder id.

- **`CompositeExplorer`** — read-only "operate & watch": click a diagram to fly
  into it, click the background (or the fit button) to fly back out. Internally
  drives `CompositeCanvas`, `ChildDiagramView`, `FlowOverlay` and
  `LineLabelOverlay`.
- **Flow overlay** — a domain-agnostic `resolveFlow` animates travelling dots on
  every wire (a toy random-but-stable model), and `resolveLineLabel` puts a
  "120 MW" pill on the tie. `paused` toggles the motion.
- **`worldLines`** — flattens the `CompositeLayout` into the world-space
  polylines the two overlays consume.

## Scope

Two things are covered by `ssr-smoke.mjs` rather than the interactive app, since
they belong to heavier editor orchestration:

- The `connection` tool sets the active tool and shows the hint bar, but its
  multi-step source→target picking and the `ExternalAssetPopover` flow are
  deferred. `ExternalAssetPopover` and `LaneActionChip` are exported and
  smoke-tested directly.
- The composite **editor** path (`CompositeToolbar`, `SelectionFrame`, child
  drag/rotate, draw-line) is smoke-tested; the app demonstrates the read-only
  explorer instead.

See the [parity table](../../packages/README.md#component-status) — the React
adapter is now at full parity with Svelte.
