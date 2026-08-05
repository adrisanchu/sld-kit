<script lang="ts">
  // App-shell chrome: a responsive sidebar + the routed page content.
  //  - Desktop (≥ md): a persistent aside, collapsible to an icon rail
  //    (state persisted in `uiSettings`).
  //  - Mobile (< md): a top bar with a hamburger that opens the same nav in a
  //    Sheet drawer.
  import Menu from 'lucide-svelte/icons/menu';
  import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
  import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';
  import Zap from 'lucide-svelte/icons/zap';
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
  import { uiSettings } from '$lib/stores/uiSettings';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import SidebarContent from './SidebarContent.svelte';

  let mobileOpen = false;

  $: collapsed = $uiSettings.sidebarCollapsed;

  function toggleCollapsed() {
    uiSettings.update((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }));
  }
</script>

<div class="flex h-dvh overflow-hidden bg-background">
  <!-- Desktop sidebar -->
  <aside
    class={cn(
      'hidden h-full shrink-0 flex-col border-r bg-background transition-[width] duration-200 md:flex',
      collapsed ? 'w-16' : 'w-56'
    )}
  >
    <div class="min-h-0 flex-1 overflow-y-auto">
      <SidebarContent {collapsed} />
    </div>
    <button
      type="button"
      on:click={toggleCollapsed}
      class="flex items-center justify-center border-t py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {#if collapsed}
        <PanelLeftOpen class="h-5 w-5" />
      {:else}
        <PanelLeftClose class="h-5 w-5" />
      {/if}
    </button>
  </aside>

  <!-- Content column -->
  <div class="flex min-w-0 flex-1 flex-col">
    <!-- Mobile top bar -->
    <header class="flex items-center gap-2 border-b px-3 py-2 md:hidden">
      <Sheet.Root bind:open={mobileOpen}>
        <Sheet.Trigger asChild let:builder>
          <Button builders={[builder]} variant="ghost" size="icon" class="h-9 w-9" aria-label="Open menu">
            <Menu class="h-5 w-5" />
          </Button>
        </Sheet.Trigger>
        <Sheet.Content side="left" class="w-64 p-0">
          <SidebarContent collapsed={false} onNavigate={() => (mobileOpen = false)} />
        </Sheet.Content>
      </Sheet.Root>
      <a href="{base}/" class="flex items-center gap-2 font-semibold">
        <Zap class="h-5 w-5 text-primary" /> SLD-KIT
      </a>
    </header>

    <main class="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</div>
