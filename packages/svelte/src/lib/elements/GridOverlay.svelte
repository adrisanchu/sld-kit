<script lang="ts">
  import type { Cell, DiagramLayout } from '@sld-kit/core';

  /**
   * Edit-mode overlay: dashed outlines for every free slot, plus a
   * highlighted drop target (green = valid, red = invalid) and the cells a
   * reflow would displace elements into (amber).
   */
  export let layout: DiagramLayout;
  /** Slot currently hovered/targeted by a placement or drag. */
  export let highlight: { cell: Cell; valid: boolean } | null = null;
  /** Destination cells of the displacement chain a drop would cause. */
  export let chainCells: Cell[] = [];
  /** Row boundary index highlighted by the bus bar insertion tool. */
  export let boundaryAt: number | null = null;

  $: slotRows = Array.from({ length: layout.rows }, (_, r) => r).filter((r) => layout.rowKind(r) === 'slots');
  $: cols = Array.from({ length: layout.cols }, (_, c) => c);

  function isHighlight(r: number, c: number): boolean {
    return highlight !== null && highlight.cell.row === r && highlight.cell.col === c;
  }

  function isChain(r: number, c: number): boolean {
    return chainCells.some((cell) => cell.row === r && cell.col === c);
  }
</script>

<g class="pointer-events-none">
  {#each slotRows as r}
    {#each cols as c}
      {@const rect = layout.cellRect({ row: r, col: c })}
      <rect
        x={rect.x + 2}
        y={rect.y + 2}
        width={rect.width - 4}
        height={rect.height - 4}
        rx="4"
        fill={isHighlight(r, c)
          ? highlight?.valid
            ? 'hsl(142 71% 45% / 0.15)'
            : 'hsl(0 72% 51% / 0.15)'
          : isChain(r, c)
            ? 'hsl(38 92% 50% / 0.12)'
            : 'none'}
        stroke={isHighlight(r, c)
          ? highlight?.valid
            ? 'hsl(142 71% 45%)'
            : 'hsl(0 72% 51%)'
          : isChain(r, c)
            ? 'hsl(38 92% 50%)'
            : 'hsl(var(--muted-foreground) / 0.25)'}
        stroke-width={isHighlight(r, c) || isChain(r, c) ? 1.5 : 1}
        stroke-dasharray="4 3"
      />
    {/each}
  {/each}

  {#if boundaryAt !== null}
    {@const y = layout.rowBoundaryY(boundaryAt)}
    <line
      x1={layout.cellRect({ row: 0, col: 0 }).x - 20}
      y1={y}
      x2={layout.cellRect({ row: 0, col: Math.max(0, layout.cols - 1) }).x +
        layout.cellRect({ row: 0, col: 0 }).width +
        20}
      y2={y}
      stroke="hsl(var(--primary))"
      stroke-width="3"
      stroke-linecap="round"
    />
  {/if}
</g>
