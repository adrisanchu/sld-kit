<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Connection, ConnectionGeometry } from '@sld-kit/core';
  import { SLD_LAYOUT, arrowheadPath, connectionPath, createDefaultSymbolRegistry } from '@sld-kit/core';

  export let conn: Connection;
  export let geo: ConnectionGeometry;
  export let selected: boolean = false;
  export let interactive: boolean = true;
  /** Counter-rotation (deg) applied to the label; see PositionView. */
  export let labelAngleDeg: number = 0;

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    editlabel: { id: string };
  }>();

  // Module-level would be shared, but the registry is tiny — per-instance is fine
  // and keeps the possibility of a future `symbols` prop open.
  const symbols = createDefaultSymbolRegistry();

  let hovered = false;

  $: pathD = connectionPath(geo.points, geo.hops, SLD_LAYOUT.hopRadius);
  $: label = conn.from.kind === 'external' ? conn.from.label : conn.to.kind === 'external' ? conn.to.label : conn.label;
  $: symbolDef = geo.symbol ? symbols.get(geo.symbol.key) : undefined;
  $: symbolScale =
    geo.symbol && symbolDef
      ? Math.min(geo.symbol.box.width / symbolDef.size[0], geo.symbol.box.height / symbolDef.size[1])
      : 1;

  function handlePointerDown(e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('select', { id: conn.id, shiftKey: e.shiftKey });
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<g
  class="text-slate-600 dark:text-slate-300"
  class:cursor-pointer={interactive}
  on:pointerdown={handlePointerDown}
  on:pointerenter={() => (hovered = true)}
  on:pointerleave={() => (hovered = false)}
  on:dblclick={() => interactive && dispatch('editlabel', { id: conn.id })}
>
  <!-- Invisible fat stroke so thin lines are easy to hit. -->
  <path d={pathD} fill="none" stroke="transparent" stroke-width="12" />
  <path
    d={pathD}
    fill="none"
    stroke="currentColor"
    stroke-width={selected ? 3 : hovered && interactive ? 2.5 : 2}
    class={selected ? 'text-primary' : ''}
  />
  {#if geo.arrow}
    <path d={arrowheadPath(geo.arrow.at, geo.arrow.angle, SLD_LAYOUT.arrowSize)} fill="currentColor" />
  {/if}
  {#if geo.dot}
    <circle cx={geo.dot.x} cy={geo.dot.y} r={SLD_LAYOUT.nodeDotRadius} fill="currentColor" />
  {/if}
  {#if geo.symbol && symbolDef}
    <rect
      x={geo.symbol.box.x}
      y={geo.symbol.box.y}
      width={geo.symbol.box.width}
      height={geo.symbol.box.height}
      class="fill-background"
    />
    <g
      transform="translate({geo.symbol.box.x} {geo.symbol.box.y}) scale({symbolScale})"
      stroke="currentColor"
      fill="none"
    >
      {#each symbolDef.shapes as shape}
        {#if shape.type === 'path'}
          <path
            d={shape.d}
            fill={shape.fill === 'token' ? 'currentColor' : 'none'}
            stroke-width={shape.strokeWidth ?? 1.6}
          />
        {:else if shape.type === 'circle'}
          <circle
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={shape.fill === 'token' ? 'currentColor' : 'none'}
            stroke-width={shape.strokeWidth ?? 1.6}
          />
        {:else}
          <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke-width={shape.strokeWidth ?? 1.6} />
        {/if}
      {/each}
    </g>
  {/if}
  {#if geo.labelAt && label}
    <g transform={labelAngleDeg ? `rotate(${labelAngleDeg} ${geo.labelAt.at.x} ${geo.labelAt.at.y})` : undefined}>
      <text
        x={geo.labelAt.at.x}
        y={geo.labelAt.at.y}
        text-anchor={geo.labelAt.anchor}
        font-size={SLD_LAYOUT.labelFontSize}
        class="select-none fill-foreground"
      >
        {label}
      </text>
    </g>
  {/if}
</g>
