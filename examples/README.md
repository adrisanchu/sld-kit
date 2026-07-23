# Examples

Runnable demo apps that consume the published `@sld-kit/*` packages. They live in the
monorepo (linked via `workspace:*`) and are **`private: true` — never published to npm**.
Besides onboarding, each example doubles as an integration test: because it builds against
the local packages, a breaking change to a package's public API breaks the example's
typecheck/build in CI.

| Example            | Stack                           | Packages used                      |
| ------------------ | ------------------------------- | ---------------------------------- |
| [`svelte`](svelte) | SvelteKit 2 + Svelte 4 + shadcn | `@sld-kit/core`, `@sld-kit/svelte` |

Planned as the corresponding packages land: `svelte5` (Svelte 5 / runes) and `react`.

All example data is **fictional** (an invented "Example" substation) — no real network
data belongs in this repo.

## Running any example

```bash
pnpm install
pnpm run build            # build the packages first (examples consume their dist)
pnpm --filter @sld-kit-examples/<name> dev
```
