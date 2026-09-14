import type { Point } from '@sld-kit/core';

/**
 * Rewrite a polyline into axis-aligned (Manhattan) segments by inserting an
 * elbow wherever two consecutive points are neither horizontally nor vertically
 * aligned. Box diagrams only ever use straight vertical/horizontal runs; this is
 * the constraint the box editor applies both to the live draft and on commit.
 *
 * The elbow goes **horizontal first, then vertical** (`{ b.x, a.y }`). Original
 * points — including anchored endpoints — are preserved exactly, so the line
 * stays attached to the boxes it connects.
 */
export function orthogonalizePolyline(points: Point[]): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) out.push({ x: b.x, y: a.y });
    // Skip exact duplicates (e.g. an elbow that coincides with `b`).
    if (out[out.length - 1].x !== b.x || out[out.length - 1].y !== b.y) out.push(b);
  }
  return out;
}
