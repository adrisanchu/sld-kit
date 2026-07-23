<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import Check from 'lucide-svelte/icons/check';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import SldEditor from '$lib/components/sld/SldEditor.svelte';
  import CompositeEditor from '$lib/components/sld/composite/CompositeEditor.svelte';
  import { CompositeSerializer, type SldDocument, type CompositeDocument } from '@sld-kit/core';
  import { buildDemoById, SLD_DEMOS, SLD_COMPOSITE_DEMOS } from '$lib/sld/demoFixture';
  import { sldLibrary } from '$lib/stores/sldLibrary';

  // Demo tool: editing is always enabled, decoupled from any host app's RBAC.
  const userRole = 'editor';

  const id = $page.params.id ?? '';
  let doc: SldDocument | null = null;
  let compositeDoc: CompositeDocument | null = null;
  let name = '';
  let saving = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubDoc: (() => void) | undefined;

  onMount(() => {
    // Seed a demo on demand (deep-link / refresh) if it is missing.
    if (!sldLibrary.exists(id)) {
      const composite = SLD_COMPOSITE_DEMOS.find((d) => d.id === id);
      if (composite) {
        // A composite references its child diagrams by id; seed those too (as
        // the library index does) so resolveChildren finds them and the
        // inter-diagram links render. Without this, deep-linking straight to a
        // composite leaves the children unresolved (placeholders, no links).
        SLD_DEMOS.forEach((d) => {
          if (!sldLibrary.exists(d.id)) {
            const child = buildDemoById(d.id);
            if (child) sldLibrary.saveDoc(child);
          }
        });
        sldLibrary.saveComposite(CompositeSerializer.toJSON(composite.build()));
      } else {
        const demo = buildDemoById(id);
        if (demo) sldLibrary.saveDoc(demo);
      }
    }

    if (sldLibrary.kindOf(id) === 'composite') {
      const json = sldLibrary.loadCompositeJson(id);
      if (!json) return notFound();
      try {
        const loaded = CompositeSerializer.fromJSON(json);
        loaded.resolveChildren(sldLibrary.resolver);
        compositeDoc = loaded;
        name = loaded.meta.name;
        unsubDoc = loaded.subscribe(scheduleSave);
      } catch {
        return notFound();
      }
      return;
    }

    const loaded = sldLibrary.load(id);
    if (!loaded) return notFound();
    doc = loaded;
    name = doc.meta.name;
    // Autosave: every document mutation (command or rename) schedules a
    // debounced write back to the localStorage library.
    unsubDoc = doc.subscribe(scheduleSave);
  });

  function notFound() {
    toast.error('Diagram not found');
    goto(`${base}/sld`);
  }

  onDestroy(() => {
    unsubDoc?.();
    clearTimeout(saveTimer);
  });

  function scheduleSave() {
    saving = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (doc) sldLibrary.saveDoc(doc);
      else if (compositeDoc) sldLibrary.saveComposite(CompositeSerializer.toJSON(compositeDoc));
      saving = false;
    }, 500);
  }

  function commitName() {
    const next = name.trim() || 'Untitled';
    name = next;
    // emits → scheduleSave via subscription
    (doc ?? compositeDoc)?.updateMeta({ name: next });
  }
</script>

<div class="mx-auto flex h-screen max-w-7xl flex-col p-4">
  <div class="flex shrink-0 items-center gap-3 py-1">
    <a
      href="{base}/sld"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Back to list"
    >
      <ArrowLeft class="h-4 w-4" />
      <span class="sr-only">Back</span>
    </a>
    {#if doc || compositeDoc}
      <input
        class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-bold tracking-tight outline-none hover:border-input focus:border-input lg:text-2xl"
        bind:value={name}
        on:change={commitName}
        on:blur={commitName}
        placeholder="Untitled"
      />
      <span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Saved locally">
        {#if saving}
          <LoaderCircle class="h-3.5 w-3.5 animate-spin" /> Saving…
        {:else}
          <Check class="h-3.5 w-3.5" /> Saved
        {/if}
      </span>
    {/if}
  </div>

  <div class="relative mt-2 w-full flex-1 overflow-hidden rounded-lg border bg-background">
    {#if compositeDoc}
      <CompositeEditor doc={compositeDoc} {userRole} />
    {:else if doc}
      <SldEditor {doc} {userRole} />
    {/if}
  </div>
</div>
