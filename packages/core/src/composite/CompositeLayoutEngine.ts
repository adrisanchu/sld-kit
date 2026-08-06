import { Connection } from '../elements/Connection';
import { LayoutEngine, type DiagramLayout } from '../layout/LayoutEngine';
import { Transform2D } from '../layout/Transform2D';
import type { Point, Rect } from '../layout/geometry';
import { CompositeDocument } from './CompositeDocument';
import { CompositeLine } from './CompositeLine';
import { chordFrame } from './lineFrame';
import { DiagramInstance, normalizeQuarterTurn, type LabelAnchor } from './DiagramInstance';

/** Fixed frame for an unresolved child, so it stays selectable and movable. */
export const PLACEHOLDER_FRAME = { width: 360, height: 240 } as const;

/** Gap kept between the name label and the frame edge it hugs, in child-local units. */
export const NAME_LABEL_PAD = 6;

/** Name-label font size — larger than element labels, rendered bold, so the
 *  diagram name stands out from the position/bus/connection labels. */
export const NAME_LABEL_FONT_SIZE = 20;

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
  /**
   * Always-on identifying label: the resolved diagram's `meta.name`, or the
   * `libraryId` when unresolved so a placeholder frame stays identifiable.
   */
  name: string;
  /** Resolved geometry of the `name` label — anchor slot, extra rotation, size. */
  nameLabel: NameLabelLayout;
}

/**
 * Placement of a child's `name` label, in child-local coordinates. Drawn inside
 * the child's transform (so it rides the child's rotation) and additionally
 * rotated by `rotation` about `(x, y)`: the user's quarter-turn `labelDirection`
 * plus a `{0, 180}` readability flip so the text never reads upside-down.
 */
export interface NameLabelLayout {
  x: number;
  y: number;
  /** SVG `text-anchor` for the chosen slot (left→start, center→middle, right→end). */
  textAnchor: 'start' | 'middle' | 'end';
  /** Extra rotation about `(x, y)`, in degrees: `labelDirection` + readability flip. */
  rotation: number;
  fontSize: number;
}

/**
 * Resolve a name label to a placement that stays **inside** the child's frame at
 * any rotation. Slots are semantic to the child's own frame (they ride its
 * rotation); `direction` (quarter turns) plus a `{0, 180}` readability flip give
 * the on-screen rotation. Because the frame and label rotate together, staying
 * inside is a purely local problem: the anchor is pinned to the slot's edge and
 * the `text-anchor` is chosen so the text grows *into* the frame rather than out
 * of the corner. (Very long names may still overflow the far edge, exactly as a
 * horizontal label does today.)
 */
export function resolveNameLabelLayout(
  frame: Rect,
  anchor: LabelAnchor,
  direction: number,
  angleDeg: number
): NameLabelLayout {
  const fontSize = NAME_LABEL_FONT_SIZE;
  const capH = fontSize; // generous cap height incl. padding
  const desc = fontSize * 0.25; // descender / far-side breathing room
  const pad = NAME_LABEL_PAD;
  const ix = NAME_LABEL_PAD + 2; // slightly larger horizontal inset for left/right slots

  const dir = normalizeQuarterTurn(direction);
  const rotation = (dir + labelFlipDeg(angleDeg + dir)) % 360; // 0 | 90 | 180 | 270

  const hpos = anchor.endsWith('left') ? 'left' : anchor.endsWith('right') ? 'right' : 'center';
  const vpos = anchor.startsWith('top') ? 'top' : anchor.startsWith('bottom') ? 'bottom' : 'center';

  // Advance (text flow for anchor `start`) and up (baseline→cap) unit vectors
  // after applying `rotation`, in the child-local axes (y points down).
  const A = ({ 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] } as const)[rotation as 0 | 90 | 180 | 270];
  const U = ({ 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] } as const)[rotation as 0 | 90 | 180 | 270];

  const left = frame.x;
  const right = frame.x + frame.width;
  const topY = frame.y;
  const botY = frame.y + frame.height;
  const midX = (left + right) / 2;
  const midY = (topY + botY) / 2;

  // Pin the anchor along the text's advance axis (grow inward from the slot's
  // edge, or centered when the slot is centered on that axis) and center/inset
  // it along the perpendicular cap axis.
  let x: number;
  let y: number;
  let textAnchor: 'start' | 'middle' | 'end';

  if (A[1] === 0) {
    // Horizontal text: advance along x (pinned by hpos), caps along y (by vpos).
    if (hpos === 'left') {
      textAnchor = A[0] > 0 ? 'start' : 'end';
      x = left + ix;
    } else if (hpos === 'right') {
      textAnchor = A[0] > 0 ? 'end' : 'start';
      x = right - ix;
    } else {
      textAnchor = 'middle';
      x = midX;
    }

    if (vpos === 'top') y = topY + pad + (U[1] < 0 ? capH : desc);
    else if (vpos === 'bottom') y = botY - pad - (U[1] > 0 ? capH : desc);
    else y = midY - (U[1] * capH) / 2;
  } else {
    // Vertical text: advance along y (pinned by vpos), caps along x (by hpos).
    if (vpos === 'top') {
      textAnchor = A[1] > 0 ? 'start' : 'end';
      y = topY + pad;
    } else if (vpos === 'bottom') {
      textAnchor = A[1] > 0 ? 'end' : 'start';
      y = botY - pad;
    } else {
      textAnchor = 'middle';
      y = midY;
    }

    if (hpos === 'left') x = left + ix + (U[0] > 0 ? desc : capH);
    else if (hpos === 'right') x = right - ix - (U[0] > 0 ? capH : desc);
    else x = midX - (U[0] * capH) / 2;
  }

  return { x, y, textAnchor, rotation, fontSize };
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

