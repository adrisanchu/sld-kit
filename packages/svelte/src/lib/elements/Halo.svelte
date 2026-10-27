<script lang="ts">
  import type { Rect } from '@sld-kit/core';
  import type { SldViewStyle } from '../style';

  /**
   * The dashed halo around a selected (or, with `hoverHalo`, hovered) bus bar or
   * position. Class `sld-halo` + `data-state`; paint from the CSS custom
   * properties `--sld-halo-stroke` (default the `text-primary` currentColor),
   * `--sld-halo-width` and `--sld-halo-dash` (default `style.selection`). The
   * hover state is faded with a presentation `opacity`, which any CSS rule overrides.
   */
  export let rect: Rect;
  export let rx: number | undefined = undefined;
  export let state: 'selected' | 'hover';
  export let style: SldViewStyle;

  $: sel = style.selection;
  $: paint = `stroke: var(--sld-halo-stroke, currentColor); stroke-width: var(--sld-halo-width, ${sel.strokeWidth}); stroke-dasharray: var(--sld-halo-dash, ${sel.dashArray})`;
</script>

<rect
  x={rect.x - sel.padding}
  y={rect.y - sel.padding}
  width={rect.width + sel.padding * 2}
  height={rect.height + sel.padding * 2}
  {rx}
  fill="none"
  class="sld-halo text-primary"
  data-state={state}
  opacity={state === 'hover' ? 0.55 : undefined}
  style={paint}
/>
