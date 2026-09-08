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
- **`useCommandStack`** — undo/redo button state.
- **`SldCanvas`** — pan (drag / wheel / space+drag), zoom (Ctrl/Cmd+wheel,
  two-finger pinch), selection with shift-multi-select, and the imperative ref
  (`zoomIn` / `zoomOut` / `zoomToFit`).
- **The overlay slots** — `LaneOverlay` in `background`; `GridOverlay` and
  `GhostPreview` in `children` while a placement tool is active.
- **Commands** — `AddPositionCommand` on click-to-place, `DeleteElementsCommand`
  on the selection, both undoable.
- **Export** — office-safe SVG and JSON via `SvgExporter` / `Serializer`, saved
  with the adapter's `downloadText`.
- **Theming** — the `--sld-pos` token contract in `src/app.css`, with a dark-mode
  toggle proving the colors are entirely app-side.

## Scope

This app tracks the port: it currently uses its own minimal header instead of
`SldToolbar`, which lands with Phase 2 of the React port. Drag-to-move, lane
insertion, dialogs and composites arrive with their components — see the
[parity table](../../packages/README.md#component-status).
