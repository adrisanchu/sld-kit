# sld-kit

A toolkit for **single-line (electrical) diagrams** — a headless engine plus
(planned) framework adapters. This is a pnpm monorepo; one repository publishes
several npm packages under the `@sld-kit` scope.

## Packages

| Package                              | npm                        | Status                                                         |
| ------------------------------------ | -------------------------- | -------------------------------------------------------------- |
| [`packages/core`](packages/core)     | `@sld-kit/core`            | ✅ document model, layout, commands, serialization, SVG export |
| [`packages/svelte`](packages/svelte) | `@sld-kit/svelte`          | ✅ headless Svelte 4 views + event-dispatching editor chrome   |
| [`packages/react`](packages/react)   | `@sld-kit/react`           | 🚧 React 18/19 port — canvas + element views done, chrome next |
| [`examples/svelte`](examples/svelte) | _(private, not published)_ | ✅ SvelteKit + shadcn-svelte demo editor using both packages   |
| [`examples/react`](examples/react)   | _(private, not published)_ | ✅ Vite + React + Tailwind v4 demo editor                      |

The core is framework-agnostic and has zero runtime dependencies. Adapters wrap
it with framework-native views and declare `@sld-kit/core` as a peer dependency,
so consumers install both:

```bash
npm install @sld-kit/core @sld-kit/svelte   # or @sld-kit/react
```

[`packages/README.md`](packages/README.md) holds the **component parity table**
(what each adapter implements) and the porting conventions.

## Try it

**[▶ Live demo](https://adrisanchu.github.io/sld-kit/)** — the example editor running in your browser.

A full example editor (SvelteKit + shadcn-svelte, localStorage-backed) lives in
[`examples/svelte`](examples/svelte). It is the best way to see both packages
working together:

```bash
pnpm install
pnpm run build          # build core → svelte first (the example consumes their dist)
pnpm run dev:example    # open the printed localhost URL
```

It seeds a fictional grid with two substations and two composites:

- **South 400 kV** / **South 220 kV** — the two levels of the "South" substation,
  hand-authored element by element (the explicit, full-control path).
- **West 400 kV** — a breaker-and-a-half substation built with the high-level
  command API (`AddPositionCommand` auto-wires each bay), including `storage`
  (battery) and `demand` (consumer) bays.
- **South — overview** — the two South levels tied by the default **automatic**
  dashed link (they share a connection id).
- **South ⇄ West 400 kV** — South 400 tied to West 400 by **two hand-routed
  manual lines**, showing the manual line-routing alternative to auto-links.

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
pnpm --silent --filter @sld-kit/core demo > /tmp/example.svg   # smoke render (--silent keeps pnpm's banner out of the file)

# example editors
pnpm run dev:example         # SvelteKit dev server
pnpm run build:example       # adapter-static SPA → examples/svelte/build
pnpm run dev:example:react   # Vite dev server (React)
pnpm run build:example:react # static SPA → examples/react/dist
```

## Docs

- [`packages/README.md`](packages/README.md) — the adapter contract and the
  per-component implementation status across frameworks.
- [`packages/core/README.md`](packages/core/README.md) — quickstart, theming,
  metadata, composites.
- [`docs/architecture.md`](docs/architecture.md) — how the engine is put
  together.
- [`docs/composite.md`](docs/composite.md) — the "diagram of diagrams" model.

## License

MIT © Adrian Sanchez R
