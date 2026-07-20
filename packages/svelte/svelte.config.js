import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * svelte-package reads `preprocess` from here so `lang="ts"` blocks compile.
 * No SvelteKit adapter/kit config: this is a component library, not an app.
 */
export default {
  preprocess: vitePreprocess()
};
