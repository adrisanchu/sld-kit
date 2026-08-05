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

Prefer to run something first? The [`examples/node`](../../examples/node) folder is a
copy-paste quickstart (build a diagram → export an SVG) you can run in seconds.

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

## Authoring connections

A `Connection` joins two `Endpoint`s. Build them with the `element` / `external`
helpers instead of hand-writing the discriminated union — they omit optional
fields (`tap`, `side`, `direction`) so the layout can derive them:

```ts
import { Connection, element, external, newId } from '@sld-kit/core';

// position ↔ bus bar
new Connection(newId(), '', element('pos-1'), element('bb-1'));

// position ↔ external feeder (direction/side optional — derived when omitted)
new Connection(newId(), '', element('pos-1'), external({ asset: 'line', label: 'FEEDER A', direction: 'up' }));
```

## Readable element factories

The positional constructors are terse but easy to misorder, and force you to
mint an id even when you don't care. Every element also has an options-object
factory, `.of(...)`, that reads clearly and defaults `id` (to `newId()`) and
`label` (to `''`):

```ts
import { BusBar, Position, Connection, element, external } from '@sld-kit/core';

BusBar.of({ label: 'BB1', row: 0 });
Position.of({ type: 'line', label: 'L1', row: 1, col: 0 }); // id minted for you
Connection.of({ from: element('pos-1'), to: external({ asset: 'line', label: 'FEEDER A' }) });
```

The factories are pure sugar — same objects, same behavior as the positional
constructors (which stay for back-compat and hot paths). Pass `id` when you need
a specific one (e.g. a shared id across documents for the composite editor).

## Batch authoring (place first, wire in one call)

Wiring a whole diagram by hand — or one `AddPositionCommand` at a time — is
verbose. When you already know the layout (e.g. reading a diagram top-to-bottom,
or generating one), place the bars and bays first and let the rest follow:

```ts
import { SldDocument, BusBar, Position, autoWire } from '@sld-kit/core';

// Grid omitted → starts 0×0 and grows to fit.
const doc = new SldDocument({ name: 'My substation' });
doc.addElement(new BusBar('bb-1', 'BB1', 0));
doc.addElement(new BusBar('bb-2', 'BB2', 2));
doc.addElement(new Position('p1', 'L1', 'line', 1, 0));
doc.addElement(new Position('p2', 'L2', 'transformer', 1, 1));

autoWire(doc); // series-wires every bay to its column, spawns each feeder…
// autoWire calls doc.fitGrid() first, so the document is valid by construction.
```

`autoWire(doc, { externals })` is the batch form of `AddPositionCommand`: it adds
every series connection (bar↔bay, bay↔bay) each column needs and, unless
`externals: false`, the outgoing feeder for each external-typed bay
(`line`/`transformer`/`renewable`/`storage`/`demand`). It never double-wires a
link, so it can top up a partially-wired document. It mutates directly (a
construction step, not an undoable edit); reach for `AddPositionCommand` when you
need one interactive, undoable insertion instead.

`doc.fitGrid({ pad })` sizes `rows`/`cols` to exactly contain the current
elements (plus optional `pad` empty lanes), so you never have to count
dimensions up front. It only grows or tightens to fit — it never moves an
element.

For the fully declarative form, `buildDocument(spec)` composes all of the above:
describe the bars, the columns of bays, and each bay's outgoing feeder, and get
back an auto-named, auto-sized, wired **and validated** document (it throws
`SldParseError` if the spec is inconsistent):

```ts
import { buildDocument } from '@sld-kit/core';

const doc = buildDocument({
  meta: { name: 'My substation' },
  busbars: [
    { label: 'BB1', row: 0 },
    { label: 'BB2', row: 4 }
  ],
  bays: [
    {
      col: 0,
      positions: [
        { type: 'line', row: 1, feeder: { asset: 'line', label: 'FEEDER A' } }, // toward BB1
        { type: 'central', row: 2 }, // auto-named central-1
        { type: 'line', row: 3, feeder: { asset: 'line', label: 'FEEDER B' } } // toward BB2
      ]
    }
  ]
});
```