/** Resolve child `Connection`s from `(instanceId, connectionId)` references. */
function connectionsFor(
  refs: { instanceId: string; connectionId: string }[],
  children: ChildLayout[]
): Connection[] {
  const out: Connection[] = [];
  for (const { instanceId, connectionId } of refs) {
    const el = children.find((c) => c.instance.id === instanceId)?.instance.resolved?.getElement(connectionId);
    if (el instanceof Connection) out.push(el);
  }
  return out;
}

/**
 * The child `Connection`s behind an **auto-link** — both children share the
 * link's `connectionId`. Purely structural (no styling policy): a consumer runs
 * its own `resolveElementFormat` over these (see `firstFormat`) to style the
 * tie-line, so tagging *either* diagram is enough without the core knowing what
 * the tag means.
 */
export function linkConnections(link: CompositeLink, children: ChildLayout[]): Connection[] {
  return connectionsFor(
    [
      { instanceId: link.a.instanceId, connectionId: link.connectionId },
      { instanceId: link.b.instanceId, connectionId: link.connectionId }
    ],
    children
  );
}

/**
 * The child `Connection`s a **hand-drawn manual line** anchors to. Its `anchor`
 * vertices reference the same shared `connectionId` (which also suppresses the
 * auto-link). A line with only free `point` vertices returns `[]`.
 */
export function lineConnections(line: CompositeLine, children: ChildLayout[]): Connection[] {
  return connectionsFor(
    line.vertices.flatMap((v) =>
      v.kind === 'anchor' ? [{ instanceId: v.instanceId, connectionId: v.connectionId }] : []
    ),
    children
  );
}

export interface CompositeLineLayout {
  line: CompositeLine;
  /**
   * Resolved world polyline. `point` vertices pass through; `anchor` vertices
   * resolve to their child's connection tip. Anchors that can't be resolved are
   * dropped; a line with fewer than two resolvable vertices is omitted entirely.
   */
  points: Point[];
}

/** An external connection tip in world coordinates — snap/convert targets for the UI. */
export interface ExternalConnectionTip {
  instanceId: string;
  connectionId: string;
  point: Point;
}

