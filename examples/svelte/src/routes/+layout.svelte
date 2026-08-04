<script lang="ts">
  import '../app.css';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import AppShell from '$lib/components/layout/AppShell.svelte';
</script>

<ModeWatcher />
<Toaster />

<AppShell>
  <slot />
</AppShell>