Positions are auto-named per type (`line-1`, `line-2`, `ren-1`, …) unless you
pass a `label`; supply `prefixes` to rename the counters. Feeders are
**explicit** — each hangs off the specific position it leaves from
(`position.feeder`), not implied by position type — so the spec states exactly
what leaves the diagram, and a column can carry several feeders (e.g. one off the
top position toward the top bar and one off the bottom). Give a feeder an `id`
for a stable, shareable connection id — e.g. a tie-line a composite auto-links by
matching the same id across two diagrams. Anything the spec can't express stays
reachable through the explicit element/command API.

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

### Formatting overlay (`resolveElementFormat`)

Beyond per-type fill colors, a theme can carry **one property-agnostic styling
seam**: `resolveElementFormat(el) => ElementFormat`. The core never reads `data`
or knows any domain concept — **the consumer** supplies a function that inspects
whatever it wants (a `data` field, a CIM class, a commissioning date) and returns
a generic `ElementFormat`, layered on top of the per-type color. `ElementFormat`
fields — `strokeWidth`, `dashArray`, `fillOpacity`, `fill` — are all office-safe
presentation attributes, so exports still paste into PowerPoint.

```ts
// Consumer policy: dash + ghost anything the app considers "future".
const byFuture = (el) => (getElementData<{ future?: boolean }>(el)?.future ? { dashArray: '6 3', fillOpacity: 0.45 } : undefined);

const svg = new SvgExporter().export(doc, { theme: { resolveElementFormat: byFuture } });
```

Absent a resolver (as in `DEFAULT_THEME`) the overlay is a no-op and output is
byte-for-byte unchanged. Feed the **same** resolver to the live Svelte views
(their `formatResolver` prop) so screen and export match. Composite tie-lines are
backed by more than one connection; `firstFormat(linkConnections(link, children),
resolve)` (and `lineConnections` for hand-drawn lines) styles a tie-line from the
first backing connection the resolver formats — so tagging **either** diagram is
enough, still with zero domain knowledge in the core. A worked commissioning
example (a `data.sld.commissioning` reader mapped to formats) lives in the Svelte
example app, not in the library.

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

### Reserved `data` namespaces (`sld`, `cim`)

To let library conventions and future adapters share the same `data` bag without
clobbering each other, top-level keys under `data` are **namespaced**: `sld` for
this library's own conventions, `cim` for the (planned) CIM adapter, and any
other key is yours.

```
data: { sld?: {…}, cim?: {…}, /* your keys */ }
```

Domain conventions like **commissioning** (new vs. existing assets — a `date`
and/or open `category` under `data.sld.commissioning`) are **consumer-owned**,
not part of this library: the Svelte example app ships a small `commissioning`
module (typed accessors + a `resolveElementFormat` policy) demonstrating the
pattern. The core stays domain-agnostic — it only roundtrips `data` and applies
whatever [`resolveElementFormat`](#formatting-overlay-resolveelementformat) you
give it. A future `@sld-kit/cim` adapter would map `data.sld.commissioning` onto
CIM's `Asset.lifecycleDate` / `lifecycleState`.

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

For a fix-then-recheck loop (an editor surfacing every issue at once, or an LLM
self-correcting generated JSON), use the non-throwing validators that return the
**full** error list instead of throwing on the first:

```ts
const { ok, errors } = Serializer.check(untrustedJson); // errors: SldParseError[]
const liveErrors = doc.validate();                      // same rules, in-memory doc
```

`SldDocument` mutations are intentionally not validated on the fly (an editor
passes through transiently-invalid states while dragging), so call `validate()`
when you want to check — e.g. before an export or a save.

## API surface

Everything is exported from the package root: document + elements
(`SldDocument`, `BusBar`, `Position`, `Connection` — each with an `.of({...})`
options factory — and the `element` / `external` endpoint helpers), `Grid`,
`LayoutEngine`,
the `CommandStack` and command classes, the batch-authoring helpers `autoWire`
and `buildDocument`, `Serializer` / `SldParseError`,
`SvgExporter` / `SvgBuilder`, the `SymbolRegistry` and default symbols, the
theme (`SldTheme`, `DEFAULT_THEME`, `resolveTheme`, `positionColors`, and the
generic formatting seam `ElementFormat` / `elementFormat` / `firstFormat`),
the metadata helper `getElementData`,
and the composite classes (`CompositeDocument`,
`DiagramInstance`, `CompositeLayoutEngine`, `CompositeSerializer`,
`CompositeSvgExporter`, `Transform2D`, `MapResolver`).

See [`docs/architecture.md`](../../docs/architecture.md) for the design.

## License

MIT © Adrian Sanchez R
