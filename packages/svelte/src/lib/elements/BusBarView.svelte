<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { BusBar, BusBarGeometry, ElementFormat } from '@sld-kit/core';
  import { SLD_LAYOUT } from '@sld-kit/core';
  import type { FormatResolver } from '../format';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
  import Halo from './Halo.svelte';
  import type { FrameCorners } from '../composite/frameGeometry';

  export let bar: BusBar;
  export let geo: BusBarGeometry;
  export let selected: boolean = false;
  export let interactive: boolean = true;
  /** Counter-rotation (deg) applied to the label; see PositionView. */
  export let labelAngleDeg: number = 0;
  /**
   * Caller-supplied color class (e.g. a voltage bucket) that sets `--sld-pos`.
   * When set, the bar's `currentColor` fills resolve to that color; otherwise
   * it inherits the neutral foreground.
   */
  export let colorClass: string | null = null;
  /** Hide the bar's label (e.g. to compact the diagram). */
  export let showLabel: boolean = true;
  /** Commissioning overlay (stroke width + fill opacity); see PositionView. */
  export let formatResolver: FormatResolver | null = null;
  /** Numeric presentation config (opacities, selection halo). */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;
  /**
   * Also draw the halo while hovered (`data-state="hover"`, faded). Default
   * `false`: hover only changes the opacity / stroke width, as before.
   */
  export let hoverHalo: boolean = false;
  /** Corner brackets on the halo (`brackets`); `none` (default) draws plain dashes. */
  export let haloCorners: FrameCorners = 'none';
  /**
   * Widen the bar's hit area by this many px on every side (an invisible rect):
   * bars are thin, so a little slop makes them easier to hover and pick. Default 0.
   */
  export let hitSlop: number = 0;

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    /** The pointer entered / left this element (`SldCanvas` turns it into `elementhover`). */
    hover: { id: string; hovered: boolean };
    editlabel: { id: string };
  }>();

  let hovered = false;

  $: fmt = (formatResolver?.(bar) ?? null) as ElementFormat | null;
  $: baseOpacity = hovered && interactive ? style.busBar.hoverOpacity : style.busBar.opacity;
  $: barOpacity = fmt?.fillOpacity != null ? baseOpacity * fmt.fillOpacity : baseOpacity;

  function handlePointerDown(e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('select', { id: bar.id, shiftKey: e.shiftKey });
  }
</script>

<!-- Styling hooks: root `sld-busbar` + `data-hover` / `data-selected`; halo `sld-halo`. -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<g
  class="sld-busbar {colorClass ?? 'text-foreground'}"
  data-hover={hovered && interactive ? 'true' : undefined}
  data-selected={selected ? 'true' : undefined}
  style={colorClass ? 'color: hsl(var(--sld-pos))' : ''}
  class:cursor-pointer={interactive}
  on:pointerdown={handlePointerDown}
  on:pointerenter={() => {
    hovered = true;
    dispatch('hover', { id: bar.id, hovered: true });
  }}
  on:pointerleave={() => {
    hovered = false;
    dispatch('hover', { id: bar.id, hovered: false });
  }}
  on:dblclick={() => interactive && dispatch('editlabel', { id: bar.id })}
>
  {#if hitSlop > 0}
    <rect
      x={geo.rect.x - hitSlop}
      y={geo.rect.y - hitSlop}
      width={geo.rect.width + hitSlop * 2}
      height={geo.rect.height + hitSlop * 2}
      fill="transparent"
    />
  {/if}
  {#if selected || (hoverHalo && hovered && interactive)}
    <Halo rect={geo.rect} state={selected ? 'selected' : 'hover'}
      corners={haloCorners} {style} />
  {/if}
  <rect
    x={geo.rect.x}
    y={geo.rect.y}
    width={geo.rect.width}
    height={geo.rect.height}
    fill="currentColor"
    opacity={barOpacity}
    stroke={fmt?.strokeWidth != null || fmt?.dashArray != null ? 'currentColor' : undefined}
    stroke-width={fmt?.strokeWidth}
    stroke-dasharray={fmt?.dashArray ?? undefined}
  />
  {#if showLabel && geo.label}
    <g transform={labelAngleDeg ? `rotate(${labelAngleDeg} ${geo.labelAt.x} ${geo.labelAt.y})` : undefined}>
      <text
        x={geo.labelAt.x}
        y={geo.labelAt.y}
        text-anchor={geo.textAnchor}
        font-size={SLD_LAYOUT.busLabelFontSize}
        font-weight="600"
        fill="currentColor"
        class="select-none"
      >
        {geo.label}
      </text>
    </g>
  {/if}
</g>
