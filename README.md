# sld-kit

A toolkit for **single-line (electrical) diagrams** — a headless engine plus
(planned) framework adapters. This is a pnpm monorepo; one repository publishes
several npm packages under the `@sld-kit` scope.

## Packages

| Package                              | npm                        | Status                                                         |
| ------------------------------------ | -------------------------- | -------------------------------------------------------------- |
| [`packages/core`](packages/core)     | `@sld-kit/core`            | ✅ document model, layout, commands, serialization, SVG export |
| [`packages/svelte`](packages/svelte) | `@sld-kit/svelte`          | ✅ headless Svelte 4 views + event-dispatching editor chrome   |
| [`examples/svelte`](examples/svelte) | _(private, not published)_ | ✅ SvelteKit + shadcn-svelte demo editor using both packages   |

The core is framework-agnostic and has zero runtime dependencies. Adapters
(Svelte first, then React/Vue) will wrap it with framework-native views and
declare `@sld-kit/core` as a peer dependency, so consumers install both:

```bash
npm install @sld-kit/core @sld-kit/svelte
```

## Try it

**[▶ Live demo](https://adrisanchu.github.io/sld-kit/)** — the example editor running in your browser.

A full example editor (SvelteKit + shadcn-svelte, localStorage-backed, seeded with a
fictional demo substation) lives in [`examples/svelte`](examples/svelte). It is the best
way to see both packages working together:

```bash
pnpm install
pnpm run build          # build core → svelte first (the example consumes their dist)
pnpm run dev:example    # open the printed localhost URL
```

## Development

Requires [pnpm](https://pnpm.io) and Node ≥ 20.

```bash
pnpm install
pnpm check            # typecheck + lint + test, across all packages
pnpm -r build         # build every package

# core only
pnpm --filter @sld-kit/core test
pnpm --filter @sld-kit/core build
pnpm --filter @sld-kit/core verify:pack   # build + publint + attw
pnpm --filter @sld-kit/core demo > /tmp/example.svg   # smoke render

# example editor
pnpm run dev:example      # SvelteKit dev server
pnpm run build:example    # adapter-static SPA → examples/svelte/build
```

## Docs

- [`packages/core/README.md`](packages/core/README.md) — quickstart, theming,
  metadata, composites.
- [`docs/architecture.md`](docs/architecture.md) — how the engine is put
  together.
- [`docs/composite.md`](docs/composite.md) — the "diagram of diagrams" model.

## License

MIT © Adrian Sanchez R
