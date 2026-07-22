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

## License

MIT
