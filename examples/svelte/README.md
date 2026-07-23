# @sld-kit-examples/svelte

A small **single-line diagram editor** built with **SvelteKit + shadcn-svelte** on top of
[`@sld-kit/core`](../../packages/core) and [`@sld-kit/svelte`](../../packages/svelte). It
mirrors a real consumer app: a library list of diagrams and a full editor, all backed by
`localStorage` (no server, no database). Private and never published — it exists to
demonstrate the packages and to catch API regressions.

## Run it

From the **monorepo root**:

```bash
pnpm install
pnpm run build          # builds core → svelte; the app consumes their dist
pnpm run dev:example    # or: pnpm --filter @sld-kit-examples/svelte dev
```

Then open the printed localhost URL. On first load the library is seeded with a fictional
demo substation ("Example" 400 kV, 220 kV, and a composite of the two).

Build a static SPA (deployable to any static host / GitHub Pages):

```bash
pnpm run build:example                    # → examples/svelte/build
BASE_PATH=/sld-kit pnpm run build:example # when hosting under a sub-path
```

## How it maps to the packages

The packages are intentionally headless; an app supplies the "glue". This split is the
main thing the example demonstrates:

| Concern                                                    | Lives in                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Document model, grid layout, undo/redo commands, JSON, SVG | `@sld-kit/core`                                                  |
| Pan/zoom canvas, element views, event-dispatching toolbar  | `@sld-kit/svelte`                                                |
| Editor orchestration (tool state → commands)               | `src/lib/components/sld/SldEditor.svelte`                        |
| Composite ("diagram of diagrams") orchestration            | `.../composite/CompositeEditor.svelte`                           |
| Property / import dialogs (shadcn + bits-ui)               | `.../ElementEditDialog.svelte`, `.../ImportDiagramDialog.svelte` |
| Labels, position-type colour tokens                        | `src/lib/components/sld/theme.ts`                                |
| Diagram storage (localStorage index + docs)                | `src/lib/stores/sldLibrary.ts`                                   |
| Demo fixtures (fictional data)                             | `src/lib/sld/demoFixture.ts`                                     |

The library components ship **English default labels**; this app injects its own copy via
each component's `labels` prop (see `theme.ts`) — swap those strings to localise.

## Styling notes

- `tailwind.config.js` scans `./node_modules/@sld-kit/svelte/dist/**` so Tailwind doesn't
  purge utility classes used only inside the package (e.g. `fill-foreground`,
  `stroke-primary/70`). Without this the diagram loses its colours.
- `src/app.css` defines the `--sld-pos-*` colour tokens (light + dark) and the
  `.sld-pos-*` classes the element views map onto `var(--sld-pos)`.
