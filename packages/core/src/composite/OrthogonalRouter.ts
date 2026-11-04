import type { Point, Rect } from '../layout/geometry';
import { inflate, insideRect, orthogonalPath, polylineHitsAny, type Heading } from './avoid';
import { ALIGN_TOLERANCE, OBSTACLE_CLEARANCE, STUB_LENGTH } from './layout-constants';
import { Port, type BoxSide } from './ports';
import { simplify } from './polyline';

/** Obstacle-avoidance knobs for {@link OrthogonalRouter}. */
export interface OrthogonalRouterOptions {
  /** Route around obstacle rects passed to `route`/`toPoint` (default `true`). */
  avoidObstacles?: boolean;
  /** Gap kept between a routed line and every obstacle (default {@link OBSTACLE_CLEARANCE}). */
  clearance?: number;
}

const SIDE_HEADING: Record<BoxSide, Heading> = { right: 0, down: 1, left: 2, up: 3 };

/**
 * Orthogonal connector router for floating connectors. Each end leaves its port perpendicular to its edge by a
 * fixed stub, then the two stub ends are joined with a Manhattan L or Z chosen
 * from their exit axes. Aligned facing ports collapse to a straight line; offset
 * ones get a single mid-line jog.
 *
 * Obstacle avoidance: given obstacle rects (the composite's child boxes), a
 * route whose L/Z would cut through one is re-routed around them by a
 * minimal-bend orthogonal search (see `avoid.ts`). When nothing is in the way
 * the L/Z is returned unchanged — the fast path — so avoidance never perturbs
 * an already-clean route. Deterministic: same input, same path.
 */
export class OrthogonalRouter {
  constructor(
    private readonly stub = STUB_LENGTH,
    /** Near-alignment snap distance; `0` disables the snap (exact geometry only). */
    private readonly alignTolerance = ALIGN_TOLERANCE,
    private readonly options: OrthogonalRouterOptions = {}
  ) {}

  /**
   * Route between two floating ports, entering/leaving along each port's side.
   * `obstacles` (world rects, un-inflated) are routed around when in the way.
   */
  route(a: Port, b: Port, obstacles: Rect[] = []): Point[] {
    const bAligned = this.snapAligned(a, b);
    const a1 = a.stub(this.stub);
    const b1 = bAligned.stub(this.stub);
    const mid = [a1, ...this.join(a1, a.axis, b1, bAligned.axis), b1];
    const avoided = this.avoid(mid, SIDE_HEADING[a.side], b1, oppositeHeading(SIDE_HEADING[bAligned.side]), obstacles, [
      a1,
      b1
    ]);
    return simplify([a.point, ...(avoided ?? mid), bAligned.point]);
  }

  /**
   * The obstacle-avoiding detour for a stub-to-stub run, or `null` to keep `mid`
   * (avoidance off, nothing in the way, or no path exists). Obstacles are
   * inflated by the clearance; any that contains one of `ends` (an exit stub
   * still inside its own child, e.g. a detail-view arrow tip) is dropped so the
   * line can always leave its own diagram.
   */
  private avoid(
    mid: Point[],
    startHeading: Heading,
    end: Point,
    endHeading: Heading | null,
    obstacles: Rect[],
    ends: Point[]
  ): Point[] | null {
    if (this.options.avoidObstacles === false || obstacles.length === 0) return null;
    const clearance = this.options.clearance ?? OBSTACLE_CLEARANCE;
    const rects = obstacles.map((r) => inflate(r, clearance)).filter((r) => !ends.some((p) => insideRect(p, r)));
    if (!polylineHitsAny(mid, rects)) return null; // fast path: the L/Z is already clear
    const start = mid[0];
    const corners = orthogonalPath(start, startHeading, end, endHeading, rects);
    return corners ? [start, ...corners, end] : null;
  }

  /**
   * Nudge `b` onto `a`'s trunk line when the two share an axis and are within
   * the align tolerance (default {@link ALIGN_TOLERANCE}), so a near-aligned pair draws as one straight run
   * instead of a tiny mid-line jog. The shift is sub-tolerance, so `b` stays on
   * its box perimeter.
   */
  private snapAligned(a: Port, b: Port): Port {
    if (a.axis !== b.axis) return b;
    if (a.axis === 'v' && Math.abs(a.point.x - b.point.x) <= this.alignTolerance) return new Port({ x: a.point.x, y: b.point.y }, b.side);
    if (a.axis === 'h' && Math.abs(a.point.y - b.point.y) <= this.alignTolerance) return new Port({ x: b.point.x, y: a.point.y }, b.side);
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
  toPoint(port: Port, target: Point, obstacles: Rect[] = []): Point[] {
    const p1 = port.stub(this.stub);
    const corner = port.axis === 'h' ? { x: target.x, y: p1.y } : { x: p1.x, y: target.y };
    const mid = [p1, corner, target];
    const avoided = this.avoid(mid, SIDE_HEADING[port.side], target, null, obstacles, [p1, target]);
    return simplify([port.point, ...(avoided ?? mid)]);
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

const oppositeHeading = (h: Heading): Heading => ((h + 2) % 4) as Heading;
