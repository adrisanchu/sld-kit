import { Connection } from '../elements/Connection';
import { externalBranch } from '../elements/branch';
import type { ConnectionGeometry } from '../layout/LayoutEngine';
import type { Point, Rect } from '../layout/geometry';
import type { ChildLayout, ExternalConnectionTip } from './CompositeLayoutEngine';
import { Port, facingSide, rotateSide, sideAxis, sideFromAngle, type BoxSide } from './ports';
import { feederBoxCenter, sectionBoxOf } from './sections';

/** Stable key for a feeder reference — the join key for injected peer centres. */
export const feederKey = (instanceId: string, connectionId: string): string => `${instanceId}\u0000${connectionId}`;

/** Per-instance auto-facing inputs the engine injects (it knows peer positions). */
export interface PortResolverOptions {
  /** Auto-facing policy on: derive a feeder's side from its peer's position. */
  autoFacing?: boolean;
  /** Peer child centre (world) per feeder, keyed by {@link feederKey}. */
  peerCenterOf?: Map<string, Point>;
}

/** One external feeder of a child, pre-resolved from its child-local layout. */
interface Feeder {
  connectionId: string;
  /** Attach point in child-local coordinates (the SLD arrow tip). */
  localAt: Point;
  /** Edge in the child's own frame the feeder leaves from (effective, child-local). */
  localSide: BoxSide;
  /** Edge in world axes (child rotation folded in) — the port's outward side. */
  worldSide: BoxSide;
  /** Peer child centre (world), when auto-facing supplied one — orders same-side slots. */
  peerCenter: Point | null;
  /** The child-local box the feeder leaves from: its section box when split, else the whole frame. */
  box: Rect;
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
    private readonly boxMode: boolean,
    private readonly options: PortResolverOptions = {}
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
    // Box perimeter in box view — except an expanded child, which is real detail
    // geometry: its feeders attach at the drawing's arrow tips, inside the child's
    // frame, so the port carries that frame for the router to escape.
    if (this.boxMode && !child.expanded) return new Port(child.transform.apply(this.perimeterPoint(feeder)), feeder.worldSide);
    return new Port(child.transform.apply(feeder.localAt), feeder.worldSide, child.worldBounds);
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
        // Auto-facing: the world side that faces the peer, un-rotated back into the
        // child's own frame so it coalesces with the (child-local) pin / authored
        // direction. Injected here, not baked into the doc — recomputed each layout.
        const peerCenter = this.options.peerCenterOf?.get(feederKey(instance.id, conn.id)) ?? null;
        // Facing is measured from the feeder's own box (its section box when the
        // child is split), so each section turns toward its own peer.
        const facing =
          this.options.autoFacing && peerCenter
            ? rotateSide(facingSide(feederBoxCenter(child, conn.id), peerCenter), -instance.angleDeg)
            : null;
        // The feeder's *effective* exit side (pin → facing → authored), falling
        // back to the layout arrow angle when the child left it implicit. Read
        // here so a pin/facing flows to both the perimeter edge (box) and the
        // port's outward side (router exit) without any per-view special case.
        const effective = instance.effectiveDirection(conn.id, { facing }) ?? sideFromAngle(geo.arrow.angle);
        raw.push({
          connectionId: conn.id,
          localAt: geo.arrow.at,
          localSide: effective,
          worldSide: rotateSide(effective, instance.angleDeg),
          peerCenter,
          box: sectionBoxOf(child.boxes, conn.id)?.frame ?? child.frame
        });
        // A three-winding transformer's third winding is an external end of its
        // own, keyed by its branch id: a snap target, a line anchor and an
        // auto-link key. Its side is fixed (perpendicular to the feeder).
        const branch = externalBranch(conn);
        if (branch && geo.branch) {
          const side = sideFromAngle(geo.branch.arrow.angle);
          raw.push({
            connectionId: branch.id,
            localAt: geo.branch.arrow.at,
            localSide: side,
            worldSide: rotateSide(side, instance.angleDeg),
            peerCenter: null,
            box: sectionBoxOf(child.boxes, conn.id)?.frame ?? child.frame
          });
        }
      }
    }

    // Slot ordering: same-side feeders sorted along the edge so the perimeter
    // spreads them without crossings. Under auto-facing, order by the *peer's*
    // position along the edge (so two feeders that turned to face different peers
    // keep their peers' left-to-right order); otherwise by the child's own tip
    // order (its column order). x orders top/bottom edges, y the left/right ones.
    // Slots are per box edge, so a split child's sections spread independently.
    const out = new Map<string, Feeder>();
    const bySide = new Map<string, { side: BoxSide; list: typeof raw }>();
    for (const f of raw) {
      const key = `${f.box.x},${f.box.y} ${f.localSide}`;
      const group = bySide.get(key) ?? { side: f.localSide, list: [] };
      group.list.push(f);
      bySide.set(key, group);
    }
    for (const { side, list } of bySide.values()) {
      const along = (f: (typeof raw)[number]) => {
        const p = this.options.autoFacing && f.peerCenter ? f.peerCenter : f.localAt;
        return sideAxis(side) === 'v' ? p.x : p.y;
      };
      list.sort((a, b) => along(a) - along(b));
      list.forEach((f, i) => out.set(f.connectionId, { ...f, slot: i, slotCount: list.length }));
    }
    return out;
  }

  /** A point on the feeder's box perimeter (its section box when split), on its edge, spread by its slot. */
  private perimeterPoint(feeder: Feeder): Point {
    const frame = feeder.box;
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
