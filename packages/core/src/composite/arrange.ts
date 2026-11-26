import type { GeoLocation } from '../types';
import type { Point, Rect } from '../layout/geometry';

/**
 * Pure placement helpers for composite children: separate overlapping frames,
 * project geographic locations onto the plane, and arrange many boxes from
 * their anchors (e.g. `meta.location`) into a compact, collision-free layout
 * that keeps who sits west / north of whom. Nothing here reads a document: the
 * caller passes plain rects and points and applies the result (e.g. as
 * `AddChildCommand`s), so the helpers stay generic and unit-testable.
 */

/** A frame to keep clear of the others, by id. */
export interface OverlapItem {
  id: string;
  rect: Rect;
}

export interface RemoveOverlapsOptions {
  /** Clearance kept between any two frames (default 0). */
  gap?: number;
  /** Ids that never move: whoever overlaps them takes the whole push. */
  fixed?: Iterable<string>;
  /**
   * Spread a crowded set out uniformly before the pairwise pushes (default
   * true): when the frames' total area exceeds their bounding box (which
   * frames that don't overlap never do), every centre is scaled by the square
   * root of that ratio — about the fixed
   * frame when there is exactly one, else the centroid; skipped with two or
   * more fixed frames. Keeps the order exactly and lets a dense pile settle in
   * a few sweeps instead of thousands.
   */
  expand?: boolean;
  /** Upper bound on separation sweeps (default 2000); typical inputs settle in a handful. */
  maxIterations?: number;
}

const EPS = 1e-6;

/**
 * Push overlapping frames apart until every pair is at least `gap` apart.
 * Each overlapping pair separates along the axis it penetrates *least*, in
 * the order it already has on that axis (the left one moves left, the right
 * one right; a tie breaks by input order), so a pair never swaps sides and
 * frames that don't overlap stay exactly where they are. Deterministic:
 * the same input gives the same output.
 *
 * Returns each id's offset (zero when it didn't move).
 */
