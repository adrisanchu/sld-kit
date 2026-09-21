import type { Point } from '../layout/geometry';
import { ALIGN_TOLERANCE, STUB_LENGTH } from './layout-constants';
import { Port } from './ports';
import { simplify } from './polyline';

/**
 * Phase-1 orthogonal connector router (floating connectors, ≤3 bends, no
 * obstacle avoidance). Each end leaves its port perpendicular to its edge by a
 * fixed stub, then the two stub ends are joined with a Manhattan L or Z chosen
 * from their exit axes. Aligned facing ports collapse to a straight line; offset
 * ones get a single mid-line jog. Covers every case in the box fixture and the
 * reference; richer routing (multi-bend, avoidance, curves) layers on later.
 */
export class OrthogonalRouter {
  constructor(private readonly stub = STUB_LENGTH) {}

  /** Route between two floating ports, entering/leaving along each port's side. */
  route(a: Port, b: Port): Point[] {
    const bAligned = this.snapAligned(a, b);
    const a1 = a.stub(this.stub);
    const b1 = bAligned.stub(this.stub);
    return simplify([a.point, a1, ...this.join(a1, a.axis, b1, bAligned.axis), b1, bAligned.point]);
  }

  /**
   * Nudge `b` onto `a`'s trunk line when the two share an axis and are within
   * {@link ALIGN_TOLERANCE}, so a near-aligned pair draws as one straight run
   * instead of a tiny mid-line jog. The shift is sub-tolerance, so `b` stays on
   * its box perimeter.
   */
  private snapAligned(a: Port, b: Port): Port {
    if (a.axis !== b.axis) return b;
    if (a.axis === 'v' && Math.abs(a.point.x - b.point.x) <= ALIGN_TOLERANCE) return new Port({ x: a.point.x, y: b.point.y }, b.side);
    if (a.axis === 'h' && Math.abs(a.point.y - b.point.y) <= ALIGN_TOLERANCE) return new Port({ x: b.point.x, y: a.point.y }, b.side);
    return b;
  }

  /** A dangling lead: a straight stub off a single port (a node-relative free end). */
  lead(port: Port, length: number): Point[] {
    return [port.point, port.stub(length)];
  }

  /**
   * Route from a floating port to a fixed free point: leave along the port's
   * side, then turn once to reach the point on the remaining axis.
   */
  toPoint(port: Port, target: Point): Point[] {
    const p1 = port.stub(this.stub);
    const corner = port.axis === 'h' ? { x: target.x, y: p1.y } : { x: p1.x, y: target.y };
    return simplify([port.point, p1, corner, target]);
  }

  /** Join two stub ends with a Manhattan path honouring each exit axis. */
  private join(a1: Point, aAxis: 'h' | 'v', b1: Point, bAxis: 'h' | 'v'): Point[] {
    if (aAxis === 'h' && bAxis === 'h') {
      const midX = (a1.x + b1.x) / 2;
      return [{ x: midX, y: a1.y }, { x: midX, y: b1.y }];
    }
    if (aAxis === 'v' && bAxis === 'v') {
      const midY = (a1.y + b1.y) / 2;
      return [{ x: a1.x, y: midY }, { x: b1.x, y: midY }];
    }
    // Perpendicular exits meet at the corner that leaves `a` on its axis.
    return aAxis === 'h' ? [{ x: b1.x, y: a1.y }] : [{ x: a1.x, y: b1.y }];
  }
}
