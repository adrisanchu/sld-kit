import type { Point } from '../layout/geometry';

/**
 * How a composite line's stored vertices are drawn between its endpoints. A
 * presentation choice layered over the logical path (the vertices are unchanged):
 *
 *  - `straight` — segments drawn as-is (the default; free-form polyline).
 *  - `orthogonal` — every segment rewritten to axis-aligned runs with an elbow
 *    (the box-diagram rule; see {@link orthogonalizePolyline}).
 *  - `curved` — reserved for a future obstacle-avoiding spline; **currently
 *    rendered straight** (no behaviour yet).
 *
 * Open string like the other axes, but these three seed the model.
 */
export type LineRouting = 'straight' | 'orthogonal' | 'curved' | (string & {});

export const DEFAULT_LINE_ROUTING: LineRouting = 'straight';

/**
 * Rewrite a polyline into axis-aligned (Manhattan) segments by inserting an
 * elbow wherever two consecutive points are neither horizontally nor vertically
 * aligned. The elbow goes along the **dominant axis first** — the longer run
 * follows the bigger delta and the short jog is perpendicular — so a line leaves
 * each endpoint along its dominant direction (matching box-edge feeder exits).
 * Original points, including anchored endpoints, are preserved exactly, so the
 * line stays attached to whatever it connects.
 */
export function orthogonalizePolyline(points: Point[]): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) {
      const elbow = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
        ? { x: b.x, y: a.y } // horizontal run first
        : { x: a.x, y: b.y }; // vertical run first
      out.push(elbow);
    }
    // Skip an elbow that coincided with `b`.
    if (out[out.length - 1].x !== b.x || out[out.length - 1].y !== b.y) out.push(b);
  }
  return out;
}

/** Apply a routing style to a resolved world polyline. `curved` is a straight passthrough for now. */
export function routePolyline(points: Point[], routing: LineRouting): Point[] {
  return routing === 'orthogonal' ? orthogonalizePolyline(points) : points;
}
