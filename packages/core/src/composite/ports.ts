import type { Point } from '../layout/geometry';

/**
 * The edge of a box a feeder leaves from. Stable across the box/detail views: it
 * is derived once from the feeder's exit direction and only picks *which* frame
 * the attach point is resolved against, never the point itself.
 */
export type BoxSide = 'up' | 'down' | 'left' | 'right';

/** Outward unit vector per side, in screen axes (y points down). */
export const SIDE_VECTORS: Record<BoxSide, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

/** Whether a side runs along the horizontal (`left`/`right`) or vertical axis. */
export function sideAxis(side: BoxSide): 'h' | 'v' {
  return side === 'left' || side === 'right' ? 'h' : 'v';
}

/**
 * Quantise an outward angle (degrees, 0 = +x, 90 = +y i.e. down) to the nearest
 * box side. Feeds off the layout's arrow angle, so it reflects the direction the
 * feeder actually leaves the child — even when the feeder didn't state one.
 */
export function sideFromAngle(angleDeg: number): BoxSide {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a < 45 || a >= 315) return 'right';
  if (a < 135) return 'down';
  if (a < 225) return 'left';
  return 'up';
}

/**
 * A floating connector: the world point a line attaches to, plus the side it
 * leaves along. The point is resolved *per view* (box perimeter vs SLD arrow
 * tip) — a `Port` is the already-resolved result the router consumes, never a
 * stored coordinate.
 */
export class Port {
  constructor(
    readonly point: Point,
    readonly side: BoxSide
  ) {}

  /** Outward unit vector along the port's side. */
  get outward(): Point {
    return SIDE_VECTORS[this.side];
  }

  /** Whether the port leaves along the horizontal or vertical axis. */
  get axis(): 'h' | 'v' {
    return sideAxis(this.side);
  }

  /** A point `length` px outward from the attach point — the perpendicular exit stub. */
  stub(length: number): Point {
    const o = this.outward;
    return { x: this.point.x + o.x * length, y: this.point.y + o.y * length };
  }
}
