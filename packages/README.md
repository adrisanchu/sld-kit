# Packages

The published `@sld-kit/*` packages: one **headless engine** and a **framework adapter**
per UI library.

| Package            | npm               | What it is                                                                                                             |
| ------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`core`](core)     | `@sld-kit/core`   | Document model, layout, undo/redo commands, JSON, PowerPoint-safe SVG export. Zero deps, ESM-only, framework-agnostic. |
| [`svelte`](svelte) | `@sld-kit/svelte` | Svelte 4 components: headless pan/zoom canvas, element views, editor chrome.                                           |
| [`react`](react)   | `@sld-kit/react`  | React 18/19 components: the same surface, ported 1:1 from the Svelte adapter.                                          |

Adapters never fork the engine — they render what `@sld-kit/core` computes and declare it
as a **peer dependency**, so a consumer installs both:

```bash
npm install @sld-kit/core @sld-kit/react   # or @sld-kit/svelte
```

## The adapter contract

Every adapter follows the same rules. They are what make the packages swappable and what
any new adapter (Vue, Svelte 5) must honour.

- **No dialogs, no persistence, no routing.** Components emit semantic events
  (`select`, `editlabel`, `settool`, `settype`, `matrix`, `delete`, …); the host app
  decides what to do. Dialogs live in the app, never in the package.
- **No bundled UI kit.** Zero runtime dependencies. The only icon dependency is a peer
  (`lucide-svelte` / `lucide-react`).
- **Injectable strings.** Every visible string ships an English default and is overridable
  through a `labels` prop, so apps localize without forking.
- **Injectable theming.** Colors come from the consumer's CSS. Components emit one class
  per position type (the `tokens` map, default `sld-pos-*`) and paint against the
  `--sld-pos` custom property that class sets. Dark mode and re-theming are app-side.
- **Numbers vs. colors.** `SldViewStyle` owns every stroke width, opacity, dash pattern
  and handle radius; CSS owns every color. Keep the split.

> **Tailwind purge warning.** Adapters emit Tailwind utility classes but ship no Tailwind
> config. The consuming app **must** include the built package in its Tailwind sources or
> the diagram loses its colors. Tailwind v3: add to `content`. Tailwind v4:
> `@source "../node_modules/@sld-kit/react/dist";`

## Component status

Status legend: ✅ complete · 🚧 in progress · ⬜ pending

### Canvas + element views

| Component        | What it does                                                                                                                                                                                                                                        | Svelte 4 | React |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :---: |
| `SldCanvas`      | The `<svg>` host of a single diagram. Owns the pan/zoom viewBox and renders every element view in z-order (connections → bars → positions).<br>Emits selection, drag and raw canvas-point events; takes overlay slots above and below the elements. |    ✅    |  ✅   |
| `PositionView`   | Draws one `Position` as a rounded, type-colored box with a centred label and an optional dashed selection halo.<br>Emits `select` / `dragstart` on pointerdown and `editlabel` on double-click; dims while being dragged.                           |    ✅    |  ✅   |
| `BusBarView`     | Draws one `BusBar` as a thick filled bar spanning its row, with a bold label at the left overhang.<br>Colors via `currentColor` so a `colorClass` (e.g. a voltage bucket) can retint it; no drag.                                                   |    ✅    |  ✅   |
| `ConnectionView` | Draws one `Connection`: the orthogonal path with hop arcs, plus optional arrowhead, junction dot, asset glyph and label.<br>Carries an invisible fat hit stroke so thin lines stay easy to click.                                                   |    ✅    |  ✅   |
| `GhostPreview`   | Translucent snapped preview of the position being placed or dragged, centred in the target slot.<br>Green outline when the drop is valid, dashed red when rejected.                                                                                 |    ✅    |  ✅   |
| `GridOverlay`    | Edit-mode layer outlining every free slot with a dashed rounded rect.<br>Tints the drop target green/red and the cells a reflow would displace amber; draws the bus-bar insertion boundary line.                                                    |    ✅    |  ✅   |
| `LaneOverlay`    | Row/column selection chrome: full-height column hit bands, row highlight bands and numbered handle tabs in the left margin.<br>Adds dashed "+" affordances at the grid edges; emits `selectlane` / `addlane`.                                       |    ✅    |  ✅   |

