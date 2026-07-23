<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';

  // The editor lives under /sld; the root just forwards there.
  onMount(() => {
    goto(`${base}/sld`, { replaceState: true });
  });
</script>

<div class="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
