<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import ConfirmationDialog from '$lib/components/confirmation-dialog/ConfirmationDialog.svelte';
  import NewDiagramDialog from '$lib/components/new-diagram-dialog/NewDiagramDialog.svelte';
  import Workflow from 'lucide-svelte/icons/workflow';
  import Layers from 'lucide-svelte/icons/layers';
  import CirclePlus from 'lucide-svelte/icons/circle-plus';
  import Upload from 'lucide-svelte/icons/upload';
  import Search from 'lucide-svelte/icons/search';
  import Copy from 'lucide-svelte/icons/copy';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { SldDocument, CompositeDocument, Serializer, CompositeSerializer, SldParseError, newId } from '@sld-kit/core';
  import { SLD_DEMOS, SLD_COMPOSITE_DEMOS, buildDemoById } from '$lib/sld/demoFixture';
  import { sldLibrary, detectDocumentKind, type SldLibraryEntry } from '$lib/stores/sldLibrary';

  let fileInput: HTMLInputElement;
  let deleteTarget: SldLibraryEntry | null = null;
  let deleteOpen = false;
  let newDiagramOpen = false;
  let query = '';

  // Filter by name or substation (case-insensitive), then split by kind so
  // diagrams and compositions render in their own column. Legacy entries have
  // no `kind` — treat them as diagrams.
  $: q = query.trim().toLowerCase();
  $: filtered = $sldLibrary.filter(
    (e) => q === '' || e.name.toLowerCase().includes(q) || (e.substation ?? '').toLowerCase().includes(q)
  );
  $: diagrams = filtered.filter((e) => e.kind !== 'composite');
  $: compositions = filtered.filter((e) => e.kind === 'composite');

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

<div class="flex min-h-0 flex-col md:h-screen">
  <header class="border-b px-6 py-4">
    <p class="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Example 02</p>
    <h1 class="mt-1 text-xl font-semibold tracking-tight">Interactive editor</h1>
    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
      Open a diagram or composition to edit it live with full undo/redo and SVG export.
    </p>
  </header>

  <div class="min-h-0 flex-1 overflow-auto p-6">
    <div class="mx-auto max-w-6xl">
      <input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" on:change={onImport} />

      <!-- Toolbar: search (name or substation) + import -->
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
          <Search class="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input class="pl-8" placeholder="Search by name or substation…" bind:value={query} />
        </div>
        {#if q}
          <p class="text-sm text-muted-foreground">
            Showing {filtered.length} of {$sldLibrary.length}
          </p>
        {/if}
        <Button variant="outline" size="sm" on:click={() => fileInput.click()}>
          <Upload class="mr-2 h-4 w-4" />
          Import JSON
        </Button>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- Diagrams -->
        <section class="flex min-h-0 flex-col">
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Workflow class="h-4 w-4 text-muted-foreground" />
              <h2 class="text-sm font-semibold tracking-tight">Diagrams</h2>
              <span class="text-xs text-muted-foreground">{diagrams.length}</span>
            </div>
            <Button variant="outline" size="sm" on:click={() => (newDiagramOpen = true)}>
              <CirclePlus class="mr-2 h-4 w-4" />
              New diagram
            </Button>
          </div>
          <div class="space-y-3 lg:max-h-[85vh] lg:overflow-y-auto lg:pr-1">
            {#each diagrams as entry (entry.id)}
              <Card.Root class="group relative transition-colors hover:bg-accent/50">
                <a href="{base}/sld/{entry.id}" class="block">
                  <Card.Header>
                    <div class="flex items-center gap-2">
                      <Workflow class="h-5 w-5 shrink-0 text-muted-foreground" />
                      <Card.Title class="truncate text-base">{entry.name}</Card.Title>
                    </div>
                    <Card.Description class="truncate">
                      {[entry.substation, entry.voltageKv ? `${entry.voltageKv} kV` : null]
                        .filter(Boolean)
                        .join(' · ') || 'No metadata'}
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
            {:else}
              <div class="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {q ? 'No diagrams match your search.' : 'No diagrams yet. Create a new one or import a JSON file.'}
              </div>
            {/each}
          </div>
        </section>

        <!-- Compositions -->
        <section class="flex min-h-0 flex-col">
          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Layers class="h-4 w-4 text-muted-foreground" />
              <h2 class="text-sm font-semibold tracking-tight">Compositions</h2>
              <span class="text-xs text-muted-foreground">{compositions.length}</span>
            </div>
            <Button variant="outline" size="sm" on:click={createNewComposite}>
              <CirclePlus class="mr-2 h-4 w-4" />
              New composition
            </Button>
          </div>
          <div class="space-y-3 lg:max-h-[85vh] lg:overflow-y-auto lg:pr-1">
            {#each compositions as entry (entry.id)}
              <Card.Root class="group relative transition-colors hover:bg-accent/50">
                <a href="{base}/sld/{entry.id}" class="block">
                  <Card.Header>
                    <div class="flex items-center gap-2">
                      <Layers class="h-5 w-5 shrink-0 text-muted-foreground" />
                      <Card.Title class="truncate text-base">{entry.name}</Card.Title>
                    </div>
                    <Card.Description class="truncate">Overview</Card.Description>
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
            {:else}
              <div class="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {q ? 'No compositions match your search.' : 'No compositions yet. Create one to combine diagrams.'}
              </div>
            {/each}
          </div>
        </section>
      </div>
    </div>
  </div>
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
