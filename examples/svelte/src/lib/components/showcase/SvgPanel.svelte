<script lang="ts">
  // Renders an exported SVG string with copy / download actions.
  // The SVG is office-safe (presentation attributes only), so {@html} is fine.
  import { toast } from 'svelte-sonner';
  import Copy from 'lucide-svelte/icons/copy';
  import Download from 'lucide-svelte/icons/download';
  import { Button } from '$lib/components/ui/button';

  export let svg = '';
  export let filename = 'diagram.svg';

  async function copySvg() {
    try {
      await navigator.clipboard.writeText(svg);
      toast.success('SVG copied to clipboard');
    } catch {
      toast.error('Could not copy SVG');
    }
  }

  function downloadSvg() {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="flex h-full flex-col rounded-md border border-border">
  <div class="flex items-center justify-end gap-1 border-b border-border p-1.5">
    <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" on:click={copySvg}>
      <Copy class="h-3.5 w-3.5" /> Copy SVG
    </Button>
    <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" on:click={downloadSvg}>
      <Download class="h-3.5 w-3.5" /> Download
    </Button>
  </div>
  <div class="svg-frame flex flex-1 items-center justify-center overflow-auto p-4">
    {#if svg}
      <div class="max-h-full max-w-full [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:max-w-full">
        {@html svg}
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">No diagram yet.</p>
    {/if}
  </div>
</div>

<style>
  /* Neutral checkered backdrop so white SVGs read clearly in either mode. */
  .svg-frame {
    background-color: hsl(var(--muted) / 0.3);
    background-image:
      linear-gradient(45deg, hsl(var(--muted) / 0.5) 25%, transparent 25%),
      linear-gradient(-45deg, hsl(var(--muted) / 0.5) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, hsl(var(--muted) / 0.5) 75%),
      linear-gradient(-45deg, transparent 75%, hsl(var(--muted) / 0.5) 75%);
    background-size: 16px 16px;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0;
  }
</style>
