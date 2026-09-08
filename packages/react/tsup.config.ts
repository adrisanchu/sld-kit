import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // NOT `treeshake: true`: that routes esbuild's output through Rollup, which
  // strips the top-level "use client" directive below (it warns
  // "Module level directives cause errors when bundled"). The package is
  // `sideEffects: false` ESM, so the consumer's bundler shakes it anyway.
  target: 'es2022',
  outDir: 'dist',
  // Every component is interactive (hooks, pointer handlers), so the whole
  // bundle is client-only. The banner keeps it usable from a Next.js App
  // Router server component tree without the consumer wrapping each import.
  banner: { js: '"use client";' },
  // Peers must never be inlined — React especially, or the consumer ends up
  // with two copies and hooks break.
  external: ['react', 'react-dom', 'react/jsx-runtime', '@sld-kit/core', 'lucide-react']
});
