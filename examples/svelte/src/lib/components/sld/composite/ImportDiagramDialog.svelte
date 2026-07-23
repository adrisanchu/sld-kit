<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import Workflow from 'lucide-svelte/icons/workflow';
  import { sldLibrary, type SldLibraryEntry } from '$lib/stores/sldLibrary';

  /**
   * Lists library diagrams (kind !== 'composite', so no composite-in-composite)
   * for import into the composite. Importing the same diagram twice is allowed.
   */
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ import: { libraryId: string } }>();

  $: entries = $sldLibrary.filter((e) => (e.kind ?? 'diagram') !== 'composite');

  function pick(entry: SldLibraryEntry) {
    dispatch('import', { libraryId: entry.id });
    open = false;
  }

  function subtitle(entry: SldLibraryEntry): string {
    return (
      [entry.substation, entry.voltageKv ? `${entry.voltageKv} kV` : null].filter(Boolean).join(' · ') || 'No metadata'
    );
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Import diagram</Dialog.Title>
      <Dialog.Description>Choose a diagram from the library to add it to the composition.</Dialog.Description>
    </Dialog.Header>

    {#if entries.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">No diagrams in the library.</p>
    {:else}
      <div class="max-h-80 space-y-1 overflow-y-auto py-1">
        {#each entries as entry (entry.id)}
          <button
            class="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent"
            on:click={() => pick(entry)}
          >
            <Workflow class="h-5 w-5 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{entry.name}</span>
              <span class="block truncate text-xs text-muted-foreground">{subtitle(entry)}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
