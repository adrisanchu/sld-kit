import type { Point } from '../layout/geometry';

/** Angle of the directed segment `a → b`, in degrees (0 = +x, 90 = down). */
export function segmentAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

const EPS = 1e-6;
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

/**
 * Drop duplicate and redundant collinear points from a routed polyline, so a
 * clean straight run collapses to its two endpoints and a Z keeps only its
 * corners. Keeps the first and last point exactly (the resolved attach points).
 */
export function simplify(points: Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of points) if (dedup.length === 0 || !same(dedup[dedup.length - 1], p)) dedup.push(p);
  if (dedup.length <= 2) return dedup;

  const out: Point[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1];
    const b = dedup[i];
    const c = dedup[i + 1];
    const collinearX = Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS;
    const collinearY = Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS;
    if (!collinearX && !collinearY) out.push(b);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
}

/** Point at the polyline's arc-length midpoint, with the angle of the segment it lies on. */
export function arcMidpoint(points: Point[]): { at: Point; angleDeg: number } | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  let target = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < EPS) continue;
    if (target <= len) {
      const t = target / len;
      return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angleDeg: segmentAngleDeg(a, b) };
    }
    target -= len;
  }
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return { at: b, angleDeg: segmentAngleDeg(a, b) };
}

/**
 * Point at fraction `t` (0–1, clamped) of the polyline's arc length, plus the
 * unit direction `(dx, dy)` of the segment it lies on (zero-length segments are
 * skipped). `null` for fewer than two points or a zero-length polyline.
 */
export function pointAtFraction(points: Point[], t: number): { at: Point; dx: number; dy: number } | null {
  if (points.length < 2) return null;
  const segs: { a: Point; b: Point; len: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len >= EPS) segs.push({ a, b, len });
  }
  if (segs.length === 0) return null;
  const total = segs.reduce((sum, s) => sum + s.len, 0);
  let target = Math.max(0, Math.min(1, t)) * total;
  let seg = segs[segs.length - 1];
  for (const s of segs) {
    if (target <= s.len) {
      seg = s;
      break;
    }
    target -= s.len;
  }
  const f = Math.max(0, Math.min(1, target / seg.len));
  const { a, b, len } = seg;
  return {
    at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
    dx: (b.x - a.x) / len,
    dy: (b.y - a.y) / len
  };
}

/**
 * How close to vertical (degrees) a run must be to read bottom→top. Hand-drawn
 * "vertical" lines are rarely exact; without this band a run leaning 0.1° past
 * vertical would flip its text to read top→bottom.
 */
export const VERTICAL_READING_TOLERANCE = 10;

/**
 * Normalize a text rotation (degrees, y down) so the text never reads
 * upside-down: it reads left→right, and a run within
 * {@link VERTICAL_READING_TOLERANCE} of vertical reads bottom→top. The result
 * lies in `[-90 - tol, 90 - tol)`.
 */
export function readableAngle(deg: number): number {
  let a = ((((deg + 180) % 360) + 360) % 360) - 180; // → [-180, 180)
  if (a >= 90 - 1e-9) a -= 180;
  else if (a < -90 - 1e-9) a += 180;
  // → [-90, 90); then near-vertical down-ish runs read upward instead.
  if (a >= 90 - VERTICAL_READING_TOLERANCE - 1e-9) a -= 180;
  return a;
}
