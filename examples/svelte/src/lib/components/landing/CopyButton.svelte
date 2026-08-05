<script lang="ts">
  // Small copy-to-clipboard button. Same pattern as showcase/CodeBlock.svelte:
  // clipboard write + sonner toast + a transient check state.
  import { toast } from 'svelte-sonner';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import { cn } from '$lib/utils.js';

  export let text = '';
  export let label = 'Copy';
  let className: string | undefined = undefined;
  export { className as class };

  let copied = false;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1500);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }
</script>

<button
  type="button"
  on:click={copyToClipboard}
  class={cn(
    'rounded p-1.5 transition-colors',
    copied ? 'text-green-500' : 'text-muted-foreground hover:text-foreground',
    className
  )}
  title={label}
  aria-label={label}
>
  {#if copied}
    <Check class="h-4 w-4" />
  {:else}
    <Copy class="h-4 w-4" />
  {/if}
</button>
