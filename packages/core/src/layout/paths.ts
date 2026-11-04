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
 * line), clamped to half of each adjacent segment. A **jog** — a sideways step
 * shorter than two radii between two runs heading the same way — can't fit two
 * full arcs, so it is drawn as one smooth S-curve (a cubic Bézier, a "lane
 * change") instead of two tight arcs that would read as a bump. Hops keep clear
 * of a rounded corner by its trimmed length. `0` (the default) emits exactly the
 * sharp-cornered path.
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
  const { corners, jogStart } = roundCorners(points, cornerRadius);
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
    if (jogStart[i]) {
      // Smooth jog: stop `cr` short of the first corner, then one S-curve onto
      // the run after the second corner. The corners are the control points.
      const jog = points[i + 1];
      const d = unit(prev, curr);
      if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > corners[i - 1] + cr + 1e-6) {
        parts.push(`L ${f(curr.x - d.x * cr)} ${f(curr.y - d.y * cr)}`);
      }
      parts.push(`C ${f(curr.x)} ${f(curr.y)} ${f(jog.x)} ${f(jog.y)} ${f(jog.x + d.x * cr)} ${f(jog.y + d.y * cr)}`);
      i++; // the jog segment itself is drawn by the curve
    } else if (cr > 0) {
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
 * Per-vertex rounding: `corners[i]` is how far the path is trimmed on each side
 * of vertex `i` (`0` at the endpoints and straight vertices, else `radius`
 * clamped to half of each adjacent segment). `jogStart[i]` marks a vertex that
 * opens a smooth jog with vertex `i + 1`; both then trim by the same amount.
 */
function roundCorners(points: Point[], radius: number): { corners: number[]; jogStart: boolean[] } {
  const n = points.length;
  const corners = new Array<number>(n).fill(0);
  const jogStart = new Array<boolean>(n).fill(false);
  if (radius <= 0) return { corners, jogStart };
  const len = (i: number) => Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  for (let i = 1; i < n - 1; i++) {
    const din = unit(points[i - 1], points[i]);
    const dout = unit(points[i], points[i + 1]);
    if (Math.abs(din.x * dout.y - din.y * dout.x) < 1e-6) continue; // straight or reversing
    // A short sideways step back onto the original heading: one S-curve.
    if (i + 2 < n && len(i) < 2 * radius) {
      const dnext = unit(points[i + 1], points[i + 2]);
      if (Math.abs(dnext.x - din.x) < 1e-6 && Math.abs(dnext.y - din.y) < 1e-6) {
        const s = Math.min(radius, len(i - 1) / 2, len(i + 1) / 2);
        corners[i] = s;
        corners[i + 1] = s;
        jogStart[i] = true;
        i++;
        continue;
      }
    }
    corners[i] = Math.min(radius, len(i - 1) / 2, len(i) / 2);
  }
  return { corners, jogStart };
}
