# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm monorepo publishing several `@sld-kit/*` npm packages for **single-line (electrical) diagrams (SLD)**. `@sld-kit/core` is a headless, framework-agnostic engine; framework adapters (Svelte first) wrap it with native views and declare `@sld-kit/core` as a peer dependency.

- `packages/core` (`@sld-kit/core`) — document model, layout, undo/redo commands, JSON serialization, SVG export. **Zero runtime deps, ESM-only, Node ≥ 20.**
- `packages/svelte` (`@sld-kit/svelte`) — Svelte 4 components (headless pan/zoom canvas, element views, event-dispatching editor chrome) over the core.
- `packages/react` (`@sld-kit/react`) — the React 18/19 sibling of the Svelte adapter, ported 1:1. Built with tsup (like core), ships a `"use client"` banner. **In progress:** canvas, element views + editor chrome (toolbar, flyouts, popover, lane chip) done; composite and flow pending.
- `examples/svelte` (`@sld-kit-examples/svelte`) — a SvelteKit + shadcn-svelte demo editor consuming both packages via `workspace:*`. **`private: true`, never published.** It doubles as an integration test (breaks when a package's public API changes) and as onboarding for new users. Fixtures are entirely fictional ("Example" substation) — no real data ever lands here.
- `examples/react` (`@sld-kit-examples/react`) — the React equivalent: Vite SPA + Tailwind v4/shadcn. Same rules (private, fictional fixtures, integration test).

`packages/README.md` is the **adapter index**: the per-component implementation status across frameworks and the Svelte→React porting conventions. Update its parity table whenever a component lands in a new adapter.

## Commands

Run from the repo root (pnpm workspace). Uses `pnpm@10`.

```bash
pnpm install
pnpm check            # typecheck + lint + test across all packages (do this before pushing)
pnpm run build        # build every package (pnpm -r, in dependency order core → svelte)
pnpm run lint         # eslint . at root
pnpm run format       # prettier --write

# Core package (has the test suite)
pnpm --filter @sld-kit/core test              # vitest run
pnpm --filter @sld-kit/core test:watch
pnpm --filter @sld-kit/core build             # tsup → dist
pnpm --filter @sld-kit/core verify:pack       # build + publint + attw (guards the published artifact)
pnpm --filter @sld-kit/core demo > /tmp/x.svg # smoke render of the example fixture

# Run a single core test file / test by name
pnpm --filter @sld-kit/core test layout             # file filter (tests/layout.test.ts)
pnpm --filter @sld-kit/core test -- -t "roundtrip"  # by test name

# React package
pnpm --filter @sld-kit/react build            # tsup → dist
pnpm --filter @sld-kit/react typecheck        # tsc --noEmit
pnpm --filter @sld-kit/react verify:pack      # build + publint + attw

# Example editors (SPAs over the packages; build core + the adapter first)
pnpm run dev:example                                 # SvelteKit dev server
pnpm run build:example                               # adapter-static SPA → examples/svelte/build
pnpm run dev:example:react                           # Vite dev server (port 5175)
pnpm run build:example:react                         # static SPA → examples/react/dist
```

**Build ordering gotcha:** `packages/core/dist` is gitignored, and both adapters' typechecks resolve `@sld-kit/core`'s types from that `dist`. So **core must be built before running `pnpm run typecheck` at the root** (CI runs `pnpm run build` first for this reason). If an adapter's typecheck complains it can't resolve `@sld-kit/core`, run `pnpm --filter @sld-kit/core build`.

Note `eslint` and `prettier` only have root-level scripts — run them as `pnpm -w run lint` / `pnpm -w run format` from a subdirectory.

## Architecture

Full design in `docs/architecture.md` and `docs/composite.md`; the core's public contract is in `packages/core/README.md`. Key invariants below.

### The content/layout split (Mermaid model)

The persisted document stores **no pixel coordinates**. Elements live in a matrix of rows × columns; `LayoutEngine.layout(doc)` maps that matrix to pixels via an injectable `SldLayoutConfig` (default `SLD_LAYOUT`). Restyling/rescaling is a config change, not a data migration.

```
JSON ──Serializer──▶ SldDocument ──LayoutEngine──▶ DiagramLayout ─┬─▶ your renderer
                                                                  └─▶ SvgExporter ─▶ SVG string
```

The exporter and the live view **share one `LayoutEngine`**, so what renders on screen equals what exports.

### Commands are the only mutators

`SldDocument`/`CompositeDocument` mutations are low-level and meant to be called **only by `Command` objects** run through a `CommandStack` (classic do/undo). This keeps undo/redo history complete and never desynced. When adding a mutation, add it as a command — don't mutate the document directly outside one. `AddPositionCommand` auto-wires a new bay into its column (and spawns external asset arrows) as one undoable step; `SnapshotCommand` swaps the whole document for compound ops.

Elements reference each other **only by id** (stable UUIDs via `newId()`), never by geometry; ids survive every roundtrip.

### Office-safe SVG export (hard constraint)

`SvgExporter` output must paste into PowerPoint: **presentation attributes only** — no `<style>`, no classes, no CSS variables, no `currentColor`, no `<marker>` (arrowheads are filled `<path>`s), no `<foreignObject>`; explicit pixel `width`/`height` on the root. Preserve these constraints when touching export code. All colors resolve against an injected `SldTheme`; `DEFAULT_THEME` reproduces the historical palette byte-for-byte, so exports with no theme option must stay unchanged.

### Serialization & versioning

`Serializer` (single) / `CompositeSerializer` (composite) are static-only classes doing hand-rolled structural validation with **zero deps** and a migration registry keyed by _from_ version. Single-diagram schema is **version 2** (v1 upgrades transparently); composite is **version 1**. Bad input throws `SldParseError` with English, user-presentable messages — localization is the consumer's job at its import boundary.

### Open types & the opaque `data` channel

- `PositionType` is `(five defaults) | (string & {})` — any string is accepted; unknown types use `fallbackPositionType` and auto-name from the type string. (This is why eslint's `no-empty-object-type` is disabled.)
- `SldElement`/`DocumentMeta` carry optional `data?: unknown`: the library roundtrips it (deep-copied via `structuredClone`) but **never reads it** — it must be structured-cloneable (no functions, no `Date`; use ISO strings). Narrow it with `getElementData<T>()`.

### Composite ("diagram of diagrams")

A **sibling** document type to `SldDocument` (own model, layout engine, serializer, exporter) — it does _not_ extend the single-diagram path, so changes there carry zero risk to it. `CompositeDocument` holds `DiagramInstance` children, each a `libraryId` + `Transform2D` (rotate about pivot, then translate). A `DocumentResolver` (`MapResolver` for tests) looks up child JSON by `libraryId`; resolvers returning a composite are treated as unresolvable (no composite-in-composite). Children whose _external_ endpoints share the same connection id are auto-linked with a dashed edge.

### Adapter packages: headless & event-dispatching

Components never open dialogs or persist state — they **dispatch semantic events** (Svelte) / **call semantic callbacks** (React) and accept injectable label maps (English defaults, e.g. `DEFAULT_TOOLBAR_LABELS`) and a `positionTokens` class map. The consuming app owns theming, localization, dialogs, and orchestration. Adapters have **zero runtime deps**; icons are a peer (`lucide-svelte` / `lucide-react`). They emit Tailwind/shadcn class names but ship no Tailwind config, so the consumer must scan the built package or the utilities get purged.

`createDocStore` bridges a core document's `subscribe()` into a Svelte `readable` store (re-notifies on same-reference `set` so `$:` blocks re-derive after every mutation).

### React adapter: four things that don't port directly

Documented in full in `packages/README.md`. In short:

1. **`createDocStore` has no React equivalent.** Documents mutate **in place**, so `Object.is` never sees a change. `useSldDocument(doc)` returns a **monotonic version counter**; every `useMemo`/`useCallback` that reads the document must list it (with an `eslint-disable react-hooks/exhaustive-deps`, since the rule can't see why it's needed). `SldCanvas` takes it as a `version` prop.
2. **`CommandStack.subscribe` fires its callback immediately** on subscribe (document `subscribe` does not). `useCommandStack` caches its snapshot object so `useSyncExternalStore` doesn't loop.
3. **Wheel is attached manually** with `{ passive: false }` — React's synthetic `onWheel` can't reliably `preventDefault`, so Ctrl/Cmd+wheel would zoom the page.
4. **`--sld-pos` is a complete CSS color**, not the HSL triplet the Svelte adapter expects (Tailwind v4 vs v3 tokens). Alpha rides on SVG `fill-opacity`/`stroke-opacity`.

Also: `tsup` must **not** use `treeshake` here — it routes the bundle through Rollup, which strips the `"use client"` banner.

## Release

`.github/workflows/release.yml` publishes on push to `main`: bump a package's `package.json` `version`, commit, push → that package publishes (each step checks the npm registry first, so it's idempotent; version-less pushes validate but publish nothing). `.github/workflows/ci.yml` runs build → typecheck → lint → test → `verify:pack` on PRs.

`verify:pack` (publint + attw) exists only on `core` and `react`. **`@sld-kit/svelte` has none by design** — `svelte-package` ships `.svelte` files in `dist/`, so its `index.d.ts` imports `'./SldCanvas.svelte'`, which attw can't resolve (false-positive `Internal resolution error`). svelte is still covered by the `pnpm -r` build/typecheck/lint/test steps. Don't "fix" this by adding the script; see the note in `ci.yml` and `packages/README.md`.
