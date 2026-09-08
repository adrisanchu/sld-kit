import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `BASE_PATH` mirrors examples/svelte, so the SPA can be served from a
// subdirectory (GitHub Pages) without code changes.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5175 }
});
