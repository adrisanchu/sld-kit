import type { CompositeLayout, Point } from '@sld-kit/core';

/**
 * One animatable polyline in composite (world) coordinates, addressed by a
 * stable `key` so a consumer's overlay resolver and any per-line state (flow
 * magnitude, open/closed, …) can reference it without knowing its origin.
 */
export interface WorldLine {
  /**
   * Stable address, one of:
   * - `link:<connectionId>` — an inter-diagram auto-link,
   * - `line:<lineId>` — a manually-drawn composite line,
   * - `<instanceId>:<elementId>` — a connection *inside* a child diagram.
   */
  key: string;
  /** World-space polyline the flow runs along (≥ 2 points). */
  points: Point[];
}

/**
 * Flatten a `CompositeLayout` into every polyline a flow overlay can animate,
 * all in world coordinates. Composite links and manual lines are already in
 * world space; a child's internal connections are mapped out of the child's
 * local frame via its `Transform2D`, so they land exactly on the rendered
 * connections at any child rotation.
 *
 * Domain-agnostic: it emits geometry + stable keys only. Hop arcs (the small
 * semicircular crossings) are omitted — a flow indicator follows the base
 * polyline; the drawn diagram still renders hops normally underneath.
 */
export function worldLines(layout: CompositeLayout): WorldLine[] {
  const out: WorldLine[] = [];

  for (const link of layout.links) {
    if (link.points.length >= 2) out.push({ key: `link:${link.connectionId}`, points: link.points });
  }

  for (const ln of layout.lines) {
    if (ln.points.length >= 2) out.push({ key: `line:${ln.line.id}`, points: ln.points });
  }

  for (const child of layout.children) {
    const cl = child.layout;
    if (!cl) continue; // unresolved placeholder — nothing to animate
    const t = child.transform;
    for (const [id, geo] of cl.geometry) {
      if (geo.kind !== 'connection' || geo.points.length < 2) continue;
      out.push({ key: `${child.instance.id}:${id}`, points: geo.points.map((p) => t.apply(p)) });
    }
  }

  return out;
}
