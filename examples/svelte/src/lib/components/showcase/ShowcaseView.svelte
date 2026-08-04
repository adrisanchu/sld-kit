<script lang="ts">
  // Example 1 — the interactive API showcase.
  // A tab per curated example; each shows three live-linked columns:
  // editable builder code → generated JSON → rendered SVG.
  import { onDestroy } from 'svelte';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import CodeEditor from './CodeEditor.svelte';
  import CodeBlock from './CodeBlock.svelte';
  import SvgPanel from './SvgPanel.svelte';
  import { SHOWCASE_EXAMPLES } from '$lib/showcase/examples';
  import { runExample, type RunResult } from '$lib/showcase/runExample';

  let active = SHOWCASE_EXAMPLES[0].id;

  // Per-tab editable code, seeded from the curated snippets.
  const codeById: Record<string, string> = Object.fromEntries(SHOWCASE_EXAMPLES.map((e) => [e.id, e.code]));

  let result: RunResult = { json: null, svg: null, error: null };
  let debounce: ReturnType<typeof setTimeout> | undefined;

  $: current = SHOWCASE_EXAMPLES.find((e) => e.id === active) ?? SHOWCASE_EXAMPLES[0];

  // Re-run whenever the active tab or its code changes (debounced).
  $: schedule(active, codeById[active]);

  function schedule(_id: string, code: string) {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      result = runExample(code);
    }, 250);
  }

  function reset() {
    codeById[active] = current.code;
  }

  onDestroy(() => clearTimeout(debounce));
</script>

<div class="flex h-full flex-col gap-4">
  <Tabs.Root bind:value={active} class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Tabs.List>
        {#each SHOWCASE_EXAMPLES as ex (ex.id)}
          <Tabs.Trigger value={ex.id}>{ex.label}</Tabs.Trigger>
        {/each}
      </Tabs.List>
      <Button variant="outline" size="sm" class="h-8 gap-1.5" on:click={reset}>
        <RotateCcw class="h-3.5 w-3.5" /> Reset code
      </Button>
    </div>

    <p class="mt-3 text-sm text-muted-foreground">{current.description}</p>

    <!-- One grid of three columns; stacks on narrow viewports. -->
    <div class="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
      <div class="flex min-h-[22rem] flex-col gap-1.5 lg:min-h-0">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-muted-foreground">1 · Builder code (editable)</span>
        </div>
        <div class="min-h-0 flex-1">
          <CodeEditor bind:value={codeById[active]} />
        </div>
      </div>

      <div class="flex min-h-[22rem] flex-col gap-1.5 lg:min-h-0">
        <span class="text-xs font-medium text-muted-foreground">2 · Serializer.toJSON(doc)</span>
        <div class="min-h-0 flex-1">
          {#if result.error}
            <div
              class="flex h-full items-start gap-2 overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
            >
              <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
              <span class="whitespace-pre-wrap font-mono">{result.error}</span>
            </div>
          {:else}
            <CodeBlock lang="json" text={result.json ?? ''} />
          {/if}
        </div>
      </div>

      <div class="flex min-h-[22rem] flex-col gap-1.5 lg:min-h-0">
        <span class="text-xs font-medium text-muted-foreground">3 · SvgExporter.export(doc)</span>
        <div class="min-h-0 flex-1">
          <SvgPanel svg={result.error ? '' : (result.svg ?? '')} filename={`${current.id}.svg`} />
        </div>
      </div>
    </div>
  </Tabs.Root>

  <p class="text-center text-xs text-muted-foreground">
    Runs entirely in your browser — the code is transpiled and executed client-side against the real
    <code class="rounded bg-muted px-1 py-0.5">@sld-kit/core</code> pipeline.
  </p>
</div>