### Editor chrome (event-dispatching, no dialogs)

| Component              | What it does                                                                                                                                                                                                                                         | Svelte 4 | React |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :---: |
| `SldToolbar`           | The floating bottom pill: zoom, export, color-mode and label-mode controls, plus an edit cluster (select, grid, bar, position, connection, delete, undo/redo).<br>Owns the keyboard shortcuts and shows a hint bar while a placement tool is active. |    ✅    |  ⬜   |
| `PositionTypeFlyout`   | Chevron split-button that opens a list of position types, each with its color dot.<br>Emits `settype`; the parent owns the active type.                                                                                                              |    ✅    |  ⬜   |
| `MatrixCreatorFlyout`  | Word-style 8×8 grid-size picker; hovering highlights the top-left rectangle.<br>Emits `create` with the chosen rows × columns.                                                                                                                       |    ✅    |  ⬜   |
| `ExportFlyout`         | Two-item menu card offering "Export JSON" and "Export SVG".<br>Shared by both the single and composite toolbars.                                                                                                                                     |    ✅    |  ⬜   |
| `ExternalAssetPopover` | Absolutely-positioned form shown when a connection ends in the margin: asset-kind select plus an optional free-text label.<br>Emits `confirm` / `cancel`; Enter and Escape are wired.                                                                |    ✅    |  ⬜   |
| `LaneActionChip`       | Floating info chip for the selected row/column: title, occupancy summary, close and delete buttons.<br>Delete stays disabled with a reason tooltip while the lane is occupied.                                                                       |    ✅    |  ⬜   |

### Composite ("diagram of diagrams")

| Component           | What it does                                                                                                                                                                                                                 | Svelte 4 | React |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :---: |
| `CompositeCanvas`   | The `<svg>` host of a composite: dashed auto-links, manual lines, every placed child, and the selected line's bend handles.<br>Adds draw-mode chrome (snap rings, draft polyline) and emits the full line-editing event set. |    ✅    |  ⬜   |
| `CompositeExplorer` | Read-only "operate and watch" wrapper over `CompositeCanvas`: click a child to fly into it, click the background to fly out.<br>Injects the flow and line-label overlays; emits `elementactivate` and `focuschange`.         |    ✅    |  ⬜   |
| `CompositeToolbar`  | The composite equivalent of `SldToolbar`: fit, export, color/label modes, plus draw-line, import, delete and undo/redo.<br>No placement tools and no edit-mode toggle.                                                       |    ✅    |  ⬜   |
| `ChildDiagramView`  | Renders one placed child diagram under its `Transform2D`, reusing the element views with labels kept upright.<br>Falls back to a dashed "Diagram not found" placeholder; supports focus and dim states.                      |    ✅    |  ⬜   |
| `SelectionFrame`    | Figma-style selection chrome around the selected child: dashed polygon through its world corners plus corner dots.<br>Carries the rotation handle that emits `rotatestart`.                                                  |    ✅    |  ⬜   |

### Flow overlays (generic, domain-agnostic)

| Component          | What it does                                                                                                                                                                                      | Svelte 4 | React |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :---: |
| `FlowOverlay`      | Animates travelling dots along any set of world-space polylines, driven by a consumer `FlowResolver`.<br>Pure CSS `stroke-dashoffset` motion, with `paused` and `prefers-reduced-motion` freezes. |    ✅    |  ⬜   |
| `LineLabelOverlay` | Draws a rounded contrast pill with a value at a fraction along each line, driven by a `LineLabelResolver`.<br>Auto-rotates to the line angle without ever reading upside-down.                    |    ✅    |  ⬜   |

### Modules (non-component public API)

