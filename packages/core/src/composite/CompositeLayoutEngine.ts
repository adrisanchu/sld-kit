import { LayoutEngine, type DiagramLayout } from '../layout/LayoutEngine';
import { Transform2D } from '../layout/Transform2D';
import type { Point, Rect } from '../layout/geometry';
import { CompositeDocument } from './CompositeDocument';
import { DiagramInstance } from './DiagramInstance';

/** Fixed frame for an unresolved child, so it stays selectable and movable. */
export const PLACEHOLDER_FRAME = { width: 360, height: 240 } as const;

export interface ChildLayout {
  instance: DiagramInstance;
  /** Child-local layout; null when the child is unresolved (placeholder). */
  layout: DiagramLayout | null;
  /** pivot = child layout center. */
  transform: Transform2D;
  /** Child-local frame: { 0, 0, size.width, size.height }. */
  frame: Rect;
  /** AABB of the rotated frame (selection, fit). */
  worldBounds: Rect;
  /** The 4 rotated corners (outline, rotation handle). */
  worldCorners: Point[];
  /**
   * Local flip (0 or 180) applied to every label so it stays aligned with the
   * rotated diagram yet never reads upside-down: 180 when the child sits in the
   * upside-down half turn, 0 otherwise. Labels ride with the child transform,
   * only flipping to be read from the other side. See `labelFlipDeg`.
   */
  labelAngleDeg: number;
}

/**
 * Local label flip keeping text aligned with the diagram axis but never
 * upside-down: 180° when the child's angle falls in the upside-down half
 * `(90, 270)`, else 0°. The label's on-screen orientation is therefore
 * `childAngle + labelAngleDeg`, i.e. always on the diagram's own axis.
 */
export function labelFlipDeg(angleDeg: number): number {
  const a = ((angleDeg % 360) + 360) % 360;
  return a > 90 && a < 270 ? 180 : 0;
}

export interface CompositeLink {
  /** The shared connection id that created the link. */
  connectionId: string;
  a: { instanceId: string; point: Point };
  b: { instanceId: string; point: Point };
  /** Polyline (v1: two points). */
  points: Point[];
}

export interface CompositeLayout {
  children: ChildLayout[];
  links: CompositeLink[];
  /** Union of every child's worldBounds and every link point. */
  bounds: Rect;
}

/**
 * Lays out a composite by reusing the existing single-diagram `LayoutEngine`
 * per child, unchanged: each resolved child is laid out in its own local
 * coordinate space exactly as the single-diagram editor would, and the
 * composite merely wraps that geometry in the instance's `Transform2D`.
 */
export class CompositeLayoutEngine {
  constructor(private childEngine: LayoutEngine = new LayoutEngine()) {}

  layout(doc: CompositeDocument): CompositeLayout {
    const children: ChildLayout[] = [];

    for (const instance of doc.allChildren()) {
      const resolved = instance.resolved;
      const layout = resolved ? this.childEngine.layout(resolved) : null;
      const frame: Rect = layout
        ? { x: 0, y: 0, width: layout.size.width, height: layout.size.height }
        : { x: 0, y: 0, width: PLACEHOLDER_FRAME.width, height: PLACEHOLDER_FRAME.height };
      const pivot: Point = { x: frame.width / 2, y: frame.height / 2 };
      const transform = new Transform2D(instance.x, instance.y, instance.angleDeg, pivot);
      children.push({
        instance,
        layout,
        transform,
        frame,
        worldBounds: transform.boundsOf(frame),
        worldCorners: transform.applyRect(frame),
        labelAngleDeg: labelFlipDeg(instance.angleDeg)
      });
    }

    const links = this.detectLinks(children);
    const bounds = this.unionBounds(children, links);
    return { children, links, bounds };
  }

  /**
   * Two external connections in different children that carry the same id are
   * the same physical asset — link them. Only external endpoints participate;
   * each child contributes at most one endpoint per id (the serializer rejects
   * duplicate ids within a document), so two ends always come from distinct
   * instances. When more than two children share an id, the first two (in
   * insertion order) link, the rest are skipped (documented v1 limitation).
   */
  private detectLinks(children: ChildLayout[]): CompositeLink[] {
    const index = new Map<string, { instanceId: string; tip: Point }[]>();

    for (const child of children) {
      const { layout, instance, transform } = child;
      if (!layout || !instance.resolved) continue;
      for (const conn of instance.resolved.connections()) {
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        const geo = layout.geometry.get(conn.id);
        if (geo?.kind !== 'connection' || !geo.arrow) continue;
        const tip = transform.apply(geo.arrow.at);
        const ends = index.get(conn.id) ?? [];
        ends.push({ instanceId: instance.id, tip });
        index.set(conn.id, ends);
      }
    }

    const links: CompositeLink[] = [];
    for (const [connectionId, ends] of index) {
      if (ends.length < 2) continue;
      const [first, second] = ends;
      links.push({
        connectionId,
        a: { instanceId: first.instanceId, point: first.tip },
        b: { instanceId: second.instanceId, point: second.tip },
        points: [first.tip, second.tip]
      });
    }
    return links;
  }

  private unionBounds(children: ChildLayout[], links: CompositeLink[]): Rect {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const extend = (p: Point) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    };
    for (const child of children) {
      const b = child.worldBounds;
      extend({ x: b.x, y: b.y });
      extend({ x: b.x + b.width, y: b.y + b.height });
    }
    for (const link of links) for (const p of link.points) extend(p);

    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}
