import { Connection, type ChildLayout, type ConnectionGeometry, type ExternalConnectionTip, type Point } from '@sld-kit/core';
import { Port } from './Port';
import { sideAxis, sideFromAngle, type BoxSide } from './side';

/** One external feeder of a child, pre-resolved from its child-local layout. */
interface Feeder {
  connectionId: string;
  /** Attach point in child-local coordinates (the SLD arrow tip). */
  localAt: Point;
  /** Edge in the child's own frame the feeder leaves from. */
  localSide: BoxSide;
  /** Edge in world axes (child rotation folded in) — the port's outward side. */
  worldSide: BoxSide;
  /** Position among same-side feeders (0-based) and how many share the side. */
  slot: number;
  slotCount: number;
}

/**
 * Turns a `(instanceId, connectionId)` reference into a floating {@link Port} for
 * the current view. This is the crux of the floating-connector model: the same
 * feeder resolves to the **SLD arrow tip** in detail view and to a point on the
 * **box-frame perimeter** in box view — distributed across same-side feeders by
 * slot so multiple lines on one edge never overlap. Nothing is stored; ports are
 * recomputed every layout, so a move, rotation or view switch just re-resolves.
 */
export class PortResolver {
  private readonly byChild = new Map<string, ChildLayout>();
  private readonly feeders = new Map<string, Map<string, Feeder>>();

  constructor(
    private readonly children: ChildLayout[],
    private readonly boxMode: boolean
  ) {
    for (const child of children) {
      this.byChild.set(child.instance.id, child);
      this.feeders.set(child.instance.id, this.collectFeeders(child));
    }
  }

  /** Resolve a feeder reference to its floating port for the active view, or null. */
  resolve(instanceId: string, connectionId: string): Port | null {
    const child = this.byChild.get(instanceId);
    const feeder = this.feeders.get(instanceId)?.get(connectionId);
    if (!child || !feeder) return null;
    const local = this.boxMode ? this.perimeterPoint(child, feeder) : feeder.localAt;
    return new Port(child.transform.apply(local), feeder.worldSide);
  }

  /** Every feeder's active-view attach point — the UI's draw-mode snap targets. */
  tips(): ExternalConnectionTip[] {
    const out: ExternalConnectionTip[] = [];
    for (const [instanceId, feeders] of this.feeders) {
      for (const connectionId of feeders.keys()) {
        const port = this.resolve(instanceId, connectionId);
        if (port) out.push({ instanceId, connectionId, point: port.point });
      }
    }
    return out;
  }

  /** Read the child's external feeders from its own layout, then order same-side slots. */
  private collectFeeders(child: ChildLayout): Map<string, Feeder> {
    const { layout, instance } = child;
    const raw: Omit<Feeder, 'slot' | 'slotCount'>[] = [];
    if (layout && instance.resolved) {
      for (const conn of instance.resolved.connections()) {
        if (!(conn instanceof Connection)) continue;
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        const geo = layout.geometry.get(conn.id) as ConnectionGeometry | undefined;
        if (geo?.kind !== 'connection' || !geo.arrow) continue;
        raw.push({
          connectionId: conn.id,
          localAt: geo.arrow.at,
          localSide: sideFromAngle(geo.arrow.angle),
          worldSide: sideFromAngle(geo.arrow.angle + instance.angleDeg)
        });
      }
    }

    // Slot ordering: same-side feeders sorted along the edge (x for up/down, y for
    // left/right) so the box perimeter spreads them in the child's own column order.
    const out = new Map<string, Feeder>();
    const bySide = new Map<BoxSide, typeof raw>();
    for (const f of raw) {
      const list = bySide.get(f.localSide) ?? [];
      list.push(f);
      bySide.set(f.localSide, list);
    }
    for (const [side, list] of bySide) {
      list.sort((a, b) => (sideAxis(side) === 'v' ? a.localAt.x - b.localAt.x : a.localAt.y - b.localAt.y));
      list.forEach((f, i) => out.set(f.connectionId, { ...f, slot: i, slotCount: list.length }));
    }
    return out;
  }

  /** A point on the box-frame perimeter, on the feeder's edge, spread by its slot. */
  private perimeterPoint(child: ChildLayout, feeder: Feeder): Point {
    const { frame } = child;
    const frac = (feeder.slot + 1) / (feeder.slotCount + 1);
    switch (feeder.localSide) {
      case 'up':
        return { x: frame.x + frame.width * frac, y: frame.y };
      case 'down':
        return { x: frame.x + frame.width * frac, y: frame.y + frame.height };
      case 'left':
        return { x: frame.x, y: frame.y + frame.height * frac };
      case 'right':
        return { x: frame.x + frame.width, y: frame.y + frame.height * frac };
    }
  }
}
