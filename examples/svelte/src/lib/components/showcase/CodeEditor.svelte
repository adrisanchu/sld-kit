<script lang="ts">
  // Editable code pane for the showcase, backed by CodeMirror 6.
  // Two-way binds `value`; the parent debounces + re-runs on change.
  // The editor theme follows the app's light/dark mode (mode-watcher's `mode`
  // store), using the GitHub palette to match the read-only JSON panel.
  import CodeMirror from 'svelte-codemirror-editor';
  import { javascript } from '@codemirror/lang-javascript';
  import { githubLight, githubDark } from '@uiw/codemirror-theme-github';
  import { mode } from 'mode-watcher';

  export let value = '';

  const lang = javascript({ typescript: true });

  $: theme = $mode === 'dark' ? githubDark : githubLight;
</script>

<div class="showcase-editor h-full overflow-auto rounded-md border border-border">
  <!-- Re-key on mode so the theme reliably swaps when the app toggles light/dark. -->
  {#key $mode}
    <CodeMirror
      bind:value
      {lang}
      {theme}
      styles={{ '&': { height: '100%', fontSize: '0.8rem' } }}
      tabSize={2}
      on:change
    />
  {/key}
</div>

<style>
  .showcase-editor :global(.cm-editor) {
    height: 100%;
  }
  .showcase-editor :global(.cm-scroller) {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  }
</style>
