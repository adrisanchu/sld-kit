<script lang="ts">
  // Read-only, syntax-highlighted code block with a copy button.
  // Adapted from dpe-app's CodeBlock; highlighting is reactive so it can display
  // the live-generated JSON as the showcase re-runs.
  import { toast } from 'svelte-sonner';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import hljs from 'highlight.js/lib/core';
  import json from 'highlight.js/lib/languages/json';
  import javascript from 'highlight.js/lib/languages/javascript';
  import typescript from 'highlight.js/lib/languages/typescript';

  hljs.registerLanguage('json', json);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('typescript', typescript);

  export let lang = '';
  export let text = '';

  let copied = false;

  $: highlighted = highlight(text, lang);

  function highlight(value: string, language: string): string {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(value, { language }).value;
      }
      return hljs.highlightAuto(value).value;
    } catch {
      return value;
    }
  }

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

<div class="group relative h-full">
  <button
    on:click={copyToClipboard}
    class="absolute right-2 top-2 z-10 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 {copied
      ? 'text-green-500'
      : 'text-muted-foreground hover:text-foreground'}"
    title="Copy"
    aria-label="Copy code"
  >
    {#if copied}
      <Check class="h-3.5 w-3.5" />
    {:else}
      <Copy class="h-3.5 w-3.5" />
    {/if}
  </button>
  <pre
    class="h-full overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed"><code
      class="hljs">{#if highlighted}{@html highlighted}{:else}{text}{/if}</code></pre>
</div>

<style>
  pre :global(.hljs) {
    color: #24292e;
  }
  pre :global(.hljs-keyword),
  pre :global(.hljs-selector-tag),
  pre :global(.hljs-deletion) {
    color: #d73a49;
  }
  pre :global(.hljs-string),
  pre :global(.hljs-addition) {
    color: #032f62;
  }
  pre :global(.hljs-attr),
  pre :global(.hljs-number),
  pre :global(.hljs-literal),
  pre :global(.hljs-variable),
  pre :global(.hljs-template-variable),
  pre :global(.hljs-built_in),
  pre :global(.hljs-type) {
    color: #005cc5;
  }
  pre :global(.hljs-comment),
  pre :global(.hljs-quote) {
    color: #6a737d;
    font-style: italic;
  }
  pre :global(.hljs-title),
  pre :global(.hljs-section),
  pre :global(.hljs-name) {
    color: #6f42c1;
  }

  :global(.dark) pre {
    border-color: hsl(var(--muted-foreground) / 0.25);
  }
  :global(.dark) pre :global(.hljs) {
    color: hsl(210 40% 80%);
  }
  :global(.dark) pre :global(.hljs-keyword),
  :global(.dark) pre :global(.hljs-selector-tag),
  :global(.dark) pre :global(.hljs-deletion) {
    color: hsl(210 80% 72%);
  }
  :global(.dark) pre :global(.hljs-string),
  :global(.dark) pre :global(.hljs-addition),
  :global(.dark) pre :global(.hljs-attr) {
    color: hsl(140 60% 60%);
  }
  :global(.dark) pre :global(.hljs-comment),
  :global(.dark) pre :global(.hljs-quote) {
    color: hsl(215 20% 50%);
    font-style: italic;
  }
  :global(.dark) pre :global(.hljs-number),
  :global(.dark) pre :global(.hljs-literal),
  :global(.dark) pre :global(.hljs-variable),
  :global(.dark) pre :global(.hljs-template-variable),
  :global(.dark) pre :global(.hljs-built_in),
  :global(.dark) pre :global(.hljs-type) {
    color: hsl(30 80% 65%);
  }
  :global(.dark) pre :global(.hljs-title),
  :global(.dark) pre :global(.hljs-section),
  :global(.dark) pre :global(.hljs-name) {
    color: hsl(280 70% 72%);
  }
</style>
