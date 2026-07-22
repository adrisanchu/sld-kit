<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DiagramLayout } from '@sld-kit/core';
  import { DEFAULT_LANE_OVERLAY_LABELS, type LaneOverlayLabels } from '../labels';

  /**
   * SVG overlay (rendered in the canvas background slot) for lane selection
   * and lane addition. Renders column hit bands, row handle tabs, and "+"
   * affordances at the grid edges. All geometry derives from `layout`.
   */
  export let layout: DiagramLayout;
  export let selectedLane: { kind: 'row' | 'col'; index: number } | null = null;
  export let labels: Partial<LaneOverlayLabels> = {};

  $: L = { ...DEFAULT_LANE_OVERLAY_LABELS, ...labels };

  const dispatch = createEventDispatcher<{
    selectlane: { kind: 'row' | 'col'; index: number };
    addlane: { kind: 'row' | 'col' };
  }>();

  let hoverLane: { kind: 'row' | 'col'; index: number } | null = null;

  // Explicit reactive indices so Svelte always tracks selectedLane as a
  // dependency — avoids invalidation gaps when the component is in a slot.
  $: selectedRowIndex = selectedLane?.kind === 'row' ? selectedLane.index : -1;
  $: selectedColIndex = selectedLane?.kind === 'col' ? selectedLane.index : -1;
  $: hoverRowIndex = hoverLane?.kind === 'row' ? hoverLane.index : -1;
  $: hoverColIndex = hoverLane?.kind === 'col' ? hoverLane.index : -1;

  const HANDLE_W = 28;
  // The bus bar overhang is 30px (SLD_LAYOUT.busBarOverhang). Handles must end
  // at x < (margin - overhang) so they don't overlap the bus bar label text.
  const HANDLE_RIGHT_GAP = 34; // = busBarOverhang(30) + 4px clearance
  const ADD_SIZE = 24;
  const ADD_GAP = 8;
  const CORNER_R = 4;

  $: hasContent = layout.rows > 0 && layout.cols > 0;
  $: margin = hasContent ? layout.cellRect({ row: 0, col: 0 }).x : 90;
  $: cellWidth = hasContent ? layout.cellRect({ row: 0, col: 0 }).width : 0;
  $: handleX = margin - HANDLE_W - HANDLE_RIGHT_GAP;

  $: innerTop = layout.rowBoundaryY(0);
  $: innerBottom = layout.rowBoundaryY(layout.rows);
  $: innerHeight = innerBottom - innerTop;
  $: innerRight = hasContent ? layout.cellRect({ row: 0, col: layout.cols - 1 }).x + cellWidth : margin;

  $: colIndices = Array.from({ length: layout.cols }, (_, c) => c);
  $: rowIndices = Array.from({ length: layout.rows }, (_, r) => r);

  /** x of a column band — starts at the cell's left edge. */
  function colBandX(col: number): number {
    return layout.cellRect({ row: 0, col }).x;
  }

  /** Width of a column band — extends to next column's left edge, or just cellWidth for the last. */
  function colBandW(col: number): number {
    return col < layout.cols - 1 ? layout.cellRect({ row: 0, col: col + 1 }).x - colBandX(col) : cellWidth;
  }

  function rowTop(row: number): number {
    return layout.cellRect({ row, col: 0 }).y;
  }

  function rowHeight(row: number): number {
    return layout.cellRect({ row, col: 0 }).height;
  }

  function rowBandY(row: number): number {
    return layout.rowBoundaryY(row);
  }

  function rowBandH(row: number): number {
    return layout.rowBoundaryY(row + 1) - layout.rowBoundaryY(row);
  }
</script>