export interface CompositeLayout {
  children: ChildLayout[];
  links: CompositeLink[];
  /** Manually-drawn lines, resolved to world polylines. */
  lines: CompositeLineLayout[];
  /** Union of every child's worldBounds, every link point and every line point. */
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
        labelAngleDeg: labelFlipDeg(instance.angleDeg),
        name: resolved?.meta.name || instance.libraryId,
        nameLabel: resolveNameLabelLayout(frame, instance.labelAnchor, instance.labelDirection, instance.angleDeg)
      });
    }

    const lines = this.resolveLines(doc.allLines(), children);
    // A manual line for a shared id takes precedence: suppress its auto-link.
    const claimed = new Set<string>();
    for (const l of doc.allLines()) for (const id of l.anchoredConnectionIds()) claimed.add(id);
    const links = this.detectLinks(children, claimed);
    const bounds = this.unionBounds(children, links, lines);
    return { children, links, lines, bounds };
  }

  /**
   * World position of a child's external connection tip (the arrowhead `at`),
   * or null when the connection is absent, not external, or has no arrow. Shared
   * by auto-link detection and manual-line anchor resolution, so an anchored
   * line end lands exactly where the auto-link would.
   */
  private externalTip(child: ChildLayout, connectionId: string): Point | null {
    const { layout, instance, transform } = child;
    if (!layout || !instance.resolved) return null;
    const el = instance.resolved.getElement(connectionId);
    if (!(el instanceof Connection)) return null;
    const isExternal = el.from.kind === 'external' || el.to.kind === 'external';
    if (!isExternal) return null;
    const geo = layout.geometry.get(connectionId);
    if (geo?.kind !== 'connection' || !geo.arrow) return null;
    return transform.apply(geo.arrow.at);
  }

  /** Resolve every manual line's vertices to a world polyline (see `CompositeLineLayout`). */
  private resolveLines(lines: CompositeLine[], children: ChildLayout[]): CompositeLineLayout[] {
    const byId = new Map(children.map((c) => [c.instance.id, c]));
    const out: CompositeLineLayout[] = [];
    for (const line of lines) {
      // First pass: resolve every anchor to its world tip. This also fixes the
      // chord frame that `rel` bends live in — the segment between the line's
      // first and last resolvable anchor, rebuilt each layout so the bends
      // follow the endpoints under any move, rotation or config change.
      const anchorTips = new Map<number, Point>();
      let firstAnchor: Point | null = null;
      let lastAnchor: Point | null = null;
      line.vertices.forEach((v, i) => {
        if (v.kind !== 'anchor') return;
        const child = byId.get(v.instanceId);
        const tip = child ? this.externalTip(child, v.connectionId) : null;
        if (!tip) return;
        anchorTips.set(i, tip);
        if (!firstAnchor) firstAnchor = tip;
        lastAnchor = tip;
      });
      const frame = firstAnchor && lastAnchor ? chordFrame(firstAnchor, lastAnchor) : null;

      // Second pass: emit the world polyline in vertex order. `rel` bends without
      // a frame (fewer than two resolvable anchors) are dropped, mirroring how an
      // unresolvable anchor is dropped.
      const points: Point[] = [];
      line.vertices.forEach((v, i) => {
        if (v.kind === 'point') {
          points.push({ x: v.x, y: v.y });
        } else if (v.kind === 'rel') {
          if (frame) points.push(frame.toWorld({ t: v.t, ox: v.ox, oy: v.oy }));
        } else {
          const tip = anchorTips.get(i);
          if (tip) points.push(tip);
        }
      });
      if (points.length >= 2) out.push({ line, points });
    }
    return out;
  }

  /** Every child's external connection tips in world coordinates (UI snap/convert targets). */
  externalConnectionTips(children: ChildLayout[]): ExternalConnectionTip[] {
    const tips: ExternalConnectionTip[] = [];
    for (const child of children) {
      const { layout, instance } = child;
      if (!layout || !instance.resolved) continue;
      for (const conn of instance.resolved.connections()) {
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        const point = this.externalTip(child, conn.id);
        if (point) tips.push({ instanceId: instance.id, connectionId: conn.id, point });
      }
    }
    return tips;
  }

  /**
   * Two external connections in different children that carry the same id are
   * the same physical asset — link them. Only external endpoints participate;
   * each child contributes at most one endpoint per id (the serializer rejects
   * duplicate ids within a document), so two ends always come from distinct
   * instances. When more than two children share an id, the first two (in
   * insertion order) link, the rest are skipped (documented v1 limitation).
   */
  private detectLinks(children: ChildLayout[], suppressed: Set<string> = new Set()): CompositeLink[] {
    const index = new Map<string, { instanceId: string; tip: Point }[]>();

    for (const child of children) {
      const { layout, instance } = child;
      if (!layout || !instance.resolved) continue;
      for (const conn of instance.resolved.connections()) {
        if (suppressed.has(conn.id)) continue;
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        const tip = this.externalTip(child, conn.id);
        if (!tip) continue;
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

  private unionBounds(children: ChildLayout[], links: CompositeLink[], lines: CompositeLineLayout[]): Rect {
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
    for (const line of lines) for (const p of line.points) extend(p);

    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}
