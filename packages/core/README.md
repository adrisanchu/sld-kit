# @sld-kit/core

Headless, framework-agnostic engine for **single-line (electrical) diagrams**.
It owns the document model, matrix layout, undo/redo commands, JSON
serialization, and PowerPoint-safe SVG export — and nothing else. There are no
colors baked into geometry, no UI strings, no framework imports. Bring your own
renderer (Svelte, React, plain DOM) and your own theme.

- **Zero runtime dependencies.** Pure TypeScript: hand-rolled validation,
  geometry, and SVG building.
- **ESM-only**, ships bundled types. Node ≥ 20.
- **Deterministic export.** The exporter and the live view share one
  `LayoutEngine`, so what you see is what you export.
- **Office-safe SVG.** Presentation attributes only — no `<style>`, no CSS
  variables, no `<marker>`, no `<foreignObject>`. Paste straight into
  PowerPoint.

```bash
npm install @sld-kit/core
```

## Quickstart

Build a document, run undoable commands, compute layout, export SVG.

```ts
import {
  SldDocument,
  BusBar,
  Position,
  CommandStack,
  AddPositionCommand,
  Serializer,
  SvgExporter
} from '@sld-kit/core';

// 1. A document is a grid of rows × cols with bounding bus bars.
const doc = new SldDocument({ name: 'My substation' }, { rows: 3, cols: 3 });
doc.addElement(new BusBar('bb-1', 'BB1', 0));
doc.addElement(new BusBar('bb-2', 'BB2', 2));

// 2. Commands are the only way to mutate — so undo/redo is always complete.
const stack = new CommandStack();
stack.execute(new AddPositionCommand(new Position('p1', 'L1', 'line', 1, 1)), doc);
// The bay auto-wires to the nearest element above and below (here, both bars).

stack.undo(doc); // removes the bay + its connections
stack.redo(doc); // puts them back

// 3. Persist as JSON (validated, versioned) …
const json = Serializer.toJSON(doc);
const reopened = Serializer.fromJSON(json); // throws SldParseError on bad input

// 4. … and export a standalone SVG string.
const svg = new SvgExporter().export(reopened);
```

## Theming

The core is headless: all export colors come from an injected `SldTheme`, and
`DEFAULT_THEME` reproduces a sensible light palette. Pass a partial theme to
override just what you need — it is deep-merged over the default.

```ts
import { SvgExporter, DEFAULT_THEME } from '@sld-kit/core';

const svg = new SvgExporter().export(doc, {
  theme: {
    positionTypes: {
      line: { fill: '#e0f2fe', stroke: '#0284c7', text: '#0c4a6e' }
      // other types keep their DEFAULT_THEME colors
    },
    structure: { busbar: '#111827' }
  }
});
```

Live-view theming (dark mode, CSS custom properties) is a renderer concern and
lives in your app, not here.

## Open position types

The five defaults — `line`, `transformer`, `central`, `renewable`, `reserve` —
are suggestions, not a closed set. `PositionType` accepts **any string**, so you
can model domain-specific bays:

```ts
new Position('p', 'coupling-1', 'coupling', 1, 0);
```

An unknown type renders with the theme's `fallbackPositionType` palette and
auto-names from the type string (`coupling` → `coupling-1`). Supply your own
theme entries and naming prefixes to style and name them exactly.

## Metadata: the opaque `data` channel

Attach arbitrary domain data to any element or to the document. The library
**carries it through every serialization roundtrip but never reads it** — it
does not affect layout, wiring, naming, or export (the React Flow `node.data`
pattern).

```ts
import { UpdateElementCommand, getElementData } from '@sld-kit/core';

interface BayData {
  commissionedAt: string; // ISO date
  ratingA: number;
  owner: string;
}

// Write (undoable, like any edit):
stack.execute(
  new UpdateElementCommand(pos.toJSON(), {
    ...pos.toJSON(),
    data: { commissionedAt: '2024-05-01', ratingA: 1200, owner: 'ACME' }
  }),
  doc
);

// Read (typed at the boundary; this is a cast, not a validation):
const info = getElementData<BayData>(doc.getElement(pos.id)!);
info?.ratingA; // number | undefined
```

**Contract:** `data` must be JSON-serializable (structured-cloneable — no
functions, no `Date`; use ISO strings). The library omits the field entirely
when unset, so documents without metadata are unchanged.

**When _not_ to use it:** anything you need to query, index, or join in a
database. `data` travels inside the diagram JSON and is not queryable. For
DB-backed metadata, keep your own table keyed by the element's stable
`ElementId` and join at render time (the "sidecar" pattern). Use `data` for
attributes that must travel _with_ the exported file.

## Composite diagrams ("diagram of diagrams")

Place several diagrams on one canvas with rigid transforms; children that share
an external connection id are auto-linked.

```ts
import {
  CompositeDocument,
  DiagramInstance,
  MapResolver,
  CompositeLayoutEngine,
  CompositeSvgExporter
} from '@sld-kit/core';

const composite = new CompositeDocument({ name: 'Overview' });
composite.addChild(new DiagramInstance('c1', 'level-400', 0, 0, 90));
composite.addChild(new DiagramInstance('c2', 'level-220', 400, 60, 90));

// Resolve child library ids to their JSON (your store; MapResolver for tests).
composite.resolveChildren(new MapResolver(libraryJsonById));

const layout = new CompositeLayoutEngine().layout(composite);
const svg = new CompositeSvgExporter().export(composite);
```

## Serialization & compatibility

`Serializer` validates and (if needed) migrates unknown input, throwing an
English `SldParseError` with a user-presentable message on malformed data. The
current schema is **version 2**; v1 documents upgrade transparently on load. The
`data` field is additive and optional, so the schema stays at v2 and every
existing document loads unchanged.

## API surface

Everything is exported from the package root: document + elements
(`SldDocument`, `BusBar`, `Position`, `Connection`), `Grid`, `LayoutEngine`,
the `CommandStack` and command classes, `Serializer` / `SldParseError`,
`SvgExporter` / `SvgBuilder`, the `SymbolRegistry` and default symbols, the
theme (`SldTheme`, `DEFAULT_THEME`, `resolveTheme`, `positionColors`),
`getElementData`, and the composite classes (`CompositeDocument`,
`DiagramInstance`, `CompositeLayoutEngine`, `CompositeSerializer`,
`CompositeSvgExporter`, `Transform2D`, `MapResolver`).

See [`docs/architecture.md`](../../docs/architecture.md) for the design.

## License

MIT © Adrian Sanchez R
