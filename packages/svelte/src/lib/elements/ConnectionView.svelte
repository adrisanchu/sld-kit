<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Connection, ConnectionGeometry, ElementFormat, SldDocument } from '@sld-kit/core';
  import { SLD_LAYOUT, arrowheadPath, connectionPath, createDefaultSymbolRegistry, resolveFormat } from '@sld-kit/core';
  import type { FormatResolver } from '../format';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

  export let conn: Connection;
  export let geo: ConnectionGeometry;
  export let selected: boolean = false;
  export let interactive: boolean = true;
  /** Counter-rotation (deg) applied to the label; see PositionView. */
  export let labelAngleDeg: number = 0;
  /**
   * Caller-supplied color class (e.g. a voltage bucket) that sets `--sld-pos`.
   * When set, the connection's `currentColor` strokes/arrowheads/dots resolve
   * to that color; otherwise it inherits the neutral slate color.
   */
  export let colorClass: string | null = null;
  /** Hide the connection's (external endpoint) label. */
  export let showLabel: boolean = true;
  /** Commissioning overlay (stroke width); see PositionView. */
  export let formatResolver: FormatResolver | null = null;
  /**
   * The document this connection belongs to. Lets core's default open look grey
   * and dash a connection that touches an open position (see `resolveFormat`).
   */
  export let doc: SldDocument | null = null;
  /** Numeric presentation config (stroke widths, hit target, symbol). */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    /** The pointer entered / left this element (`SldCanvas` turns it into `elementhover`). */
    hover: { id: string; hovered: boolean };
    editlabel: { id: string };
  }>();

  // Module-level would be shared, but the registry is tiny — per-instance is fine
  // and keeps the possibility of a future `symbols` prop open.
  const symbols = createDefaultSymbolRegistry();

  let hovered = false;

  $: fmt = (resolveFormat(conn, formatResolver, { doc }) ?? null) as ElementFormat | null;
  $: baseStrokeW = hovered && interactive ? style.connection.hoverStrokeWidth : style.connection.strokeWidth;
  $: strokeW = selected ? style.connection.selectedStrokeWidth : (fmt?.strokeWidth ?? baseStrokeW);
  // A format `stroke` (e.g. grey for a de-energised line) recolours the line and
  // its arrowhead; the selection highlight still wins.
  $: lineColor = !selected && fmt?.stroke ? fmt.stroke : 'currentColor';
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

<!-- Styling hooks: root `sld-connection` + `data-hover` / `data-selected` (no halo:
     selection is the heavier stroke). -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<g
  class="sld-connection {colorClass ?? 'text-slate-600 dark:text-slate-300'}"
  data-hover={hovered && interactive ? 'true' : undefined}
  data-selected={selected ? 'true' : undefined}
  style={colorClass ? 'color: hsl(var(--sld-pos))' : ''}
  class:cursor-pointer={interactive}
  on:pointerdown={handlePointerDown}
  on:pointerenter={() => {
    hovered = true;
    dispatch('hover', { id: conn.id, hovered: true });
  }}
  on:pointerleave={() => {
    hovered = false;
    dispatch('hover', { id: conn.id, hovered: false });
  }}
  on:dblclick={() => interactive && dispatch('editlabel', { id: conn.id })}
>
  <!-- Invisible fat stroke so thin lines are easy to hit. -->
  <path d={pathD} fill="none" stroke="transparent" stroke-width={style.hitStrokeWidth} />
  <path
    d={pathD}
    fill="none"
    stroke={lineColor}
    stroke-width={strokeW}
    stroke-dasharray={fmt?.dashArray ?? undefined}
    class={selected ? 'text-primary' : ''}
  />
  {#if geo.arrow}
    <path d={arrowheadPath(geo.arrow.at, geo.arrow.angle, SLD_LAYOUT.arrowSize)} fill={lineColor} />
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
            stroke-width={shape.strokeWidth ?? style.symbol.strokeWidth}
          />
        {:else if shape.type === 'circle'}
          <circle
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={shape.fill === 'token' ? 'currentColor' : 'none'}
            stroke-width={shape.strokeWidth ?? style.symbol.strokeWidth}
          />
        {:else}
          <line
            x1={shape.x1}
            y1={shape.y1}
            x2={shape.x2}
            y2={shape.y2}
            stroke-width={shape.strokeWidth ?? style.symbol.strokeWidth}
          />
        {/if}
      {/each}
    </g>
  {/if}
  {#if showLabel && geo.labelAt && label}
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
