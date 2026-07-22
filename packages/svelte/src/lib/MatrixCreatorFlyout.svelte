<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { DEFAULT_MATRIX_LABELS, type MatrixCreatorLabels } from './labels';

  /**
   * Word-style table-size picker: hover an N×M grid, click to scaffold.
   * The picker chooses SLOT rows/cols only — bus bars are inserted
   * afterwards with the dedicated tool, each in its own row.
   */
  export let labels: Partial<MatrixCreatorLabels> = {};

  $: L = { ...DEFAULT_MATRIX_LABELS, ...labels };

  const MAX = 8;

  const dispatch = createEventDispatcher<{ create: { rows: number; cols: number } }>();

  let hoverRows = 0;
  let hoverCols = 0;

  const range = Array.from({ length: MAX }, (_, i) => i);
</script>

<div class="rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
  <p class="mb-2 text-xs font-medium text-muted-foreground">{L.heading}</p>
  <div class="flex flex-col gap-1" on:pointerleave={() => ((hoverRows = 0), (hoverCols = 0))}>
    {#each range as r}
      <div class="flex gap-1">
        {#each range as c}
          <button
            class="h-5 w-5 rounded-sm border transition-colors {r < hoverRows && c < hoverCols
              ? 'border-primary bg-primary/30'
              : 'border-border bg-muted/40 hover:bg-muted'}"
            on:pointerenter={() => ((hoverRows = r + 1), (hoverCols = c + 1))}
            on:click={() => dispatch('create', { rows: r + 1, cols: c + 1 })}
          >
            <span class="sr-only">{r + 1} × {c + 1}</span>
          </button>
        {/each}
      </div>
    {/each}
  </div>
  <p class="mt-2 text-center text-xs tabular-nums text-muted-foreground">
    {hoverRows > 0 ? `${hoverRows} × ${hoverCols}` : '—'}
  </p>
</div>
