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

## What it shows

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

## Scope

The `connection` tool sets the active tool and shows the hint bar, but its
canvas interaction (multi-step source→target endpoint picking and the
`ExternalAssetPopover` flow) is deferred — it's editor orchestration, not a
library gap. `ExternalAssetPopover` and `LaneActionChip` are exported and
built; the `ssr-smoke.mjs` test renders them directly. Composites arrive with
their components — see the
[parity table](../../packages/README.md#component-status).
