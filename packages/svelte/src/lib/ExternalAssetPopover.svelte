<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { ExternalAssetKind } from '@sld-kit/core';
  import { DEFAULT_EXTERNAL_ASSET_LABELS, type ExternalAssetPopoverLabels } from './labels';

  /**
   * Small HTML form shown when the user ends a connection in the margin
   * (outside the grid): choose the external asset kind and its label.
   * Positioned in screen pixels over the canvas by the parent.
   */
  export let x: number;
  export let y: number;
  export let labels: Partial<ExternalAssetPopoverLabels> = {};

  $: L = { ...DEFAULT_EXTERNAL_ASSET_LABELS, ...labels, kinds: { ...DEFAULT_EXTERNAL_ASSET_LABELS.kinds, ...labels.kinds } };

  const dispatch = createEventDispatcher<{
    confirm: { asset: ExternalAssetKind; label: string };
    cancel: void;
  }>();

  const order: ExternalAssetKind[] = ['line', 'transformer', 'renewable', 'storage', 'demand'];

  let asset: ExternalAssetKind = 'line';
  let label = '';
  let inputEl: HTMLInputElement;

  onMount(() => inputEl?.focus());

  function confirm() {
    // Empty label → the editor auto-names it (line-1, trf-2, …).
    dispatch('confirm', { asset, label: label.trim() });
  }

  function onKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') dispatch('cancel');
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="absolute z-30 w-56 rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
  style="left: {x}px; top: {y}px;"
  on:keydown={onKeydown}
>
  <p class="mb-1.5 text-xs font-medium text-muted-foreground">{L.heading}</p>
  <select bind:value={asset} class="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
    {#each order as k}
      <option value={k}>{L.kinds[k]}</option>
    {/each}
  </select>
  <input
    bind:this={inputEl}
    bind:value={label}
    placeholder={L.placeholder}
    class="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
  />
  <div class="flex justify-end gap-1.5">
    <button
      class="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
      on:click={() => dispatch('cancel')}
    >
      {L.cancel}
    </button>
    <button
      class="h-7 rounded-md bg-primary px-2 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
      on:click={confirm}
    >
      {L.confirm}
    </button>
  </div>
</div>
