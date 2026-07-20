<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import X from 'lucide-svelte/icons/x';
  import { DEFAULT_LANE_ACTION_CHIP_LABELS, type LaneActionChipLabels } from './labels';

  /**
   * Floating chip that shows info about the selected lane and offers a delete
   * action. Positioned in screen pixels by the parent (the editor). Uses the
   * same absolute-positioning pattern as ExternalAssetPopover.
   *
   * For columns: anchor at top-center of the column band.
   * For rows: anchor at right-center of the row handle.
   */
  export let x: number;
  export let y: number;
  export let lane: { kind: 'row' | 'col'; index: number };
  /** Ids of elements occupying this lane (bars + positions). */
  export let occupants: string[] = [];
  export let isBarRow: boolean = false;
  export let canDelete: boolean = false;
  export let deleteTooltip: string = '';
  export let labels: Partial<LaneActionChipLabels> = {};

  $: L = { ...DEFAULT_LANE_ACTION_CHIP_LABELS, ...labels };

  $: title = lane.kind === 'col' ? L.columnTitle(lane.index + 1) : L.rowTitle(lane.index + 1);

  $: positionsCount = isBarRow ? Math.max(0, occupants.length - 1) : occupants.length;

  $: occupancyLine = (() => {
    if (lane.kind === 'col') {
      return positionsCount === 0 ? L.empty : L.positions(positionsCount);
    } else {
      if (!isBarRow && positionsCount === 0) return L.empty;
      const parts: string[] = [];
      if (positionsCount > 0) parts.push(L.positions(positionsCount));
      if (isBarRow) parts.push(L.busBar);
      return parts.join(' · ');
    }
  })();

  // Column chip: appears above the anchor (top-center of column).
  // Row chip: appears to the right of the anchor (right-center of handle).
  $: transform = lane.kind === 'col' ? 'translate(-50%, calc(-100% - 6px))' : 'translate(6px, -50%)';

  const dispatch = createEventDispatcher<{ delete: void; close: void }>();
</script>

<div
  class="absolute z-30 min-w-36 rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
  style="left: {x}px; top: {y}px; transform: {transform};"
>
  <div class="flex items-center justify-between gap-2">
    <span class="text-xs font-semibold">{title}</span>
    <button
      class="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
      on:click={() => dispatch('close')}
    >
      <X class="h-3 w-3" />
    </button>
  </div>
  <p class="mt-0.5 text-xs text-muted-foreground">{occupancyLine}</p>
  <div class="mt-1.5 flex justify-end">
    <button
      class="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={!canDelete}
      title={canDelete ? L.delete : deleteTooltip}
      on:click={() => dispatch('delete')}
    >
      <Trash2 class="h-3 w-3" />
      {L.delete}
    </button>
  </div>
</div>
