<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Position, PositionGeometry, ElementFormat } from '@sld-kit/core';
  import { SLD_LAYOUT } from '@sld-kit/core';
  import { DEFAULT_POSITION_TOKENS, type PositionTokens } from '../labels';
  import type { FormatResolver } from '../format';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

  export let pos: Position;
  export let geo: PositionGeometry;
  export let selected: boolean = false;
  export let interactive: boolean = true;
  /** Dimmed while being dragged (the ghost shows the target slot). */
  export let dragging: boolean = false;
  /**
   * Local flip (deg) applied to the label about the box center. 0 in the single
   * editor; the composite passes 0 or 180 so a rotated diagram's names stay
   * aligned with the boxes yet never read upside-down (see CompositeLayoutEngine).
   */
  export let labelAngleDeg: number = 0;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /**
   * Overrides the type token with a caller-supplied color class (e.g. a
   * voltage bucket). The class must set `--sld-pos`; the view stays agnostic
   * about what it means.
   */
  export let colorClass: string | null = null;
  /** Hide the position's inside-box label (e.g. to compact the diagram). */
  export let showLabel: boolean = true;
  /**
   * Orthogonal commissioning overlay (new vs. existing assets): returns a
   * per-element `ElementFormat` (stroke width + fill opacity) layered on top of
   * the type/voltage color. `null` (the default) leaves the box unchanged.
   */
  export let formatResolver: FormatResolver | null = null;
  /** Numeric presentation config (stroke widths, opacities, selection halo). */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    dragstart: { id: string; event: PointerEvent };
    editlabel: { id: string };
  }>();

  let hovered = false;

  $: token = colorClass ?? tokens[pos.type];
  $: fmt = (formatResolver?.(pos) ?? null) as ElementFormat | null;
  $: baseAlpha = hovered && interactive ? style.position.hoverFillOpacity : style.position.fillOpacity;
  $: fillAlpha = fmt?.fillOpacity != null ? baseAlpha * fmt.fillOpacity : baseAlpha;
  $: strokeW = fmt?.strokeWidth ?? style.position.strokeWidth;
  $: fontSize = pos.label.length > 13 ? SLD_LAYOUT.labelFontSize - 2 : SLD_LAYOUT.labelFontSize;
  $: sel = style.selection;

  function handlePointerDown(e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('select', { id: pos.id, shiftKey: e.shiftKey });
    dispatch('dragstart', { id: pos.id, event: e });
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<g
  class="sld-position {token} transition-transform duration-150 ease-out"
  class:cursor-pointer={interactive}
  opacity={dragging ? style.position.draggingOpacity : 1}
  on:pointerdown={handlePointerDown}
  on:pointerenter={() => (hovered = true)}
  on:pointerleave={() => (hovered = false)}
  on:dblclick={() => interactive && dispatch('editlabel', { id: pos.id })}
>
  {#if selected}
    <rect
      x={geo.rect.x - sel.padding}
      y={geo.rect.y - sel.padding}
      width={geo.rect.width + sel.padding * 2}
      height={geo.rect.height + sel.padding * 2}
      rx={SLD_LAYOUT.positionCornerRadius + 2}
      fill="none"
      class="stroke-primary"
      stroke-width={sel.strokeWidth}
      stroke-dasharray={sel.dashArray}
    />
  {/if}
  <rect
    x={geo.rect.x}
    y={geo.rect.y}
    width={geo.rect.width}
    height={geo.rect.height}
    rx={SLD_LAYOUT.positionCornerRadius}
    style="fill: hsl(var(--sld-pos) / {fillAlpha}); stroke: hsl(var(--sld-pos));"
    stroke-width={strokeW}
    stroke-dasharray={fmt?.dashArray ?? undefined}
  />
  {#if showLabel && pos.label}
    <g
      transform={labelAngleDeg
        ? `rotate(${labelAngleDeg} ${geo.rect.x + geo.rect.width / 2} ${geo.rect.y + geo.rect.height / 2})`
        : undefined}
    >
      <text
        x={geo.rect.x + geo.rect.width / 2}
        y={geo.rect.y + geo.rect.height / 2 + fontSize * 0.35}
        text-anchor="middle"
        font-size={fontSize}
        style="fill: hsl(var(--sld-pos));"
        class="select-none font-medium"
      >
        {pos.label}
      </text>
    </g>
  {/if}
</g>
