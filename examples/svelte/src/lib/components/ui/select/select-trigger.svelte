<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { cn } from '$lib/utils.js';

  // Added to hide the chevron on select (optional)
  export let showArrow: boolean = true;

  type $$Props = SelectPrimitive.TriggerProps & { showArrow?: boolean };
  type $$Events = SelectPrimitive.TriggerEvents;

  let className: $$Props['class'] = undefined;
  export { className as class };
</script>

<SelectPrimitive.Trigger
  class={cn(
    'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid]:border-destructive [&>span]:line-clamp-1 data-[placeholder]:[&>span]:text-muted-foreground',
    className
  )}
  {...$$restProps}
  let:builder
  on:click
  on:keydown
>
  <slot {builder} />
  {#if showArrow}
    <div>
      <ChevronDown class="h-4 w-4 opacity-50" />
    </div>
  {/if}
</SelectPrimitive.Trigger>
