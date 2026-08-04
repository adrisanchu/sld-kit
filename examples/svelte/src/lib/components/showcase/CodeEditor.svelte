<script lang="ts">
  // Editable code pane for the showcase, backed by CodeMirror 6.
  // Two-way binds `value`; the parent debounces + re-runs on change.
  import CodeMirror from 'svelte-codemirror-editor';
  import { javascript } from '@codemirror/lang-javascript';
  import { oneDark } from '@codemirror/theme-one-dark';

  export let value = '';

  const lang = javascript({ typescript: true });
</script>

<div class="showcase-editor h-full overflow-auto rounded-md border border-border">
  <CodeMirror
    bind:value
    {lang}
    theme={oneDark}
    styles={{ '&': { height: '100%', fontSize: '0.8rem' } }}
    tabSize={2}
    on:change
  />
</div>

<style>
  .showcase-editor :global(.cm-editor) {
    height: 100%;
  }
  .showcase-editor :global(.cm-scroller) {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  }
</style>
