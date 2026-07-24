<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { BusBar, BusBarGeometry } from '@sld-kit/core';
  import { SLD_LAYOUT } from '@sld-kit/core';

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

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    editlabel: { id: string };
  }>();

  let hovered = false;

  function handlePointerDown(e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('select', { id: bar.id, shiftKey: e.shiftKey });
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<g
  class={colorClass ?? 'text-foreground'}
  style={colorClass ? 'color: hsl(var(--sld-pos))' : ''}
  class:cursor-pointer={interactive}
  on:pointerdown={handlePointerDown}
  on:pointerenter={() => (hovered = true)}
  on:pointerleave={() => (hovered = false)}
  on:dblclick={() => interactive && dispatch('editlabel', { id: bar.id })}
>
  {#if selected}
    <rect
      x={geo.rect.x - 4}
      y={geo.rect.y - 4}
      width={geo.rect.width + 8}
      height={geo.rect.height + 8}
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
    fill="currentColor"
    opacity={hovered && interactive ? 0.75 : 1}
  />
  {#if showLabel && bar.label}
    <g transform={labelAngleDeg ? `rotate(${labelAngleDeg} ${geo.labelAt.x} ${geo.labelAt.y})` : undefined}>
      <text
        x={geo.labelAt.x}
        y={geo.labelAt.y}
        text-anchor="start"
        font-size={SLD_LAYOUT.busLabelFontSize}
        font-weight="600"
        fill="currentColor"
        class="select-none"
      >
        {bar.label}
      </text>
    </g>
  {/if}
</g>
