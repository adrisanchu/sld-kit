import type { Point } from '@sld-kit/core';
import { SIDE_VECTORS, sideAxis, type BoxSide } from './side';

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
