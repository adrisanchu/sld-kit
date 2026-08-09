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
import type { CompositeLayout } from '@sld-kit/core';
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
          ? { active: !bay.open, direction: bay.direction, magnitude: bay.open ? 0 : bay.mw, capacity: bay.capacity }
          : BLOCKED
      );
    }
  }

  // Inter-diagram tie-lines: active only when both feeding bays are closed;
  // magnitude is the weaker of the two ends (a line can't carry more than its
  // limiting bay). Ensures opening a bay on either side stops the tie visibly.
  for (const link of layout.links) {
    const ends = [link.a, link.b];
    let active = true;
    let magnitude = Infinity;
    let capacity = Infinity;
    let direction: 1 | -1 = 1;
    for (const end of ends) {
      const bay = bayInfo.get(bayOfConn.get(`${end.instanceId}:${link.connectionId}`) ?? '');
      if (!bay || bay.open) {
        active = false;
        break;
      }
      magnitude = Math.min(magnitude, bay.mw);
      capacity = Math.min(capacity, bay.capacity);
      direction = bay.direction;
    }
    map.set(
      `link:${link.connectionId}`,
      active ? { active: true, direction, magnitude, capacity } : BLOCKED
    );
  }

  return map;
}
