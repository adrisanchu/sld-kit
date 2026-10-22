/**
 * Power-flow — a **consumer-owned** domain concept, not part of `@sld-kit/core`.
 *
 * The library stores arbitrary `data` and exposes generic seams (`resolveFlow`
 * for the flow overlay). This module is example 03's *policy*: it reads/writes
 * flow values (MW, rating, direction) in the `data.flow` namespace. Switching
 * state is NOT here: it is core's first-class `Position.state` (read it with
 * `effectiveState`), which also gives open bays core's default faded/dashed look.
 */
import type { SldElement, SldDocument, SwitchState } from '@sld-kit/core';

/**
 * Flow attributes attached to a position (a switchable bay) or, optionally, a
 * connection. Values are structured-cloneable primitives so they survive JSON
 * roundtrips. `mw` is a *seeded* nominal magnitude — random today, tweak to taste.
 */
export interface FlowData {
  /** This position is a switch the operator can open/close (UI policy). */
  operable?: boolean;
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
 * Merge an external list of readings into a diagram — the concrete "third-party
 * API shares a list of {id, values}; the consumer folds it in" pattern. Any
 * position whose id matches a reading becomes an operable bay: its values go to
 * `data.flow`, its initial switching state to `Position.state`.
 *
 * Run at the import boundary (before the diagram goes read-only). Later operator
 * actions still go through commands so undo/redo stays intact.
 */
export function applyPowerFlow(doc: SldDocument, readings: PowerFlowReading[]): void {
  const byId = new Map(readings.map((r) => [r.id, r]));
  for (const pos of doc.positions()) {
    const r = byId.get(pos.id);
    if (!r) continue;
    if (r.state) pos.state = r.state;
    pos.data = withFlow(pos.data, {
      operable: true,
      mw: r.mw,
      capacity: r.capacity,
      direction: r.direction ?? 1
    });
  }
}

/** Load-ratio bands. Line colour is driven off these (see the route's `resolveFlow`). */
export type LoadTier = 'nominal' | 'loaded' | 'high' | 'overloaded';

/**
 * Bucket a load ratio (`mw / capacity`) into a tier:
 * `> 1` overloaded, `0.9–1` high, `0.7–0.9` loaded, `≤ 0.7` nominal.
 */
export function loadTier(load: number): LoadTier {
  if (load > 1) return 'overloaded';
  if (load > 0.9) return 'high';
  if (load > 0.7) return 'loaded';
  return 'nominal';
}
