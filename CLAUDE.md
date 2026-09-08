# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm monorepo publishing several `@sld-kit/*` npm packages for **single-line (electrical) diagrams (SLD)**. `@sld-kit/core` is a headless, framework-agnostic engine; framework adapters (Svelte first) wrap it with native views and declare `@sld-kit/core` as a peer dependency.

- `packages/core` (`@sld-kit/core`) — document model, layout, undo/redo commands, JSON serialization, SVG export. **Zero runtime deps, ESM-only, Node ≥ 20.**
- `packages/svelte` (`@sld-kit/svelte`) — Svelte 4 components (headless pan/zoom canvas, element views, event-dispatching editor chrome) over the core.
- `examples/svelte` (`@sld-kit-examples/svelte`) — a SvelteKit + shadcn-svelte demo editor consuming both packages via `workspace:*`. **`private: true`, never published.** It doubles as an integration test (breaks when a package's public API changes) and as onboarding for new users. Fixtures are entirely fictional ("Example" substation) — no real data ever lands here.

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

# Example editor (SvelteKit SPA over both packages; build core+svelte first)
pnpm run dev:example                                 # vite dev server
pnpm run build:example                               # adapter-static SPA → examples/svelte/build
```

**Build ordering gotcha:** `packages/core/dist` is gitignored, and `@sld-kit/svelte`'s typecheck resolves `@sld-kit/core`'s types from that `dist`. So **core must be built before running `pnpm run typecheck` at the root** (CI runs `pnpm run build` first for this reason). If svelte typecheck complains it can't resolve `@sld-kit/core`, run `pnpm --filter @sld-kit/core build`.

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

### Svelte package: headless & event-dispatching

Components never open dialogs or persist state — they **dispatch semantic events** and accept injectable label maps (English defaults, e.g. `DEFAULT_TOOLBAR_LABELS`) and a `positionTokens` class map. The consuming app owns theming, localization, dialogs, and orchestration. `createDocStore` bridges a core document's `subscribe()` into a Svelte `readable` store (re-notifies on same-reference `set` so `$:` blocks re-derive after every mutation).

## Release

`.github/workflows/release.yml` publishes on push to `main`: bump a package's `package.json` `version`, commit, push → that package publishes (each step checks the npm registry first, so it's idempotent; version-less pushes validate but publish nothing). `.github/workflows/ci.yml` runs build → typecheck → lint → test → `verify:pack` on PRs.
