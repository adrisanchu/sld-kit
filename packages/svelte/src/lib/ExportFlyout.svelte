<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileJson from 'lucide-svelte/icons/file-json';
  import ImageIcon from 'lucide-svelte/icons/image';
  import { DEFAULT_EXPORT_LABELS, type ExportFlyoutLabels } from './labels';

  export let labels: Partial<ExportFlyoutLabels> = {};

  $: L = { ...DEFAULT_EXPORT_LABELS, ...labels };

  const dispatch = createEventDispatcher<{ json: void; svg: void }>();
</script>

<div class="flex w-44 flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm">
  <button
    class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
    on:click={() => dispatch('json')}
  >
    <FileJson class="h-4 w-4 text-muted-foreground" />
    <span>{L.json}</span>
  </button>
  <button
    class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
    on:click={() => dispatch('svg')}
  >
    <ImageIcon class="h-4 w-4 text-muted-foreground" />
    <span>{L.svg}</span>
  </button>
</div>
