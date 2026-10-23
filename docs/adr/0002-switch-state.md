# ADR 0002 — Switching state is first-class on `Position`

- **Status:** accepted (2026-10-22)
- **Context:** box-view decoupling (#57) and the power-flow example both need to
  know whether a bay conducts.

## Context

`@sld-kit/core` models structure (`BusBar`, `Position`, `Connection`) and stays
out of domain *policy*. Two examples nonetheless needed the same fact, "is this
bay open?", and each stored it differently:

- power-flow used `data.flow.state`
- react-box used `data.switch.state`

Each had its own accessor wrappers, and every app had to write its own
"open looks like this" format rule for both the view and the export. Core
couldn't evaluate connectivity, so splitting a bus into sections needed an
external callback.

## Decision

1. **`Position.state?: 'open' | 'closed'`** (absent = closed). It's an additive,
   optional field under schema v2, validated and roundtripped. Switching state
   is part of the electrical model, mapping to CIM `Switch.open`. That's unlike
   business metadata such as commissioning, which stays consumer-owned under
   `data` (ADR 0001 D2).
2. **One reader:** `effectiveState(pos)`. Callers never read `pos.state` directly.
3. **A default look, overridable:** the theme's `switchOpenFormat` (faded and
   dashed) for the open bay, and `switchOpenConnectionFormat` (grey and dashed)
   for every connection *directly* touching it (stems, feeder, and composite
   links or lines anchored to it). Deeper de-energisation stays with the
   consumer. `resolveFormat(el, resolver, { doc })` is the single rule shared
   by the exporters and both adapters (`linkFormat` / `lineFormat` for
   composite links and lines): the consumer's resolver wins, otherwise the
   default applies.
4. **One styling seam for lines too:** `ElementFormat.stroke` colours
   connections and composite lines, so no per-feature colour callbacks are
   needed (the exporter's short-lived `lineStroke` option was removed).

## Consequences

- Examples share one convention; power-flow keeps only its flow *values*
  (MW, rating, direction, operable) in `data.flow`.
- Core can offer a generic connectivity helper later without a `conducts`
  callback.
- **Sub-elements (future):** ADR 0001 maps breakers and disconnectors to
  `Position.subElements`. To avoid two sources of truth, a bay's state is
  authored *either* on the Position (bays with no modelled devices) *or* on its
  devices (`subElements[].props.state`). `effectiveState` then derives the bay
  state: it conducts only if every series device is closed. Validation should
  warn when both are set.
- Diagrams without `state` render byte-identically.
