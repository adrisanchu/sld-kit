<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import ConfirmationDialog from '$lib/components/confirmation-dialog/ConfirmationDialog.svelte';
  import NewDiagramDialog from '$lib/components/new-diagram-dialog/NewDiagramDialog.svelte';
  import Workflow from 'lucide-svelte/icons/workflow';
  import Layers from 'lucide-svelte/icons/layers';
  import CirclePlus from 'lucide-svelte/icons/circle-plus';
  import Upload from 'lucide-svelte/icons/upload';
  import Copy from 'lucide-svelte/icons/copy';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { SldDocument, CompositeDocument, Serializer, CompositeSerializer, SldParseError, newId } from '@sld-kit/core';
  import { SLD_DEMOS, SLD_COMPOSITE_DEMOS, buildDemoById } from '$lib/sld/demoFixture';
  import { sldLibrary, detectDocumentKind, type SldLibraryEntry } from '$lib/stores/sldLibrary';

  let fileInput: HTMLInputElement;
  let deleteTarget: SldLibraryEntry | null = null;
  let deleteOpen = false;
  let newDiagramOpen = false;

  onMount(() => {
    // Ensure each demo diagram exists, so newly added demos reach returning
    // users too (only seeds a demo whose id is missing — never overwrites an
    // edited one).
    SLD_DEMOS.forEach((d) => {
      if (!sldLibrary.exists(d.id)) {
        const doc = buildDemoById(d.id);
        if (doc) sldLibrary.saveDoc(doc);
      }
    });
    // Seed composite demos too — their referenced children are seeded above.
    SLD_COMPOSITE_DEMOS.forEach((d) => {
      if (!sldLibrary.exists(d.id)) sldLibrary.saveComposite(CompositeSerializer.toJSON(d.build()));
    });
    sldLibrary.refresh();
  });

  function createNew(e: CustomEvent<{ name: string; substation?: string; voltageKv?: number }>) {
    const { name, substation, voltageKv } = e.detail;
    const doc = new SldDocument({ name, substation, voltageKv }, { rows: 0, cols: 0 });
    sldLibrary.saveDoc(doc);
    goto(`${base}/sld/${doc.meta.id}`);
  }

  function createNewComposite() {
    const doc = new CompositeDocument({ name: 'New composition' });
    sldLibrary.saveComposite(CompositeSerializer.toJSON(doc));
    goto(`${base}/sld/${doc.meta.id}`);
  }

  async function onImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (detectDocumentKind(parsed) === 'composite') {
        const composite = CompositeSerializer.fromJSON(parsed);
        composite.meta.id = newId(); // import as a new composite, never overwrite
        sldLibrary.saveComposite(CompositeSerializer.toJSON(composite));
        toast.success('Composition imported');
        goto(`${base}/sld/${composite.meta.id}`);
        return;
      }
      const doc = Serializer.fromJSON(parsed);
      doc.meta.id = newId(); // import as a new diagram, never overwrite
      sldLibrary.saveDoc(doc);
      toast.success('Diagram imported');
      goto(`${base}/sld/${doc.meta.id}`);
    } catch (err) {
      toast.error(err instanceof SldParseError ? `Invalid document: ${err.message}` : 'Invalid JSON file');
    } finally {
      input.value = '';
    }
  }

  function duplicate(entry: SldLibraryEntry) {
    const id = sldLibrary.duplicate(entry.id);
    if (id) toast.success('Diagram duplicated');
  }

  function requestDelete(entry: SldLibraryEntry) {
    deleteTarget = entry;
    deleteOpen = true;
  }

  function confirmDelete() {
    if (deleteTarget) sldLibrary.remove(deleteTarget.id);
    deleteTarget = null;
    deleteOpen = false;
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return '';
    }
  }
</script>

<div class="mx-auto max-w-7xl p-6">
  <div class="mb-4 mt-2 flex items-center justify-between sm:mt-0">
    <h1 class="scroll-m-20 text-2xl font-bold tracking-tight lg:text-3xl">Single-line diagrams</h1>
    <div class="flex items-center gap-2">
      <Button variant="outline" size="sm" on:click={() => fileInput.click()}>
        <Upload class="mr-2 h-4 w-4" />
        Import JSON
      </Button>
      <Button variant="outline" size="sm" on:click={createNewComposite}>
        <Layers class="mr-2 h-4 w-4" />
        New composition
      </Button>
      <Button size="sm" on:click={() => (newDiagramOpen = true)}>
        <CirclePlus class="mr-2 h-4 w-4" />
        New diagram
      </Button>
    </div>
  </div>

  <input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" on:change={onImport} />

  {#if $sldLibrary.length === 0}
    <div class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <Workflow class="h-10 w-10 text-muted-foreground" />
      <p class="text-sm text-muted-foreground">No diagrams yet. Create a new one or import a JSON file.</p>
      <Button size="sm" on:click={() => (newDiagramOpen = true)}>
        <CirclePlus class="mr-2 h-4 w-4" />
        New diagram
      </Button>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#each $sldLibrary as entry (entry.id)}
        <Card.Root class="group relative transition-colors hover:bg-accent/50">
          <a href="{base}/sld/{entry.id}" class="block">
            <Card.Header>
              <div class="flex items-center gap-2">
                {#if entry.kind === 'composite'}
                  <Layers class="h-5 w-5 shrink-0 text-muted-foreground" />
                {:else}
                  <Workflow class="h-5 w-5 shrink-0 text-muted-foreground" />
                {/if}
                <Card.Title class="truncate text-base">{entry.name}</Card.Title>
                {#if entry.kind === 'composite'}
                  <Badge variant="secondary" class="shrink-0">Composition</Badge>
                {/if}
              </div>
              <Card.Description class="truncate">
                {entry.kind === 'composite'
                  ? 'Overview'
                  : [entry.substation, entry.voltageKv ? `${entry.voltageKv} kV` : null].filter(Boolean).join(' · ') ||
                    'No metadata'}
              </Card.Description>
              <p class="text-xs text-muted-foreground">{formatDate(entry.updatedAt)}</p>
            </Card.Header>
          </a>
          <div class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              title="Duplicate"
              class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              on:click|preventDefault={() => duplicate(entry)}
            >
              <Copy class="h-4 w-4" />
            </button>
            <button
              title="Delete"
              class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
              on:click|preventDefault={() => requestDelete(entry)}
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>

<NewDiagramDialog bind:open={newDiagramOpen} on:create={createNew} />

<ConfirmationDialog
  bind:open={deleteOpen}
  title="Delete diagram"
  description={`Delete "${deleteTarget?.name ?? ''}"? This action cannot be undone.`}
  confirmText="Delete"
  cancelText="Cancel"
  confirmVariant="destructive"
  on:confirm={confirmDelete}
  on:cancel={() => {
    deleteOpen = false;
    deleteTarget = null;
  }}
/>
