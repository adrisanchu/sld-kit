/** Tiny geometry helpers shared by the layout engine, views and exporter. */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/**
 * SVG path for a filled triangular arrowhead with its tip at `at`,
 * pointing along `angleDeg` (0 = right, -90 = up, 90 = down).
 * Used by both the live view and the exporter — exported SVGs draw
 * arrowheads as explicit paths because `<marker>` support in Office
 * importers is unreliable.
 */
export function arrowheadPath(at: Point, angleDeg: number, size: number): string {
  const a = (angleDeg * Math.PI) / 180;
  const backX = at.x - Math.cos(a) * size;
  const backY = at.y - Math.sin(a) * size;
  // Perpendicular half-width of the base
  const half = size * 0.55;
  const px = -Math.sin(a) * half;
  const py = Math.cos(a) * half;
  const p1 = { x: backX + px, y: backY + py };
  const p2 = { x: backX - px, y: backY - py };
  const f = (n: number) => Math.round(n * 100) / 100;
  return `M ${f(at.x)} ${f(at.y)} L ${f(p1.x)} ${f(p1.y)} L ${f(p2.x)} ${f(p2.y)} Z`;
}
