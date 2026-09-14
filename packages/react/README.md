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

> **Port status:** the canvas and element views are complete; the toolbar,
> flyouts, composite and flow components are still being ported. See the
> [component parity table](../README.md#component-status).

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

## Numbers vs. colors

`SldViewStyle` owns every stroke width, opacity, dash pattern and handle
radius; CSS owns every color. Pass a partial through `resolveViewStyle({...})`
to a canvas's `style` prop.

`FormatResolver` is the per-element styling seam — pass the same function to the
exporter's `theme.resolveElementFormat` so the live canvas and the SVG export
agree.

## License

MIT © Adrian Sanchez R
