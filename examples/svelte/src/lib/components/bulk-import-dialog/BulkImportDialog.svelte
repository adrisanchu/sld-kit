<script lang="ts">
  import { base } from '$app/paths';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Badge, type Variant } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import Workflow from 'lucide-svelte/icons/workflow';
  import Layers from 'lucide-svelte/icons/layers';
  import FileX from 'lucide-svelte/icons/file-x';
  import type { ImportResult, ImportStatus } from '$lib/sld/bulkImport';

  /**
   * Progress + per-file summary of a bulk (folder) import. Presentational only:
   * the page runs `importFiles` and feeds progress and results in.
   */
  export let open: boolean = false;
  export let running: boolean = false;
  export let done: number = 0;
  export let total: number = 0;
  export let results: ImportResult[] = [];

  /** Rows rendered per "Show more" step — keeps thousands of results cheap. */
  const PAGE = 200;

  type Filter = 'all' | ImportStatus;
  let filter: Filter = 'all';
  let limit = PAGE;

  const STATUS: Record<ImportStatus, { label: string; variant: Variant }> = {
    imported: { label: 'Imported', variant: 'green' },
    warning: { label: 'Warning', variant: 'yellow' },
    error: { label: 'Error', variant: 'rose' },
    skipped: { label: 'Skipped', variant: 'outline' }
  };
  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'imported', label: 'Imported' },
    { value: 'warning', label: 'Warnings' },
    { value: 'error', label: 'Errors' },
    { value: 'skipped', label: 'Skipped' }
  ];

  // A new run starts from the full list.
  $: if (running) filter = 'all';
  // Changing the filter starts paging over.
  $: filter, (limit = PAGE);

  $: counts = results.reduce<Record<Filter, number>>(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { all: results.length, imported: 0, warning: 0, error: 0, skipped: 0 }
  );
  $: visible = filter === 'all' ? results : results.filter((r) => r.status === filter);
  $: percent = total > 0 ? Math.round((done / total) * 100) : 0;
</script>

<Dialog.Root bind:open>
  <Dialog.Overlay />
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{running ? 'Importing…' : 'Import summary'}</Dialog.Title>
      <Dialog.Description>
        {#if running}
          Validating and importing {total} files.
        {:else}
          {counts.imported + counts.warning} of {results.length} files imported.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if running}
      <div class="space-y-2 py-2">
        <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div class="h-full bg-primary transition-[width]" style="width: {percent}%" />
        </div>
        <p class="text-right text-xs tabular-nums text-muted-foreground">{done} / {total} files</p>
      </div>
    {:else}
      <Tabs.Root bind:value={filter}>
        <Tabs.List class="h-auto flex-wrap">
          {#each FILTERS as f (f.value)}
            <Tabs.Trigger value={f.value} disabled={f.value !== 'all' && counts[f.value] === 0}>
              {f.label}
              <span class="ml-1.5 text-xs tabular-nums text-muted-foreground">{counts[f.value]}</span>
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>

      <div class="max-h-[60vh] space-y-1 overflow-y-auto py-1">
        {#each visible.slice(0, limit) as result (result.path)}
          {@const failed = result.status === 'error' || result.status === 'skipped'}
          <div class="flex items-start gap-3 rounded-md border border-transparent px-3 py-2 hover:border-border">
            {#if failed}
              <FileX class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            {:else if result.kind === 'composite'}
              <Layers class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            {:else}
              <Workflow class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            {/if}
            <div class="min-w-0 flex-1">
              {#if result.id}
                <a
                  href="{base}/sld/{result.id}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block truncate text-sm font-medium hover:underline"
                >
                  {result.name || result.path}
                </a>
              {:else}
                <span class="block truncate text-sm font-medium" title={result.path}>{result.name || result.path}</span>
              {/if}
              {#if result.name}
                <span class="block truncate text-xs text-muted-foreground" title={result.path}>{result.path}</span>
              {/if}
              {#each result.messages as message}
                <p class="text-xs text-muted-foreground">{message}</p>
              {/each}
            </div>
            <Badge variant={STATUS[result.status].variant} class="shrink-0">{STATUS[result.status].label}</Badge>
          </div>
        {:else}
          <p class="py-6 text-center text-sm text-muted-foreground">No files.</p>
        {/each}
        {#if visible.length > limit}
          <div class="flex justify-center pt-2">
            <Button variant="ghost" size="sm" on:click={() => (limit += PAGE)}>
              Show more ({visible.length - limit} remaining)
            </Button>
          </div>
        {/if}
      </div>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" on:click={() => (open = false)}>{running ? 'Hide' : 'Close'}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
