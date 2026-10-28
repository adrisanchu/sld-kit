# @sld-kit/react

React components for single-line (electrical) diagrams, built on
[`@sld-kit/core`](../core). A headless pan/zoom **canvas**, the **element
views** that paint the core's computed geometry, and the event-dispatching
editor **chrome** — the React sibling of [`@sld-kit/svelte`](../svelte).

The components are deliberately **headless and unopinionated**:

- **No dialogs, no persistence, no routing.** Components emit semantic
  callbacks (`onSelect`, `onEditLabel`, `onCanvasDown`, …); the host app decides
  what to do — open its own dialogs, persist to a store, etc.
- **No bundled UI kit.** Zero runtime dependencies; only `lucide-react` icons.
- **Injectable strings.** Every visible string ships an English default and is
  overridable through a component's `labels` prop, so apps localize without
  forking.
- **Injectable theming.** Colors are supplied by the consumer's CSS. Components
  emit a class per position type (the `tokens` map, default `sld-pos-*`) and
  reference CSS custom properties (`--sld-pos`, `--primary`, `--muted-foreground`,
  …). The consumer's stylesheet provides the actual values, so dark mode and
  re-theming are entirely app-side.

> **Port status:** at full parity with `@sld-kit/svelte`: canvas and element
> views, editor chrome (toolbar, flyouts, popovers, lane chip), composite
> ("diagram of diagrams") primitives and flow overlays. It also ships the
> grid-level **box view** (`boxMode`, line kinds, `SymbolGlyph`, orthogonal
> routing, port-direction override), which the Svelte adapter doesn't have yet.
> See the [component parity table](../README.md#component-status).

## Install

```sh
npm install @sld-kit/react @sld-kit/core lucide-react react react-dom
```

`@sld-kit/core`, `lucide-react`, `react` and `react-dom` are peer dependencies.
React 18 is the floor (the document binding uses `useSyncExternalStore`). The
bundle carries a `"use client"` directive, so it drops into a Next.js App
Router tree without per-import wrapping.

## Quickstart

```tsx
import { useMemo, useState } from 'react';
import { LayoutEngine } from '@sld-kit/core';
import { SldCanvas, useSldDocument } from '@sld-kit/react';

export function Diagram({ doc }) {
  // The document mutates in place, so a version counter — not its identity —
  // is what tells React to re-derive.
  const version = useSldDocument(doc);
  const engine = useMemo(() => new LayoutEngine(), []);
  const layout = useMemo(() => engine.layout(doc), [engine, doc, version]);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());

  return (
    <SldCanvas
      doc={doc}
      layout={layout}
      version={version}
      selectedIds={selectedIds}
      onSelect={({ id }) => setSelectedIds(new Set([id]))}
      onClearSelection={() => setSelectedIds(new Set())}
      onEditLabel={({ id }) => openMyEditDialog(id)}
    />
  );
}
```

Wiring the full editing loop (command stack, drag-to-move, ghost preview,
toolbar, dialogs) is the host app's job — see [`examples/react`](../../examples/react)
for a runnable editor.

### Reacting to document changes

`useSldDocument(doc)` returns a monotonic version number. This is the one place
the React adapter cannot mirror the Svelte one: `SldDocument` mutates in place,
so `Object.is` on the document never reports a change. Always pass `version`
into the dependency arrays that read the document — including `SldCanvas`'s
`version` prop.

`useCommandStack(stack)` returns `{ canUndo, canRedo }` for wiring undo/redo
buttons.

## Imperative canvas API

`SldCanvas` forwards a ref exposing `clientToSvg`, `svgToClient`, `zoomToFit`,
`zoomIn`, `zoomOut`, `getViewBox` and `getSvgElement`:

```tsx
const canvasRef = useRef<SldCanvasHandle>(null);
<SldCanvas ref={canvasRef} … />
<button onClick={() => canvasRef.current?.zoomToFit()}>Fit</button>
```

## Overlays

`SldCanvas` takes two overlay slots: `background` renders under the elements
(grid slots, lane chrome) and `children` above them (drag ghost, rubber band).

```tsx
<SldCanvas
  doc={doc}
  layout={layout}
  version={version}
  background={<LaneOverlay layout={layout} onSelectLane={setLane} />}
>
  <GridOverlay layout={layout} highlight={ghost} />
  {ghost && <GhostPreview rect={layout.cellRect(ghost.cell)} valid={ghost.valid} />}
</SldCanvas>
```

## Theming (tokens)

The library emits a class per position type; your stylesheet gives it a color
by setting `--sld-pos`.

```css
:root {
  --sld-pos-line: hsl(217 91% 60%);
  --sld-pos-transformer: hsl(38 92% 50%);
}
.sld-pos-line {
  --sld-pos: var(--sld-pos-line);
}
.sld-pos-transformer {
  --sld-pos: var(--sld-pos-transformer);
}
```

Override the map with the `tokens` prop, or force one color for a whole
diagram (e.g. a voltage bucket) with `colorClass`.

> **`--sld-pos` holds a complete CSS color here**, not the HSL triplet
> `@sld-kit/svelte` expects. That adapter targets Tailwind v3 / shadcn-svelte,
> this one targets Tailwind v4 / shadcn, whose tokens are whole colors. Alpha is
> applied with the SVG `fill-opacity` / `stroke-opacity` attributes, which keeps
> it color-space agnostic. See
> [the divergence note](../README.md#one-intentional-styling-divergence).

### Tailwind purge

The package emits Tailwind utility classes but ships no Tailwind config. Your
app **must** scan the built package or the diagram loses its colors:

```css
/* Tailwind v4 */
@source "../node_modules/@sld-kit/react/dist";
```

```js
// Tailwind v3
content: ['./src/**/*.{ts,tsx}', './node_modules/@sld-kit/react/dist/**/*.js'];
```

## Styling the chrome

The interaction chrome is headless: the adapter owns the geometry, state and
events, and your stylesheet owns the look. With no extra props or CSS it renders
exactly the default look; every hook below is opt-in.

### Composite frame (`CompositeCanvas` → `SelectionFrame`)

One frame serves both selection and hover, so the two never stack.

| Prop               | Effect                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `hoverFrame`       | Also frame the child under the pointer (`data-state="hover"`, faded, no rotate handle). Default `false`.                                       |
| `hoveredChild`     | Controlled hover `{ id, section? } \| null`: draw this instead of the pointer (e.g. highlight a box from a list).                              |
| `selectionCorners` | `'dots'` (default), `'brackets'` or `'none'`.                                                                                                  |
| `onChildHover`     | The child (and section box, in a split box view) under the pointer, or `null`. Cleared while a button is held, while panning and in draw mode. |

| Part (class)            | What it is                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `sld-selection`         | Root `<g>`. Carries the child's `childColorClass`, so CSS can tint by `--sld-pos`. |
| `sld-selection-body`    | The child's own corners, **unpainted** — a hook for a wash or a ping.              |
| `sld-selection-outline` | The dashed outline (`padding` outside the child, rounded by `radius`).             |
| `sld-selection-corner`  | Corner dots or brackets.                                                           |
| `sld-selection-rotate`  | Rotation handle + stem (selected frames only).                                     |

| Attribute (on the root) | Values                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| `data-state`            | `selected` \| `hover` (frames are keyed by state, so entry animations replay) |
| `data-hover`            | `"true"` when the selected child is also under the pointer                    |
| `data-section`          | the hovered section box's key (split box view)                                |
| `data-corners`          | `brackets` \| `none` (absent for the default dots)                            |

CSS variables: `--sld-selection-stroke` (colour, default the `text-primary`
`currentColor`), `--sld-selection-width`, `--sld-selection-dash`. Numbers:
`style.composite.selection` — `strokeWidth`, `dashArray`, `padding`, `radius`,
`bodyRadius`, `cornerRadius` (dots), `cornerArm` (selected brackets),
`hoverCornerArm`, `rotateHandleOffset`, `rotateHandleRadius`.

### Editor elements (`SldCanvas` → element views)

| Prop             | Effect                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `hoverHalo`      | Also draw the halo around the bus bar / position under the pointer. Default `false`.      |
| `haloCorners`    | `'brackets'` adds corner brackets to the halos; `'none'` (default).                       |
| `busBarHitSlop`  | Widen each bar's hit area by N px (bars are thin). Default 0.                             |
| `onElementHover` | `{ id, kind } \| null` for the element under the pointer; cleared while a button is held. |

Roots: `sld-busbar`, `sld-position`, `sld-connection`, each with
`data-hover="true"` / `data-selected="true"` when set. Halo parts: `sld-halo`
(group, `data-state`), `sld-halo-body` (the element's rect, unpainted),
`sld-halo-outline`, `sld-halo-corner`. CSS variables `--sld-halo-stroke`,
`--sld-halo-width`, `--sld-halo-dash`; numbers in `style.selection` (`padding`,
`strokeWidth`, `dashArray`, `cornerArm`, `hoverCornerArm`). Halo rects take `rx`
from CSS (`.sld-halo-outline { rx: 6px }`). Connections have no halo — their
selection is the heavier stroke.

### Recipe

```css
/* Tinted hover frame with marching ants and a faint wash; hide the rotate handle. */
.sld-selection {
  --sld-selection-stroke: var(--sld-pos);
}
.sld-selection[data-state='hover'] {
  opacity: 1;
}
.sld-selection[data-state='hover'] .sld-selection-outline {
  animation: march 0.9s linear infinite;
}
.sld-selection-body {
  fill: var(--sld-pos);
  fill-opacity: 0.08;
}
.sld-selection-rotate {
  display: none;
}
@keyframes march {
  to {
    stroke-dashoffset: -24;
  }
}
```

To hide the frame entirely: `.sld-selection { display: none }`. Paint set
inline (the outline's stroke, width and dash) is reachable only through the CSS
variables; everything else is a presentation attribute that any CSS rule
overrides. The box-view example's [`app.css`](../../examples/react-box/src/app.css) builds a full game-style "target lock" on these hooks.

## Numbers vs. colors

`SldViewStyle` owns every stroke width, opacity, dash pattern and handle
radius; CSS owns every color. Pass a partial through `resolveViewStyle({...})`
to a canvas's `style` prop.

`FormatResolver` is the per-element styling seam — pass the same function to the
exporter's `theme.resolveElementFormat` so the live canvas and the SVG export
agree.

## License

MIT © Adrian Sanchez R
