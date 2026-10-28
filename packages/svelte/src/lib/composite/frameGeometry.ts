import type { Point } from '@sld-kit/core';

/** Geometry of a selection / hover frame, in world coordinates. */
export interface FrameGeometry {
  /** The frame's four corners [TL, TR, BR, BL], pushed out by the padding. */
  corners: Point[];
  /** `corners` as an SVG `points` list. */
  points: string;
  /** Midpoint of the (rotated) top edge — the rotation handle's stem start. */
  topMid: Point;
  /** Rotation handle centre, `handleOffset` along the rotated "up" direction. */
  handle: Point;
}

function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/**
 * Frame a rotated rectangle given by its corners (e.g. `ChildLayout.worldCorners`):
 * each corner moves `padding` outward along both of its edges, so the frame stays
 * a rectangle with the same rotation. Framework-agnostic (same file as the React
 * adapter's copy).
 */
export function frameGeometry(src: readonly Point[], padding: number, handleOffset: number): FrameGeometry {
  const n = src.length;
  const corners = src.map((p, i) => {
    if (!padding) return p;
    const a = unit({ x: p.x - src[(i + 1) % n].x, y: p.y - src[(i + 1) % n].y });
    const b = unit({ x: p.x - src[(i + n - 1) % n].x, y: p.y - src[(i + n - 1) % n].y });
    return { x: p.x + (a.x + b.x) * padding, y: p.y + (a.y + b.y) * padding };
  });
  const center = {
    x: corners.reduce((s, p) => s + p.x, 0) / n,
    y: corners.reduce((s, p) => s + p.y, 0) / n
  };
  const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
  const up = unit({ x: topMid.x - center.x, y: topMid.y - center.y });
  return {
    corners,
    points: corners.map((p) => `${p.x},${p.y}`).join(' '),
    topMid,
    handle: { x: topMid.x + up.x * handleOffset, y: topMid.y + up.y * handleOffset }
  };
}

/**
 * The child under the pointer, as tracked by `CompositeCanvas` (or supplied by
 * the app to drive hover from elsewhere, e.g. a list). `section` is the box key
 * when a box-view child is split into section boxes.
 */
export interface ChildHover {
  id: string;
  section?: string;
}

/** One frame to draw: the selected child's, or a hovered (unselected) child's. */
export interface FrameSpec {
  id: string;
  state: 'selected' | 'hover';
  /** The pointer is over this frame's child (only reported when hover frames are on). */
  hovered: boolean;
  section?: string;
}

/**
 * Which frames to draw for a selection + hover. Hover never stacks a second
 * frame on the selected child: it marks the selected frame `hovered` instead.
 */
export function frameSpecs(selectedId: string | null, hover: ChildHover | null, hoverFrame: boolean): FrameSpec[] {
  const out: FrameSpec[] = [];
  const onSelected = hoverFrame && !!hover && hover.id === selectedId;
  if (selectedId) {
    out.push({
      id: selectedId,
      state: 'selected',
      hovered: onSelected,
      section: onSelected ? hover?.section : undefined
    });
  }
  if (hoverFrame && hover && hover.id !== selectedId) {
    out.push({ id: hover.id, state: 'hover', hovered: true, section: hover.section });
  }
  return out;
}

/** Stable identity of a hover, for change detection. */
export function hoverKey(h: ChildHover | null): string {
  return h ? `${h.id}\u0000${h.section ?? ''}` : '';
}

/** Corner treatment of a frame: dots (default), L-shaped brackets, or nothing. */
export type FrameCorners = 'dots' | 'brackets' | 'none';

/**
 * One L-shaped bracket per corner, as SVG path data: each arm runs `arm` along
 * the corner's two (rotated) edges, clamped to a third of the edge so short
 * frames keep a visible gap between brackets.
 */
export function bracketPaths(corners: readonly Point[], arm: number): string[] {
  const n = corners.length;
  return corners.map((p, i) => {
    const toward = (q: Point) => {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const a = Math.min(arm, len / 3);
      return { x: p.x + (dx / len) * a, y: p.y + (dy / len) * a };
    };
    const a = toward(corners[(i + n - 1) % n]);
    const b = toward(corners[(i + 1) % n]);
    return `M${a.x},${a.y} L${p.x},${p.y} L${b.x},${b.y}`;
  });
}

/**
 * Path data for a closed rectangle-like polygon with rounded corners: each
 * corner is cut back by `r` along both of its edges (clamped to half the
 * shorter edge) and joined with a circular arc — the same shape as a `<rect rx>`,
 * at any rotation. Expects clockwise corners (screen coordinates), as
 * `worldCorners` are.
 */
export function roundedPath(corners: readonly Point[], r: number): string {
  const n = corners.length;
  const parts: string[] = [];
  corners.forEach((p, i) => {
    const prev = corners[(i + n - 1) % n];
    const next = corners[(i + 1) % n];
    const lp = Math.hypot(prev.x - p.x, prev.y - p.y) || 1;
    const ln = Math.hypot(next.x - p.x, next.y - p.y) || 1;
    const k = Math.min(r, lp / 2, ln / 2);
    const a = { x: p.x + ((prev.x - p.x) / lp) * k, y: p.y + ((prev.y - p.y) / lp) * k };
    const b = { x: p.x + ((next.x - p.x) / ln) * k, y: p.y + ((next.y - p.y) / ln) * k };
    parts.push(`${i === 0 ? 'M' : 'L'}${a.x},${a.y} A${k},${k} 0 0 1 ${b.x},${b.y}`);
  });
  return `${parts.join(' ')} Z`;
}