export function removeOverlaps(items: readonly OverlapItem[], options: RemoveOverlapsOptions = {}): Map<string, Point> {
  const gap = options.gap ?? 0;
  const fixed = new Set(options.fixed ?? []);
  const maxIterations = options.maxIterations ?? 2000;
  const rects = items.map((it) => ({ ...it.rect }));
  const pinned = items.map((it) => fixed.has(it.id));
  const order = items.map((_, i) => i);
  if (options.expand ?? true) expandCrowd(rects, pinned);

  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;
    // Sweep by left edge: only frames starting before `a`'s right edge (+gap) can touch it.
    order.sort((i, j) => rects[i].x - rects[j].x || i - j);
    for (let p = 0; p < order.length; p++) {
      const i = order[p];
      for (let q = p + 1; q < order.length; q++) {
        const j = order[q];
        const a = rects[i];
        const b = rects[j];
        if (b.x >= a.x + a.width + gap - EPS) break; // later ones start further right still
        const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + gap;
        const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + gap;
        if (ox <= EPS || oy <= EPS) continue;
        if (pinned[i] && pinned[j]) continue;
        const alongX = ox <= oy;
        const push = alongX ? ox : oy;
        // Which one sits first on that axis (centres; a tie keeps input order).
        const ca = alongX ? a.x + a.width / 2 : a.y + a.height / 2;
        const cb = alongX ? b.x + b.width / 2 : b.y + b.height / 2;
        const aFirst = ca < cb || (ca === cb && i < j);
        const share = pinned[i] ? 0 : pinned[j] ? 1 : 0.5;
        const da = push * share * (aFirst ? -1 : 1);
        const db = push * (1 - share) * (aFirst ? 1 : -1);
        if (alongX) {
          a.x += da;
          b.x += db;
        } else {
          a.y += da;
          b.y += db;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  const out = new Map<string, Point>();
  items.forEach((it, i) => out.set(it.id, { x: rects[i].x - it.rect.x, y: rects[i].y - it.rect.y }));
  return out;
}

/**
 * Scale a crowd's centres apart by sqrt(total area / bounding-box area), when
 * that exceeds 1. Frames that don't overlap always fit their bounding box, so
 * a set without overlaps is never touched.
 */
function expandCrowd(rects: Rect[], pinned: boolean[]): void {
  const pins = pinned.reduce((n, p) => n + (p ? 1 : 0), 0);
  if (rects.length < 2 || pins > 1) return;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  const area = rects.reduce((s, r) => s + r.width * r.height, 0);
  const k = Math.sqrt(area / Math.max((maxX - minX) * (maxY - minY), EPS));
  if (k <= 1) return;
  const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const pivot = pins
    ? centre(rects[pinned.indexOf(true)])
    : {
        x: rects.reduce((s, r) => s + centre(r).x, 0) / rects.length,
        y: rects.reduce((s, r) => s + centre(r).y, 0) / rects.length
      };
  for (const r of rects) {
    const c = centre(r);
    r.x = pivot.x + (c.x - pivot.x) * k - r.width / 2;
    r.y = pivot.y + (c.y - pivot.y) * k - r.height / 2;
  }
}

/**
 * Project geographic locations onto the plane: an equirectangular projection
 * around the mean latitude (so east-west distances aren't stretched at high
 * latitudes), north up — `x` grows eastwards, `y` southwards, like the canvas.
 * Units are degrees of latitude; scale them with {@link arrangeByAnchors}.
 */
export function projectLocations(locations: readonly GeoLocation[]): Point[] {
  if (!locations.length) return [];
  const lat0 = (locations.reduce((s, l) => s + l.lat, 0) / locations.length) * (Math.PI / 180);
  const k = Math.cos(lat0);
  return locations.map((l) => ({ x: l.lng * k, y: -l.lat }));
}

/** One box to place: where it "belongs" (any planar units) and its frame size. */
export interface ArrangeItem {
  id: string;
  anchor: Point;
  size: { width: number; height: number };
}

export interface ArrangeOptions {
  /** Clearance between boxes, in world units (default 40). */
  gap?: number;
  /**
   * How much to even out the density, 0..1 (default 0.6). Each axis blends the
   * anchors' true (scaled) position with their rank along that axis: `0` keeps
   * the true proportions (a dense cluster stays dense, outliers stay far), `1`
   * spaces them evenly by order alone. Either way, who sits west / north of
   * whom is kept. Above 0 it also caps the arrangement's overall size, tighter
   * the higher it goes.
   */
  compaction?: number;
}

/** Items sharing one anchor (e.g. two voltage levels of one site), laid side by side. */
interface Cluster {
  anchor: Point;
  members: ArrangeItem[];
  width: number;
  height: number;
}

/**
 * Arrange boxes from their anchors into a compact layout without overlaps:
 *
 * 1. Items with the same anchor form one cluster, side by side in input order.
 * 2. Each axis is blended towards the anchors' rank order (see `compaction`):
 *    dense clusters open up and far outliers move in, so lines get shorter,
 *    while the order along each axis is kept exactly.
 * 3. The result is scaled so neighbouring boxes sit about one box apart (the
 *    median nearest-neighbour distance becomes a box diagonal plus `gap`).
 * 4. Remaining overlaps are pushed apart with {@link removeOverlaps}.
 *
 * Returns each id's top-left corner; the arrangement's bounding box starts at
 * (0, 0), so the caller translates it wherever it should land.
 */
export function arrangeByAnchors(items: readonly ArrangeItem[], options: ArrangeOptions = {}): Map<string, Point> {
  const gap = options.gap ?? 40;
  const compaction = Math.min(1, Math.max(0, options.compaction ?? 0.6));
  const out = new Map<string, Point>();
  if (!items.length) return out;

  const clusters = clusterByAnchor(items, gap);
  const cellW = Math.max(...clusters.map((c) => c.width)) + gap;
  const cellH = Math.max(...clusters.map((c) => c.height)) + gap;

  // Even out the density (order kept), then scale: median nearest-neighbour
  // distance → one box diagonal (+ gap).
  const blended = blendWithRanks(
    clusters.map((c) => c.anchor),
    compaction
  );
  const nn = medianNearestNeighbour(blended);
  const scale = Math.min(
    nn > 0 ? Math.hypot(cellW, cellH) / nn : 1,
    // …but, compacting, never sprawl over more than AREA_FACTOR / compaction ×
    // the boxes' own area (no cap at 0: true distances stay true).
    compaction > 0 ? areaScale(blended, (clusters.length * cellW * cellH * AREA_FACTOR) / compaction) : Infinity
  );
  const centres = blended.map((p) => ({ x: p.x * scale, y: p.y * scale }));

  // Separate what still overlaps.
  const rects = clusters.map((c, i) => ({
    id: String(i),
    rect: { x: centres[i].x - c.width / 2, y: centres[i].y - c.height / 2, width: c.width, height: c.height }
  }));
  const offsets = removeOverlaps(rects, { gap });
  const placed = rects.map(({ id, rect }) => {
    const d = offsets.get(id) ?? { x: 0, y: 0 };
    return { ...rect, x: rect.x + d.x, y: rect.y + d.y };
  });

  // Bounding box at (0, 0); spread each cluster's members along its row.
  const minX = Math.min(...placed.map((r) => r.x));
  const minY = Math.min(...placed.map((r) => r.y));
  clusters.forEach((c, i) => {
    let x = placed[i].x - minX;
    const top = placed[i].y - minY;
    for (const m of c.members) {
      out.set(m.id, { x, y: top + (c.height - m.size.height) / 2 });
      x += m.size.width + gap;
    }
  });
  return out;
}

/**
 * Fully compacted, the arrangement covers at most this many times the boxes'
 * own area (cells, gaps included): room for the lines between them, without
 * letting a sparse region sprawl. Tighter than that, the overlap removal opens
 * dense spots up. Less compaction allows proportionally more room.
 */
const AREA_FACTOR = 4;

/** The scale that gives the points' bounding box `area` (Infinity when it's degenerate). */
function areaScale(points: readonly Point[], area: number): number {
  const w = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const h = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
  // A line of points (no height or width) scales by its length instead.
  const extent = w > 0 && h > 0 ? Math.sqrt(w * h) : Math.max(w, h);
  return extent > 0 ? Math.sqrt(area) / extent : Infinity;
}

function clusterByAnchor(items: readonly ArrangeItem[], gap: number): Cluster[] {
  const byKey = new Map<string, Cluster>();
  for (const it of items) {
    const key = `${it.anchor.x}|${it.anchor.y}`;
    let c = byKey.get(key);
    if (!c) {
      c = { anchor: it.anchor, members: [], width: -gap, height: 0 };
      byKey.set(key, c);
    }
    c.members.push(it);
    c.width += it.size.width + gap;
    c.height = Math.max(c.height, it.size.height);
  }
  return [...byKey.values()];
}

function medianNearestNeighbour(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  const nearest = points.map((p, i) => {
    let best = Infinity;
    points.forEach((q, j) => {
      if (i !== j) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    });
    return best;
  });
  nearest.sort((a, b) => a - b);
  const mid = nearest.length >> 1;
  return nearest.length % 2 ? nearest[mid] : (nearest[mid - 1] + nearest[mid]) / 2;
}

/**
 * Normalise the points (keeping their aspect) and blend each axis with its
 * rank: `t` = 0 returns the true shape, 1 spaces the distinct values along
 * each axis evenly over the same extent. Both maps keep the order along each
 * axis (equal values share a rank), so their blend does too.
 */
function blendWithRanks(points: readonly Point[], t: number): Point[] {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const extentX = Math.max(...points.map((p) => p.x)) - minX;
  const extentY = Math.max(...points.map((p) => p.y)) - minY;
  const unit = Math.max(extentX, extentY) || 1;
  const rankOf = (axis: 'x' | 'y', extent: number) => {
    const distinct = [...new Set(points.map((p) => p[axis]))].sort((a, b) => a - b);
    const index = new Map(distinct.map((v, i) => [v, i]));
    const steps = Math.max(1, distinct.length - 1);
    return (v: number) => ((index.get(v) ?? 0) / steps) * (extent / unit);
  };
  const rankX = rankOf('x', extentX);
  const rankY = rankOf('y', extentY);
  return points.map((p) => ({
    x: (1 - t) * ((p.x - minX) / unit) + t * rankX(p.x),
    y: (1 - t) * ((p.y - minY) / unit) + t * rankY(p.y)
  }));
}
