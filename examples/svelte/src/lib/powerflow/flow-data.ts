/**
 * Power-flow — a **consumer-owned** domain concept, not part of `@sld-kit/core`.
 *
 * The library is domain-agnostic: it stores arbitrary `data` and exposes generic
 * seams (`resolveElementFormat` for element styling, `resolveFlow` for the flow
 * overlay). This module is example 03's *policy*: it reads/writes a flow tag in
 * the reserved `data.flow` namespace. Swap it to drive the same visuals from
 * anything else (financial, geographic, maintenance) without touching the library.
 */
import type { SldElement, ElementFormat, SldDocument } from '@sld-kit/core';

export type SwitchState = 'open' | 'closed';

/**
 * Flow attributes attached to a position (a switchable bay) or, optionally, a
 * connection. Values are structured-cloneable primitives so they survive JSON
 * roundtrips. `mw` is a *seeded* nominal magnitude — random today, tweak to taste.
 */
export interface FlowData {
  /** This position is a switch the operator can open/close. */
  operable?: boolean;
  /** Current switch state (operable positions only). */
  state?: SwitchState;
  /** Nominal magnitude carried by this bay when closed, in MW (seeded). */
  mw?: number;
  /** Thermal rating in MW; a load ratio > 1 reads as overloaded. */
  capacity?: number;
  /** Nominal travel direction along the bay's connections. */
  direction?: 1 | -1;
}

/** Read an element's flow attributes from the reserved `data.flow` namespace. */
export function getFlow(el: SldElement): FlowData | undefined {
  return (el.data as { flow?: FlowData } | undefined)?.flow;
}

/** Merge a partial `flow` patch into `data.flow`, preserving every other key. */
export function withFlow(data: unknown, flow: Partial<FlowData>): unknown {
  const base = (typeof data === 'object' && data !== null ? { ...data } : {}) as Record<string, unknown>;
  base.flow = { ...(base.flow as FlowData | undefined), ...flow };
  return base;
}

/**
 * Return a new `data` value with `flow.state` set, preserving every other key.
 * Pure — callers apply the result through an `UpdateElementCommand` so undo/redo
 * stays complete.
 */
export function withFlowState(data: unknown, state: SwitchState): unknown {
  return withFlow(data, { state });
}

/**
 * One power-flow reading for a single asset, keyed by its element `id` — the
 * shape a third-party power-flow engine (pandapower / PyPSA / a SCADA feed)
 * would hand over as a plain list. It carries no geometry and no library
 * concepts: just an id and its values.
 */
export interface PowerFlowReading {
  /** Matches a bay (position) id in one of the child diagrams. */
  id: string;
  /** Nominal magnitude carried when closed, in MW. */
  mw: number;
  /** Thermal rating in MW; `mw / capacity > 1` reads as overloaded. */
  capacity: number;
  /** Travel direction along the bay's connections (default `1`). */
  direction?: 1 | -1;
  /** Initial switch state (default `'closed'`). */
  state?: SwitchState;
}

/**
 * Merge an external list of readings into a diagram's `data.flow` — the concrete
 * "third-party API shares a list of {id, values}; the consumer folds it into the
 * opaque `data` channel" pattern. Any element whose id matches a reading becomes
 * an operable bay carrying that reading; everything else is left untouched.
 *
 * Run at the import boundary (before the diagram goes read-only). Later operator
 * actions still go through commands so undo/redo stays intact.
 */
export function applyPowerFlow(doc: SldDocument, readings: PowerFlowReading[]): void {
  const byId = new Map(readings.map((r) => [r.id, r]));
  for (const pos of doc.positions()) {
    const r = byId.get(pos.id);
    if (!r) continue;
    pos.data = withFlow(pos.data, {
      operable: true,
      state: r.state ?? 'closed',
      mw: r.mw,
      capacity: r.capacity,
      direction: r.direction ?? 1
    });
  }
}

/**
 * Example 03's element styling policy, passed to the exporter's
 * `resolveElementFormat` and the live `formatResolver` so screen and export
 * agree. Element-local (no live model needed): an open switch reads faded +
 * dashed; a bay near/over its rating reads amber/red. The *travelling dots'*
 * live colour is handled separately by the flow overlay's `resolveFlow`.
 */
export function flowFormat(el: SldElement): ElementFormat | undefined {
  const f = getFlow(el);
  if (!f) return undefined;
  if (f.state === 'open') return { fillOpacity: 0.25, dashArray: '4 3' };
  const load = f.capacity ? (f.mw ?? 0) / f.capacity : 0;
  if (load > 0.9) return { fill: '#ef4444' };
  if (load > 0.75) return { fill: '#f59e0b' };
  return undefined;
}
