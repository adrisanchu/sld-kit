/**
 * A **toy** flow model — deliberately NOT a real load-flow solver. It exists to
 * make example 03 feel alive: each bay carries a seeded nominal magnitude; a
 * closed bay lights up its connections (and any tie-line it feeds), an open bay
 * greys them out. Swap this whole file for a real engine (or an API call) later —
 * everything downstream only depends on the returned `FlowMap`.
 *
 * Keys match `worldLines(layout)`: `<instanceId>:<connId>` for a child's internal
 * connection, `link:<connId>` for an inter-diagram auto-link.
 */
import type { CompositeLayout, SldDocument, Endpoint } from '@sld-kit/core';
import { getFlow } from './flow-data';

export interface FlowInfo {
  active: boolean;
  direction: 1 | -1;
  /** Live magnitude in MW (0 when blocked). */
  magnitude: number;
  /** Thermal rating in MW; `magnitude / capacity` is the load ratio. */
  capacity: number;
}

export type FlowMap = Map<string, FlowInfo>;

interface Bay {
  open: boolean;
  mw: number;
  capacity: number;
  direction: 1 | -1;
}

const BLOCKED: FlowInfo = { active: false, direction: 1, magnitude: 0, capacity: 1 };

/**
 * Position of an endpoint along a bay's flow axis: a feeder is the outside
 * (source/sink beyond the substation), the busbar is the inside, the position
 * sits between. A bay's physical direction (`+1` = feeder→bus injection, `-1` =
 * bus→feeder withdrawal) then orders every connection the bay touches, so the
 * dots CROSS the position instead of radiating from it.
 */
function endpointAxis(ep: Endpoint, doc: SldDocument): number {
  if (ep.kind !== 'element') return -1; // external feeder — outermost
  return doc.getElement(ep.id)?.kind === 'busbar' ? 1 : 0; // busbar innermost, position centre
}

/**
 * Animation direction (`+1` = along the polyline `from`→`to`, `-1` = reverse) for
 * one connection, so a dot travels from the lower axis position to the higher one
 * under the bay's physical direction. Continuous through the box: e.g. a
 * generator (`+1`) reads feeder→position on its feeder leg and position→busbar on
 * its bus leg — one unbroken path.
 */
function connectionDirection(conn: { from: Endpoint; to: Endpoint }, doc: SldDocument, physical: 1 | -1): 1 | -1 {
  const delta = endpointAxis(conn.to, doc) - endpointAxis(conn.from, doc);
  return physical * delta < 0 ? -1 : 1;
}

/**
 * Compute the live flow for every animatable line from the current switch state,
 * which is read straight out of each element's `data.flow.state` (the single
 * source of truth — flip it with a command, then recompute).
 */
export function computeFlowMap(layout: CompositeLayout): FlowMap {
  const map: FlowMap = new Map();

  // Per-child indexes: bay attributes by `instanceId:posId`, and the bay a given
  // `instanceId:connId` belongs to (the position endpoint the connection touches).
  const bayInfo = new Map<string, Bay>();
  const bayOfConn = new Map<string, string>();

  for (const child of layout.children) {
    const doc = child.instance.resolved;
    if (!doc) continue;
    const inst = child.instance.id;

    const posIds = new Set(doc.positions().map((p) => p.id as string));
    for (const pos of doc.positions()) {
      const f = getFlow(pos);
      bayInfo.set(`${inst}:${pos.id}`, {
        open: f?.state === 'open',
        mw: f?.mw ?? 0,
        capacity: f?.capacity ?? 1,
        direction: f?.direction ?? 1
      });
    }

    for (const conn of doc.connections()) {
      const bayPosId = conn.elementIds().find((id) => posIds.has(id as string));
      const key = `${inst}:${conn.id}`;
      if (!bayPosId) {
        map.set(key, BLOCKED);
        continue;
      }
      const bayId = `${inst}:${bayPosId}`;
      bayOfConn.set(key, bayId);
      const bay = bayInfo.get(bayId);
      map.set(
        key,
        bay
          ? {
              active: !bay.open,
              direction: connectionDirection(conn, doc, bay.direction),
              magnitude: bay.open ? 0 : bay.mw,
              capacity: bay.capacity
            }
          : BLOCKED
      );
    }
  }

  // Inter-diagram tie-lines: active only when both feeding bays are closed;
  // magnitude is the weaker of the two ends (a line can't carry more than its
  // limiting bay). Ensures opening a bay on either side stops the tie visibly.
  // The link's polyline runs a→b, so it flows a→b (+1) when the a-side bay is
  // *withdrawing* to the tie (bus→feeder, physical -1) — i.e. exporting into the
  // link — keeping the dots continuous with the a-side feeder leg.
  for (const link of layout.links) {
    const aBay = bayInfo.get(bayOfConn.get(`${link.a.instanceId}:${link.connectionId}`) ?? '');
    const bBay = bayInfo.get(bayOfConn.get(`${link.b.instanceId}:${link.connectionId}`) ?? '');
    if (!aBay || !bBay || aBay.open || bBay.open) {
      map.set(`link:${link.connectionId}`, BLOCKED);
      continue;
    }
    map.set(`link:${link.connectionId}`, {
      active: true,
      direction: aBay.direction === -1 ? 1 : -1,
      magnitude: Math.min(aBay.mw, bBay.mw),
      capacity: Math.min(aBay.capacity, bBay.capacity)
    });
  }

  return map;
}
