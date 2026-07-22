<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Position, PositionGeometry } from '@sld-kit/core';
  import { SLD_LAYOUT } from '@sld-kit/core';
  import { DEFAULT_POSITION_TOKENS, type PositionTokens } from '../labels';

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

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    dragstart: { id: string; event: PointerEvent };
    editlabel: { id: string };
  }>();

  let hovered = false;

  $: token = tokens[pos.type];
  $: fontSize = pos.label.length > 13 ? SLD_LAYOUT.labelFontSize - 2 : SLD_LAYOUT.labelFontSize;

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
  opacity={dragging ? 0.4 : 1}
  on:pointerdown={handlePointerDown}
  on:pointerenter={() => (hovered = true)}
  on:pointerleave={() => (hovered = false)}
  on:dblclick={() => interactive && dispatch('editlabel', { id: pos.id })}
>
  {#if selected}
    <rect
      x={geo.rect.x - 4}
      y={geo.rect.y - 4}
      width={geo.rect.width + 8}
      height={geo.rect.height + 8}
      rx={SLD_LAYOUT.positionCornerRadius + 2}
      fill="none"
      class="stroke-primary"
      stroke-width="1.5"
      stroke-dasharray="5 3"
    />
  {/if}
  <rect
    x={geo.rect.x}
    y={geo.rect.y}
    width={geo.rect.width}
    height={geo.rect.height}
    rx={SLD_LAYOUT.positionCornerRadius}
    style="fill: hsl(var(--sld-pos) / {hovered && interactive ? 0.3 : 0.15}); stroke: hsl(var(--sld-pos));"
    stroke-width="1.5"
  />
  {#if pos.label}
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
