<script lang="ts">
  // Opens a prefilled CodePen with a runnable @sld-kit/core browser demo.
  // CodePen's Prefill API needs a real form POST (a plain link can't carry the
  // payload), so we render a hidden form and submit it in a new tab.
  import Codepen from 'lucide-svelte/icons/codepen';
  import { CODEPEN_PREFILL } from './codepen';

  let form: HTMLFormElement;

  function open() {
    form.submit();
  }
</script>

<button
  type="button"
  on:click={open}
  class="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
>
  <Codepen class="h-4 w-4" /> Open in CodePen
</button>

<form
  bind:this={form}
  action="https://codepen.io/pen/define"
  method="POST"
  target="_blank"
  rel="noopener noreferrer"
  class="hidden"
>
  <input type="hidden" name="data" value={CODEPEN_PREFILL} />
</form>
