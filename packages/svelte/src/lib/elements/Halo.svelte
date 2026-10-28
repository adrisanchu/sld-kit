<script lang="ts">
  import type { Rect } from '@sld-kit/core';
  import type { SldViewStyle } from '../style';
  import { bracketPaths, type FrameCorners } from '../composite/frameGeometry';

  /**
   * The halo around a selected (or, with `hoverHalo`, hovered) bus bar or
   * position, mirroring the composite `SelectionFrame`'s parts:
   * - `sld-halo` (group, `data-state="selected" | "hover"`; the hover state is
   *   faded with a presentation `opacity`, which any CSS rule overrides);
   * - `sld-halo-body` — the element's own rect, unpainted (a hook for a wash);
   * - `sld-halo-outline` — the dashed rect `style.selection.padding` outside it,
   *   painted from `--sld-halo-stroke` (default the `text-primary` currentColor),
   *   `--sld-halo-width` and `--sld-halo-dash` (default `style.selection`);
   * - `sld-halo-corner` — L-shaped brackets on the outline (`corners="brackets"`),
   *   `style.selection.cornerArm` / `hoverCornerArm` long.
   * Rects take `rx` from CSS too (`.sld-halo-outline { rx: 6px }`).
   */
  export let rect: Rect;
  export let rx: number | undefined = undefined;
  export let state: 'selected' | 'hover';
  /** `brackets` adds corner brackets; `dots` / `none` draw none. */
  export let corners: FrameCorners = 'none';
  export let style: SldViewStyle;

  const stroke = 'stroke: var(--sld-halo-stroke, currentColor)';

  $: sel = style.selection;
  $: paint = `${stroke}; stroke-width: var(--sld-halo-width, ${sel.strokeWidth}); stroke-dasharray: var(--sld-halo-dash, ${sel.dashArray})`;
  $: o = {
    x: rect.x - sel.padding,
    y: rect.y - sel.padding,
    width: rect.width + sel.padding * 2,
    height: rect.height + sel.padding * 2
  };
  $: brackets =
    corners === 'brackets'
      ? bracketPaths(
          [
            { x: o.x, y: o.y },
            { x: o.x + o.width, y: o.y },
            { x: o.x + o.width, y: o.y + o.height },
            { x: o.x, y: o.y + o.height }
          ],
          state === 'hover' ? sel.hoverCornerArm : sel.cornerArm
        )
      : [];
</script>

<g class="sld-halo text-primary" data-state={state} opacity={state === 'hover' ? 0.55 : undefined}>
  <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="none" class="sld-halo-body" />
  <rect x={o.x} y={o.y} width={o.width} height={o.height} {rx} fill="none" class="sld-halo-outline" style={paint} />
  {#each brackets as d}
    <path
      {d}
      fill="none"
      class="sld-halo-corner"
      style={stroke}
      stroke-width={sel.strokeWidth * 2}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/each}
</g>