| Module                      | What it does                                                                                                                                                 | Svelte 4 | React |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------: | :---: |
| `panzoom`                   | Framework-agnostic viewBox mechanics: wheel pan, Ctrl/Cmd+wheel and pinch zoom, space-pan, `zoomToFit`, eased `flyTo` tweens.                                |    ✅    |  ✅   |
| document binding            | Bridges a core document's `subscribe()` into the framework's reactivity.<br>Svelte: `createDocStore`. React: `useSldDocument` (version counter — see below). |    ✅    |  ✅   |
| command-stack binding       | Tracks `canUndo` / `canRedo`. Svelte: subscribe inline. React: `useCommandStack`.                                                                            |    ✅    |  ✅   |
| `style` (`SldViewStyle`)    | Numeric presentation config — stroke widths, opacities, selection halo, handle radii — deep-merged over `DEFAULT_VIEW_STYLE`.                                |    ✅    |  ✅   |
| `format` (`FormatResolver`) | The per-element styling seam; pass the same function to the exporter's `theme.resolveElementFormat` so screen and export agree.                              |    ✅    |  ✅   |
| `labels`                    | Every English default string plus the `positionTokens` class map.                                                                                            |    ✅    |  ✅   |
| `download`                  | `downloadText` + `slugify` for client-side export.                                                                                                           |    ✅    |  ✅   |
| `flow` types / `worldLines` | `FlowStyle` / `FlowResolver` / `LineLabel` types, and flattening a `CompositeLayout` into world-space polylines.                                             |    ✅    |  ⬜   |

## Porting an adapter

The React port is a behavioural 1:1 of the Svelte one. These conventions are the written
contract for the next adapter.

| Svelte 4                                  | React                                                         |
| ----------------------------------------- | ------------------------------------------------------------- |
| `export let x = d`                        | destructured prop with a default                              |
| `createEventDispatcher` + `on:select`     | `onSelect?: (detail) => void` callback prop                   |
| `$:` derived value                        | `useMemo`                                                     |
| `bind:this` + `export function`           | `forwardRef` + `useImperativeHandle`, exported `*Handle` type |
| `<slot name="background" />` / `<slot />` | `background?: ReactNode` / `children`                         |
| `svelte/store` writable                   | internal observable + `useSyncExternalStore`                  |
| `<svelte:window on:keydown>`              | `useEffect` + `window.addEventListener`                       |
| `transition:fade` / `transition:slide`    | CSS transitions (no animation library)                        |
| `lucide-svelte/icons/zoom-in`             | `import { ZoomIn } from 'lucide-react'`                       |
| `{ ...DEFAULTS, ...labels }`              | the same, inside `useMemo`                                    |

Four differences are load-bearing — a naive port gets them wrong:

1. **Document binding cannot be identity-based.** `SldDocument` and `CompositeDocument`
   mutate **in place**; `subscribe` never yields a new object. Svelte's `set(doc)` with the
   same reference still notifies, React's `Object.is` check does not. React therefore
   subscribes to a **monotonic version counter** (`useSldDocument`) and derives layout with
   `useMemo(..., [doc, version])`.
2. **`CommandStack.subscribe` invokes its callback immediately** on subscribe — unlike
   document `subscribe`, which does not. Any binding must tolerate that.
3. **Wheel must be non-passive.** The canvas calls `preventDefault()` on wheel, which
   React's synthetic `onWheel` cannot do reliably; attach it with
   `addEventListener('wheel', handler, { passive: false })`.
4. **Two-way bound props become controlled pairs.** `SldToolbar.editMode` and
   `CompositeExplorer.focusedId` are mutated inside the Svelte components; React exposes
   `editMode` + `onEditModeChange` and `focusedId` + `onFocusChange`.

### One intentional styling divergence

`@sld-kit/svelte` targets Tailwind v3 / shadcn-svelte, whose tokens are **HSL triplets**,
so it writes `hsl(var(--sld-pos) / 0.15)`. `@sld-kit/react` targets Tailwind v4 / shadcn,
whose tokens are **full colors** (oklch). The React adapter therefore:

- treats `--sld-pos` and `--sld-pos-<type>` as complete CSS colors — `var(--sld-pos)`, not
  `hsl(var(--sld-pos))`;
- applies alpha with the SVG `fill-opacity` / `stroke-opacity` presentation attributes
  rather than baking it into the color function, which keeps it color-space agnostic.

The class-map contract is otherwise unchanged: `positionTokens` maps a type to a class, and
that class sets `--sld-pos`. Consumers port their token stylesheet by swapping triplets for
whole colors; nothing else changes.
