# Architecture

`@sld-kit/core` is a headless engine: it turns a **content model** of a
single-line diagram into **geometry** and **SVG**, and back and forth to JSON.
It never paints pixels itself and never decides colors — a renderer and a theme
do that. This document describes the pieces and how they fit.

## The content/layout split

The persisted document stores **no pixel coordinates**. Elements live in a
matrix of rows and columns; the `LayoutEngine` maps that matrix to pixels using
a `SldLayoutConfig` (spacing, box sizes, margins). This is the Mermaid model:
content is decoupled from presentation, so restyling a diagram is a config
change, not a data migration.

```
JSON  ──Serializer──▶  SldDocument  ──LayoutEngine──▶  DiagramLayout (geometry)
                            │                                   │
                            │                                   ├─▶ your renderer paints it
                            └──────────── SvgExporter ──────────┴─▶ standalone SVG string
```

## The document model

- **`SldDocument`** — the root aggregate: `meta` + grid dimensions + an ordered
  map of elements. Insertion order defines a stable z-order. Mutations are
  low-level and are meant to be called **only by commands**, so undo/redo can
  never desync. It exposes `subscribe()` — a minimal store contract any
  framework can bridge.
- **Elements** (`SldElement` subclasses):
  - **`BusBar`** — a thick horizontal line occupying an entire row.
  - **`Position`** — a typed box in one slot (`type` drives color and
    auto-naming; open string, see below).
  - **`Connection`** — an edge between two `Endpoint`s. An endpoint is either
    another element (by id) or an **external asset** (a line/transformer/…
    leaving the diagram, drawn as a stem + arrowhead + optional glyph).
- Elements reference each other **only by id** and never hold geometry. Ids are
  stable UUIDs (`newId()`), preserved across every roundtrip — which is what
  makes the sidecar-metadata pattern reliable.

## Grid

`Grid` is a read-only view over a document that answers spatial questions:
occupancy, empty rows/columns, and `planMove` — which computes the whole
displacement chain when you drop a position onto an occupied slot. It returns a
plan; a command applies it.

## Layout

`LayoutEngine.layout(doc)` returns a `DiagramLayout`: a `Map<ElementId,
ElementGeometry>` plus the overall size and helpers (`cellRect`, `cellAt`,
`rowBoundaryY`). Connection routing (stems, orthogonal jogs, virtual-node taps
for double-busbar bays, external arrows and lanes) is all computed here. The
engine takes an injectable `SldLayoutConfig` (default `SLD_LAYOUT`), so the same
document renders at different scales without touching its data.

## Commands & undo/redo

Every mutation is a `Command` with `do` / `undo`. `CommandStack` is a classic
undo/redo stack. Because commands are the sole mutators, the history is always
complete. Notable commands:

- **`AddPositionCommand`** auto-wires a new bay into its column (nearest element
  above and below, splitting any direct link it interrupts) and, for external
  bay types, spawns the outgoing asset arrow — all as one undoable step.
- **`SnapshotCommand`** swaps the whole document for compound operations
  (re-scaffold, import) where per-op bookkeeping would be fragile.

## Serialization

`Serializer` is the interchange format. `toJSON` / `fromJSON` with hand-rolled
structural validation (zero deps) and a migration registry keyed by _from_
version. The current schema is **version 2**; v1 upgrades transparently. Errors
are thrown as `SldParseError` with **English, user-presentable** messages — a
consumer that wants localized copy catches it at its import boundary and wraps
it.

## Export

`SvgExporter` renders a `DiagramLayout` to a standalone SVG string under strict
Office-import constraints: presentation attributes only, arrowheads as filled
paths (never `<marker>`), no `<style>` / classes / CSS variables / `currentColor`
/ `<foreignObject>`, explicit pixel `width`/`height` on the root. It shares the
`LayoutEngine` with the live view, so exports match the screen exactly. Glyphs
come from an injectable `SymbolRegistry`.

## Theme

All export colors resolve against an injected `SldTheme` (`positionTypes` keyed
by type, a `fallbackPositionType`, and `structure` colors for bars/stems/labels/
background). `DEFAULT_THEME` reproduces the original light palette, so an export
with no theme option is byte-for-byte the historical output. `resolveTheme`
deep-merges a partial theme over the default.

## Open `PositionType`

`PositionType` is `('line' | 'transformer' | 'central' | 'renewable' |
'reserve') | (string & {})` — the five defaults seed autocompletion, but any
string is accepted. Unknown types render with `fallbackPositionType` and
auto-name from the type string. Theme entries and naming prefixes are overridable
maps, so custom bay types need no library release.

## Opaque `data`

`SldElement` and `DocumentMeta` carry an optional `data?: unknown`. The library
roundtrips it (deep-copied via `structuredClone`) but never reads it. JSON
boundary types are generic (`PositionJson<TData>`, …) for typing at the edge;
inside the core it is `unknown`, narrowed by `getElementData<T>()`. See the
package README for the contract and the sidecar guidance.

For the direction on which properties stay first-class vs. move into `data`, on
property-agnostic styling, and on CIM (IEC 61968) interchange, see
[ADR 0001](./adr/0001-property-model-and-cim.md).

## Composite ("diagram of diagrams")

See [`composite.md`](./composite.md).

## Interactive views & flow animation (Svelte layer)

A second way to consume a composite — beyond authoring — is to **operate and
watch** it: fly into a child, toggle its elements, and animate flow along the
wires. These are live-view concerns, so they live entirely in `@sld-kit/svelte`;
the core model and the office-safe exporter never animate. An export is always a
static snapshot (it can still _colour_ by state via `resolveElementFormat`, which
is office-safe — but no `<style>`/`<animate>` ever enters the SVG).

Everything here is **domain-agnostic**, the same discipline as
`resolveElementFormat` ([ADR 0001](./adr/0001-property-model-and-cim.md)): the
components never learn what the interaction or the flow _means_. "Power flow" is
just one consumer (see `examples/svelte` route `/power-flow`); financial,
geographic or maintenance overlays are others.

- **Explore/focus mode** — `CompositeExplorer` (over `CompositeCanvas`) keeps
  child _transforms_ read-only but makes a focused child's _internals_
  interactive. Clicking a child emits `childfocus`; `flyTo(child.worldBounds)`
  (an eased `viewBox` tween in `panzoom.ts`, cancelled by any user gesture,
  instant under reduced-motion) frames it on the same canvas — no route change,
  no dialog; unfocused children dim. Clicking an operable element emits a generic
  `elementactivate {instanceId, elementId}`; a background click / back control
  flies out via `flyToFit`. The consumer decides what an activation does (e.g.
  toggle a switch through an `UpdateElementCommand`) and re-derives the layout.

- **Flow overlay** — `FlowOverlay` animates travelling dots along any set of
  polylines. `worldLines(layout)` flattens a `CompositeLayout` into
  world-space `{ key, points }[]` (links, manual lines, and each child's internal
  connections mapped through its `Transform2D`); a consumer `resolveFlow(key) =>
  FlowStyle` maps each line to `{ active, direction, speed, intensity, dashed,
  colorClass }` — the flow analogue of a `FormatResolver`. Motion is pure CSS
  (`stroke-dashoffset` on a round-capped near-zero dash), so hundreds of lines
  stay cheap; inactive lines render greyed and dotless, and a `paused` prop plus
  a `prefers-reduced-motion` rule freeze it for offscreen/accessibility cases.

If per-dot rendering ever outgrows the SVG+CSS path, a canvas-2D overlay can slot
in behind the same `FlowOverlay` API without a new dependency — deferred until
profiling shows the need.
