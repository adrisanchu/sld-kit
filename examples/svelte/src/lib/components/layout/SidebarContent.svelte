<script lang="ts">
  // Inner content of the app sidebar — shared by the desktop aside and the
  // mobile Sheet drawer. `collapsed` renders an icon-only rail (desktop only);
  // `onNavigate` lets the mobile drawer close itself on link click.
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import Github from 'lucide-svelte/icons/github';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Zap from 'lucide-svelte/icons/zap';
  import { toggleMode } from 'mode-watcher';
  import { cn } from '$lib/utils';
  import { NAV_ITEMS, GITHUB_URL } from './navItems';

  export let collapsed = false;
  export let onNavigate: (() => void) | undefined = undefined;

  // Pathname with the (possibly empty) base prefix stripped, for active matching.
  $: rel = $page.url.pathname.slice(base.length) || '/';

  const link =
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground';
  const active = 'bg-accent text-accent-foreground';
  const idle = 'text-muted-foreground';
</script>

<div class="flex h-full flex-col">
  <!-- Brand -->
  <a
    href="{base}/"
    on:click={onNavigate}
    class={cn('flex items-center gap-2 px-3 py-4 font-semibold', collapsed && 'justify-center px-0')}
  >
    <Zap class="h-5 w-5 shrink-0 text-primary" />
    {#if !collapsed}<span>SLD-KIT</span>{/if}
  </a>

  <!-- Primary nav -->
  <nav class="flex flex-col gap-1 px-2">
    {#each NAV_ITEMS as item (item.href)}
      <a
        href="{base}{item.href}"
        on:click={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={item.match(rel) ? 'page' : undefined}
        class={cn(link, item.match(rel) ? active : idle, collapsed && 'justify-center px-0')}
      >
        <svelte:component this={item.icon} class="h-5 w-5 shrink-0" />
        {#if !collapsed}<span>{item.label}</span>{/if}
      </a>
    {/each}
  </nav>

  <!-- Footer: GitHub + theme toggle -->
  <div class="mt-auto flex flex-col gap-1 px-2 pb-3">
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={collapsed ? 'GitHub' : undefined}
      class={cn(link, idle, collapsed && 'justify-center px-0')}
    >
      <Github class="h-5 w-5 shrink-0" />
      {#if !collapsed}<span>GitHub</span>{/if}
    </a>
    <button
      type="button"
      on:click={toggleMode}
      title={collapsed ? 'Toggle theme' : undefined}
      class={cn(link, idle, 'w-full', collapsed && 'justify-center px-0')}
    >
      <Sun class="h-5 w-5 shrink-0 dark:hidden" />
      <Moon class="hidden h-5 w-5 shrink-0 dark:block" />
      {#if !collapsed}<span>Toggle theme</span>{/if}
    </button>
  </div>
</div>
