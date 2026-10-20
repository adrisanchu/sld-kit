# sld-kit

A toolkit for **single-line (electrical) diagrams**: a headless engine plus
**React** and **Svelte** adapters. This is a pnpm monorepo; one repository
publishes several npm packages under the `@sld-kit` scope.

## Packages

| Package                                    | npm                        | Status                                                                                  |
| ------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------- |
| [`packages/core`](packages/core)           | `@sld-kit/core`            | ✅ document model, layout, commands, serialization, SVG export, composite + box view    |
| [`packages/svelte`](packages/svelte)       | `@sld-kit/svelte`          | ✅ Svelte 4: canvas, editor chrome, composite, flow overlays (box view pending, #54)    |
| [`packages/react`](packages/react)         | `@sld-kit/react`           | ✅ React 18/19: full parity with Svelte, plus the grid-level box view                   |
| [`examples/node`](examples/node)           | _(private, not published)_ | ✅ plain Node script: build a diagram, export an SVG                                    |
| [`examples/svelte`](examples/svelte)       | _(private, not published)_ | ✅ SvelteKit + shadcn-svelte: landing, API showcase, editor, power flow (the live demo) |
| [`examples/react`](examples/react)         | _(private, not published)_ | ✅ Vite + React + Tailwind v4 demo editor                                               |
| [`examples/react-box`](examples/react-box) | _(private, not published)_ | ✅ Vite + React grid-level box view (box ↔ detail, floating connectors)                 |

The core is framework-agnostic and has zero runtime dependencies. Adapters wrap
it with framework-native views and declare `@sld-kit/core` as a peer dependency,
so consumers install both:

```bash
npm install @sld-kit/core @sld-kit/react lucide-react     # React 18/19
npm install @sld-kit/core @sld-kit/svelte lucide-svelte   # Svelte 4
```

[`packages/README.md`](packages/README.md) holds the **component parity table**
(what each adapter implements) and the porting conventions.

## Try it

**[▶ Live demo](https://adrisanchu.github.io/sld-kit/)** — the Svelte example app running in your browser
(landing, API showcase, editor, power flow). The React examples run locally
(`pnpm run dev:example:react`, `pnpm run dev:example:react-box`).

A full example editor (SvelteKit + shadcn-svelte, localStorage-backed) lives in
[`examples/svelte`](examples/svelte), and its React twin (Vite + Tailwind v4) in
[`examples/react`](examples/react). Either is the best way to see the core and an
adapter working together:

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
pnpm run dev:example:react-box   # Vite dev server (React box view, port 5176)
```

## Docs

- [`packages/README.md`](packages/README.md) — the adapter contract and the
  per-component implementation status across frameworks.
- [`packages/core/README.md`](packages/core/README.md) — quickstart, theming,
  metadata, composites.
- [`packages/react/README.md`](packages/react/README.md) /
  [`packages/svelte/README.md`](packages/svelte/README.md) — adapter quickstarts,
  theming tokens, Tailwind setup.
- [`docs/architecture.md`](docs/architecture.md) — how the engine is put
  together.
- [`docs/composite.md`](docs/composite.md) — the "diagram of diagrams" model.

## License

MIT © Adrian Sanchez R
