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
 */
export function connectionPath(points: Point[], hops: Point[] | undefined, hopRadius: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${f(points[0].x)} ${f(points[0].y)}`;

  const r = hopRadius;
  const eps = 0.5;
  const parts: string[] = [`M ${f(points[0].x)} ${f(points[0].y)}`];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const isHorizontal = Math.abs(curr.y - prev.y) < eps;

    if (isHorizontal && hops && hops.length > 0) {
      const hy = prev.y;
      const minX = Math.min(prev.x, curr.x);
      const maxX = Math.max(prev.x, curr.x);
      const goingRight = curr.x > prev.x;

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

    parts.push(`L ${f(curr.x)} ${f(curr.y)}`);
  }

  return parts.join(' ');
}
