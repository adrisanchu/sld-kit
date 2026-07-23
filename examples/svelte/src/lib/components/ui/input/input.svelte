<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import type { InputEvents } from './index.js';
  import { cn } from '$lib/utils.js';

  type $$Props = HTMLInputAttributes;
  type $$Events = InputEvents;

  let inputElement: HTMLInputElement;
  let className: $$Props['class'] = undefined;
  export let value: $$Props['value'] = undefined;
  export { className as class };

  export function focus() {
    inputElement.focus();
  }

  // Workaround for https://github.com/sveltejs/svelte/issues/9305
  // Fixed in Svelte 5, but not backported to 4.x.
  export let readonly: $$Props['readonly'] = undefined;
</script>

<input
  class={cn(
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
    'aria-[invalid]:border-destructive aria-[invalid]:bg-destructive/20 aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40',
    className
  )}
  bind:this={inputElement}
  bind:value
  {readonly}
  on:blur
  on:change
  on:click
  on:focus
  on:focusin
  on:focusout
  on:keydown
  on:keypress
  on:keyup
  on:mouseover
  on:mouseenter
  on:mouseleave
  on:paste
  on:input
  on:wheel
  {...$$restProps}
/>
