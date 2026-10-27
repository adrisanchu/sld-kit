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
 * a rectangle with the same rotation. Framework-agnostic (shared shape with the
 * Svelte adapter's copy).
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
