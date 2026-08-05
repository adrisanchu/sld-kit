<script lang="ts">
  // Example 1 — the interactive API showcase page.
  import ShowcaseView from '$lib/components/showcase/ShowcaseView.svelte';
</script>

<svelte:head>
  <title>API Showcase · SLD-KIT</title>
</svelte:head>

<div class="flex min-h-0 flex-col lg:h-screen">
  <header class="border-b px-6 py-4">
    <p class="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Example 01</p>
    <h1 class="mt-1 text-xl font-semibold tracking-tight">Core API showcase</h1>
    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
      Edit the builder code on the left; the JSON and SVG are regenerated live through the real
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">@sld-kit/core</code> pipeline.
    </p>
  </header>

  <div class="min-h-0 flex-1 overflow-auto p-6">
    <ShowcaseView />
  </div>
</div>
