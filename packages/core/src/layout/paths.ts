import type { Point } from './geometry';

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * Builds an SVG path string for a connection's orthogonal polyline, inserting
 * a semicircular hop arc on every horizontal segment where `hops` are present.
 *
 * The arc always bulges UPWARD (toward lower y) regardless of the segment's
 * travel direction, matching standard schematic convention.
 *
 * When `hops` is empty or undefined the path is geometrically equivalent to
 * the plain polyline — consumers can switch unconditionally without a branch.
 *
 * Sweep flag derivation:
 *  - Going right (x increases): sweep=0 (CCW in SVG) → upward bulge ✓
 *  - Going left  (x decreases): sweep=1 (CW  in SVG) → upward bulge ✓
 *
 * `cornerRadius > 0` rounds every bend with a circular arc (a `curved` composite
 * line), clamped to half of each adjacent segment so short jogs stay tangent.
 * Hops keep clear of a rounded corner by its trimmed radius. `0` (the default)
 * emits exactly the sharp-cornered path.
 */
export function connectionPath(
  points: Point[],
  hops: Point[] | undefined,
  hopRadius: number,
  cornerRadius = 0
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${f(points[0].x)} ${f(points[0].y)}`;

  const r = hopRadius;
  const eps = 0.5;
  const corners = cornerRadii(points, cornerRadius);
  const parts: string[] = [`M ${f(points[0].x)} ${f(points[0].y)}`];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const isHorizontal = Math.abs(curr.y - prev.y) < eps;

    if (isHorizontal && hops && hops.length > 0) {
      const hy = prev.y;
      const goingRight = curr.x > prev.x;
      // The straight run between the two (possibly rounded) corners.
      const startX = prev.x + (goingRight ? corners[i - 1] : -corners[i - 1]);
      const endX = curr.x - (goingRight ? corners[i] : -corners[i]);
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);

      // Keep hops strictly inside the segment and clear of the endpoints by r.
      const segHops = hops
        .filter((h) => Math.abs(h.y - hy) < eps && h.x > minX + r && h.x < maxX - r)
        .sort((a, b) => (goingRight ? a.x - b.x : b.x - a.x));

      for (const hop of segHops) {
        const hx = hop.x;
        const beforeX = goingRight ? hx - r : hx + r;
        const afterX = goingRight ? hx + r : hx - r;
        const sweep = goingRight ? 0 : 1;
        parts.push(`L ${f(beforeX)} ${f(hy)}`);
        parts.push(`A ${r} ${r} 0 0 ${sweep} ${f(afterX)} ${f(hy)}`);
      }
    }

    const cr = corners[i];
    if (cr > 0) {
      // Rounded bend: stop `cr` short of the corner, arc onto the next segment.
      const next = points[i + 1];
      const din = unit(prev, curr);
      const dout = unit(curr, next);
      const sweep = din.x * dout.y - din.y * dout.x > 0 ? 1 : 0;
      // Skip the run when the previous arc already ends here (a jog clamped to half).
      if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > corners[i - 1] + cr + 1e-6) {
        parts.push(`L ${f(curr.x - din.x * cr)} ${f(curr.y - din.y * cr)}`);
      }
      parts.push(`A ${f(cr)} ${f(cr)} 0 0 ${sweep} ${f(curr.x + dout.x * cr)} ${f(curr.y + dout.y * cr)}`);
    } else {
      parts.push(`L ${f(curr.x)} ${f(curr.y)}`);
    }
  }

  return parts.join(' ');
}

/** Unit vector `a → b` (zero for a degenerate segment). */
function unit(a: Point, b: Point): Point {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len < 1e-9 ? { x: 0, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

/**
 * Per-vertex corner radius: `0` at the endpoints and at straight (collinear)
 * vertices, else `radius` clamped to half of each adjacent segment.
 */
function cornerRadii(points: Point[], radius: number): number[] {
  const out = new Array<number>(points.length).fill(0);
  if (radius <= 0) return out;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const din = unit(a, b);
    const dout = unit(b, c);
    if (Math.abs(din.x * dout.y - din.y * dout.x) < 1e-6) continue; // straight or reversing
    const lenIn = Math.hypot(b.x - a.x, b.y - a.y);
    const lenOut = Math.hypot(c.x - b.x, c.y - b.y);
    out[i] = Math.min(radius, lenIn / 2, lenOut / 2);
  }
  return out;
}
