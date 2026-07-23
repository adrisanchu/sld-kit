import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// SPA build: the editor is entirely client-side (localStorage), so we use a
// fallback page and disable SSR/prerender in src/routes/+layout.ts. `BASE_PATH`
// lets a future GitHub Pages / sub-path deploy work without code changes.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: [vitePreprocess({})],

  kit: {
    adapter: adapter({
      fallback: 'index.html',
      strict: false
    }),
    paths: {
      base
    }
  }
};

export default config;
