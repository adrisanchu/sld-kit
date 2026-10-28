# @sld-kit/svelte

Svelte 4 components for single-line (electrical) diagrams, built on
[`@sld-kit/core`](../core). A headless pan/zoom **canvas**, the **element
views** that paint the core's computed geometry, and the event-dispatching
editor **chrome** (toolbar, flyouts, popovers, lane chip) — plus the composite
("diagram of diagrams") canvas primitives.

The components are deliberately **headless and unopinionated**:

- **No dialogs, no persistence, no routing.** Components dispatch semantic
  events (`select`, `editlabel`, `settool`, `settype`, `matrix`, `import`,
  `delete`, …); the host app decides what to do — open its own dialogs, persist
  to a store, etc.
- **No bundled UI kit.** Only `lucide-svelte` icons
- **Injectable strings.** Every visible string ships an English default and is
  overridable through a component's `labels` prop, so apps localize without
  forking.
- **Injectable theming.** Colors are supplied by the consumer's CSS. Components
  emit a class per position type (the `tokens` map, default `sld-pos-*`) and
  reference CSS custom properties (`--sld-pos`, `--primary`, `--muted-foreground`,
  …). The consumer's stylesheet (e.g. Tailwind + a few `.sld-pos-*` classes that
  set `--sld-pos`) provides the actual values, so dark mode and re-theming are
  entirely app-side.

## Install

```sh
npm install @sld-kit/svelte @sld-kit/core lucide-svelte svelte
```

`@sld-kit/core`, `lucide-svelte` and `svelte` are peer dependencies.

## Quickstart

```svelte
<script lang="ts">
  import { SldDocument, LayoutEngine } from '@sld-kit/core';
  import { SldCanvas } from '@sld-kit/svelte';

  export let doc: SldDocument;
  const engine = new LayoutEngine();
  $: layout = engine.layout(doc);
</script>

<SldCanvas
  {doc}
  {layout}
  on:select={(e) => console.log('selected', e.detail.id)}
  on:editlabel={(e) => openMyEditDialog(e.detail.id)}
/>
```

Wiring the full editing loop (command stack, drag-to-move, ghost preview,
toolbar, dialogs) is the host app's job — see `SldEditor.svelte` in the
[dpe-app](https://github.com/adrisanchu/dpe-app) reference consumer for a
complete example.

## Theming (tokens)

```svelte
<script>
  import { SldCanvas } from '@sld-kit/svelte';

  // type → CSS class. The default is the same map shown here.
  const tokens = {
    line: 'sld-pos-line',
    transformer: 'sld-pos-transformer',
    central: 'sld-pos-central',
    renewable: 'sld-pos-renewable',
    reserve: 'sld-pos-reserve'
  };
</script>

<SldCanvas {doc} {layout} {tokens} />
```

```css
/* app stylesheet — each class sets the --sld-pos property the views read */
.sld-pos-line {
  --sld-pos: 217 91% 60%;
}
/* … one per type; --sld-pos-<type> vars drive the toolbar swatches … */
```

## Styling the chrome

The interaction chrome is headless: the adapter owns the geometry, state and
events, and your stylesheet owns the look. With no extra props or CSS it renders
exactly the default look; every hook below is opt-in.

### Composite frame (`CompositeCanvas` → `SelectionFrame`)

One frame serves both selection and hover, so the two never stack.

| Prop / event       | Effect                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hoverFrame`       | Also frame the child under the pointer (`data-state="hover"`, faded, no rotate handle). Default `false`.                                                   |
| `hoveredChild`     | Controlled hover `{ id, section? } \| null`: draw this instead of the pointer (e.g. highlight a box from a list).                                          |
| `selectionCorners` | `'dots'` (default), `'brackets'` or `'none'`.                                                                                                              |
| `on:childhover`    | The child (and section box, in a split box view, React only) under the pointer, or `null`. Cleared while a button is held, while panning and in draw mode. |

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

| Prop / event      | Effect                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `hoverHalo`       | Also draw the halo around the bus bar / position under the pointer. Default `false`.      |
| `haloCorners`     | `'brackets'` adds corner brackets to the halos; `'none'` (default).                       |
| `busBarHitSlop`   | Widen each bar's hit area by N px (bars are thin). Default 0.                             |
| `on:elementhover` | `{ id, kind } \| null` for the element under the pointer; cleared while a button is held. |

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
  --sld-selection-stroke: hsl(var(--sld-pos));
}
.sld-selection[data-state='hover'] {
  opacity: 1;
}
.sld-selection[data-state='hover'] .sld-selection-outline {
  animation: march 0.9s linear infinite;
}
.sld-selection-body {
  fill: hsl(var(--sld-pos));
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
overrides.

Custom properties cross Svelte's style scoping, so a plain global stylesheet
can set them. Remember `--sld-pos` is an HSL triplet here, so tint with
`hsl(var(--sld-pos))`.

## Localization (labels)

Every chrome component takes a partial `labels` prop merged over English
defaults:

```svelte
<SldToolbar
  {tool}
  positionType="line"
  labels={{ undo: 'Deshacer (Ctrl+Z)', addPosition: 'Añadir posición (P)' }}
  on:settype={(e) => (positionType = e.detail)}
/>
```

Exported default label maps (`DEFAULT_TOOLBAR_LABELS`,
`DEFAULT_EXTERNAL_ASSET_LABELS`, …) and their interfaces
(`SldToolbarLabels`, …) are available for building a fully-typed localized set.

## Exports

Components: `SldCanvas`, `PositionView`, `BusBarView`, `ConnectionView`,
`GhostPreview`, `GridOverlay`, `LaneOverlay`, `SldToolbar`,
`PositionTypeFlyout`, `MatrixCreatorFlyout`, `ExportFlyout`,
`ExternalAssetPopover`, `LaneActionChip`, `CompositeCanvas`,
`CompositeToolbar`, `ChildDiagramView`, `SelectionFrame`.

Utilities: `createPanZoom`, `createDocStore`, `downloadText`, `slugify`.

Labels/tokens: `DEFAULT_POSITION_TOKENS` and the `DEFAULT_*_LABELS` maps, plus
their TypeScript interfaces.

Styling types: `SldViewStyle` (+ `DEFAULT_VIEW_STYLE`, `resolveViewStyle`),
`ChildHover`, `FrameCorners`, `ElementHover` — see
[Styling the chrome](#styling-the-chrome).

## License

MIT