{#if hasContent}
  <!-- Column hit bands (interactive, behind elements).
       pointer-events="all" is required: SVG's default "visiblePainted" skips
       hit-testing on transparent fills, causing hover/click to pass through. -->
  {#each colIndices as col}
    <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
    <rect
      x={colBandX(col)}
      y={innerTop}
      width={colBandW(col)}
      height={innerHeight}
      fill={selectedColIndex === col
        ? 'hsl(var(--primary) / 0.12)'
        : hoverColIndex === col
          ? 'hsl(var(--primary) / 0.06)'
          : 'transparent'}
      stroke={selectedColIndex === col ? 'hsl(var(--primary))' : 'none'}
      stroke-width="1.5"
      stroke-dasharray="4 3"
      pointer-events="all"
      class="cursor-pointer"
      on:pointerenter={() => (hoverLane = { kind: 'col', index: col })}
      on:pointerleave={() => {
        if (hoverColIndex === col) hoverLane = null;
      }}
      on:click={() => dispatch('selectlane', { kind: 'col', index: col })}
    >
      <title>{L.columnTitle(col + 1)}</title>
    </rect>
  {/each}

  <!-- Row band highlights (pointer-events-none, shown when row selected/hovered) -->
  {#each rowIndices as row}
    {#if selectedRowIndex === row || hoverRowIndex === row}
      <rect
        x={margin}
        y={rowBandY(row)}
        width={innerRight - margin}
        height={rowBandH(row)}
        fill={selectedRowIndex === row ? 'hsl(var(--primary) / 0.12)' : 'hsl(var(--primary) / 0.06)'}
        stroke={selectedRowIndex === row ? 'hsl(var(--primary))' : 'none'}
        stroke-width="1.5"
        stroke-dasharray="4 3"
        class="pointer-events-none"
      />
    {/if}
  {/each}

  <!-- Row handle tabs (left margin, interactive) -->
  {#each rowIndices as row}
    <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
    <rect
      x={handleX}
      y={rowTop(row)}
      width={HANDLE_W}
      height={rowHeight(row)}
      rx={CORNER_R}
      fill={selectedRowIndex === row
        ? 'hsl(var(--primary) / 0.25)'
        : hoverRowIndex === row
          ? 'hsl(var(--primary) / 0.12)'
          : layout.rowKind(row) === 'busbar'
            ? 'hsl(var(--muted-foreground) / 0.15)'
            : 'hsl(var(--muted-foreground) / 0.08)'}
      stroke={selectedRowIndex === row ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
      stroke-width="1"
      class="cursor-pointer"
      on:pointerenter={() => (hoverLane = { kind: 'row', index: row })}
      on:pointerleave={() => {
        if (hoverRowIndex === row) hoverLane = null;
      }}
      on:click={() => dispatch('selectlane', { kind: 'row', index: row })}
    >
      <title>{L.rowTitle(row + 1)}</title>
    </rect>
    <text
      x={handleX + HANDLE_W / 2}
      y={rowTop(row) + rowHeight(row) / 2}
      text-anchor="middle"
      dominant-baseline="central"
      font-size="10"
      fill={selectedRowIndex === row ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
      class="pointer-events-none select-none">{row + 1}</text
    >
  {/each}

  <!-- "+" tab: add column (right edge of grid) -->
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <rect
    x={innerRight + ADD_GAP}
    y={innerTop}
    width={ADD_SIZE}
    height={innerHeight}
    rx={CORNER_R}
    fill="hsl(var(--primary) / 0.08)"
    stroke="hsl(var(--primary) / 0.3)"
    stroke-width="1"
    stroke-dasharray="4 3"
    class="cursor-pointer"
    on:click={() => dispatch('addlane', { kind: 'col' })}
  >
    <title>{L.addColumn}</title>
  </rect>
  <text
    x={innerRight + ADD_GAP + ADD_SIZE / 2}
    y={(innerTop + innerBottom) / 2}
    text-anchor="middle"
    dominant-baseline="central"
    font-size="16"
    font-weight="bold"
    fill="hsl(var(--primary) / 0.6)"
    class="pointer-events-none select-none">+</text
  >

  <!-- "+" tab: add row (below grid, in handle column) -->
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <rect
    x={handleX}
    y={innerBottom + ADD_GAP}
    width={HANDLE_W}
    height={ADD_SIZE}
    rx={CORNER_R}
    fill="hsl(var(--primary) / 0.08)"
    stroke="hsl(var(--primary) / 0.3)"
    stroke-width="1"
    stroke-dasharray="4 3"
    class="cursor-pointer"
    on:click={() => dispatch('addlane', { kind: 'row' })}
  >
    <title>{L.addRow}</title>
  </rect>
  <text
    x={handleX + HANDLE_W / 2}
    y={innerBottom + ADD_GAP + ADD_SIZE / 2}
    text-anchor="middle"
    dominant-baseline="central"
    font-size="16"
    font-weight="bold"
    fill="hsl(var(--primary) / 0.6)"
    class="pointer-events-none select-none">+</text
  >
{/if}
