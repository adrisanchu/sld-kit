# Node quickstart

The smallest possible way to use [`@sld-kit/core`](../../packages/core) — a plain
Node script that builds a single-line diagram and exports it to an office-safe SVG.
No browser, no framework, no build step.

## Try it in your own project

```bash
npm install @sld-kit/core
```

```ts
// index.ts (or index.mjs)
import { writeFileSync } from 'node:fs';
import { buildDocument, SvgExporter } from '@sld-kit/core';

const doc = buildDocument({
  meta: { name: 'My substation' },
  busbars: [
    { label: 'BB1', row: 0 },
    { label: 'BB2', row: 2 }
  ],
  bays: [
    {
      col: 0,
      positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: 'FEEDER A' } }]
    }
  ]
});

const svg = new SvgExporter().export(doc);
writeFileSync('substation.svg', svg);
```

Run it with any TypeScript runner (`npx tsx index.ts`) — or drop the types and run
plain ESM with `node index.mjs`. It writes `substation.svg`, ready to open in a
browser or paste straight into PowerPoint.

For a richer, non-declarative build (explicit elements, undo/redo, JSON
roundtrip, theming, composites) see the [`@sld-kit/core` README](../../packages/core/README.md).

## Running this example from the monorepo

```bash
pnpm install
pnpm --filter @sld-kit/core build   # examples consume the built dist
pnpm --filter @sld-kit-examples/node start
```
