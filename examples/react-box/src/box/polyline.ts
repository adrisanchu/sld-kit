import type { Point } from '@sld-kit/core';

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
