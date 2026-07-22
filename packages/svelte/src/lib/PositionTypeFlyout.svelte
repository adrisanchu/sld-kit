<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import type { PositionType } from '@sld-kit/core';
  import { DEFAULT_POSITION_TYPE_LABELS } from './labels';

  /**
   * Split-button companion of the "add position" tool: a chevron that opens a
   * small panel to pick the position type for the next placements. Stateless —
   * the selected `positionType` is owned by the parent and updated through the
   * `settype` event (the app persists it, e.g. to localStorage).
   */
  export let isActive: boolean = false;
  /** Currently selected position type (owned by the parent). */
  export let positionType: PositionType = 'line';
  /** Selectable types, in display order. */
  export let positionTypes: PositionType[] = ['line', 'transformer', 'central', 'renewable', 'reserve'];
  /** Label per position type. */
  export let labels: Record<string, string> = DEFAULT_POSITION_TYPE_LABELS;
  /** Tooltip on the chevron trigger. */
  export let title: string = 'Position type';

  const dispatch = createEventDispatcher<{ settype: PositionType }>();

  let open = false;

  function choose(type: PositionType) {
    dispatch('settype', type);
    open = false;
  }
</script>

<div class="relative">
  <button
    {title}
    class="flex h-8 w-4 items-center justify-center rounded-full transition-colors {open || isActive
      ? 'text-foreground'
      : 'text-muted-foreground hover:text-foreground'}"
    on:click={() => (open = !open)}
  >
    <span class="sr-only">{title}</span>
    <ChevronUp class="h-3 w-3 {open ? 'rotate-180' : ''} transition-transform" />
  </button>

  {#if open}
    <div
      class="absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm"
    >
      {#each positionTypes as type}
        <button
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent {positionType ===
          type
            ? 'bg-accent/60 font-medium'
            : ''}"
          on:click={() => choose(type)}
        >
          <span class="h-3 w-3 shrink-0 rounded-full" style="background: hsl(var(--sld-pos-{type}));" />
          <span>{labels[type] ?? type}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
