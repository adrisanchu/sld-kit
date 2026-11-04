import type { Point, Rect } from '../layout/geometry';
import { inflate, insideRect, orthogonalPath, polylineHitsAny, straightenJogs, type Heading } from './avoid';
import { ALIGN_TOLERANCE, MIN_JOG, OBSTACLE_CLEARANCE, STUB_LENGTH } from './layout-constants';
import { Port, type BoxSide } from './ports';
import { simplify } from './polyline';

/** Obstacle-avoidance knobs for {@link OrthogonalRouter}. */
export interface OrthogonalRouterOptions {
  /** Route around obstacle rects passed to `route`/`toPoint` (default `true`). */
  avoidObstacles?: boolean;
  /** Gap kept between a routed line and every obstacle (default {@link OBSTACLE_CLEARANCE}). */
  clearance?: number;
  /** Jogs shorter than this are straightened away when possible (default {@link MIN_JOG}; `0` disables). */
  minJog?: number;
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
    const [la, lb] = this.capFacing(a, bAligned, this.stubFor(a, obstacles), this.stubFor(bAligned, obstacles));
    const a1 = a.stub(la);
    const b1 = bAligned.stub(lb);
    const mid = [a1, ...this.join(a1, a.axis, b1, bAligned.axis), b1];
    const ends = [a1, b1];
    const avoided = this.avoid(mid, SIDE_HEADING[a.side], b1, oppositeHeading(SIDE_HEADING[bAligned.side]), obstacles, ends);
    return this.straighten(simplify([a.point, ...(avoided ?? mid), bAligned.point]), obstacles, ends);
  }

  /**
   * Facing ports closer than their two stubs would overshoot each other and the
   * route would double back on itself. Cap both stubs at half the gap, so the
   * join lands between them as a clean Z (or a straight run).
   */
  private capFacing(a: Port, b: Port, la: number, lb: number): [number, number] {
    const oa = a.outward;
    const ob = b.outward;
    if (oa.x !== -ob.x || oa.y !== -ob.y) return [la, lb]; // not facing each other
    const gap = (b.point.x - a.point.x) * oa.x + (b.point.y - a.point.y) * oa.y;
    if (gap <= 0 || la + lb <= gap) return [la, lb];
    return [Math.min(la, gap / 2), Math.min(lb, gap / 2)];
  }

  /**
   * Remove small jogs left by the search (a run hugging a clearance edge a few
   * px off the port's line) — see `straightenJogs`. Only while avoiding, so a
   * route with no obstacles stays exactly the phase-1 L/Z.
   */
  private straighten(points: Point[], obstacles: Rect[], ends: Point[]): Point[] {
    const minJog = this.options.minJog ?? MIN_JOG;
    if (!this.avoiding(obstacles) || minJog <= 0) return points;
    return straightenJogs(points, this.activeObstacles(obstacles, ends).raw, minJog);
  }

  /**
   * The obstacles a route must respect, raw and inflated by the clearance. A rect
   * whose inflated form still contains one of `ends` (diagrams overlapping so
   * much that no clear exit exists) is dropped, so the line can always be drawn.
   */
  private activeObstacles(obstacles: Rect[], ends: Point[]): { raw: Rect[]; inflated: Rect[] } {
    const clearance = this.options.clearance ?? OBSTACLE_CLEARANCE;
    const raw: Rect[] = [];
    const inflated: Rect[] = [];
    for (const r of obstacles) {
      const big = inflate(r, clearance);
      if (ends.some((p) => insideRect(p, big))) continue;
      raw.push(r);
      inflated.push(big);
    }
    return { raw, inflated };
  }

  /**
   * Exit stub length for a port. A port inside its own diagram (a detail-view
   * arrow tip, see {@link Port.owner}) gets an **escape stem**: long enough to
   * leave the owner's frame plus the clearance, so its own diagram can stay an
   * obstacle for the rest of the route. Box-perimeter ports, and every port when
   * avoidance is off, keep the fixed stub.
   */
  private stubFor(port: Port, obstacles: Rect[]): number {
    if (!port.owner || !this.avoiding(obstacles)) return this.stub;
    const r = inflate(port.owner, this.options.clearance ?? OBSTACLE_CLEARANCE);
    const { x, y } = port.point;
    const toEdge = { right: r.x + r.width - x, left: x - r.x, down: r.y + r.height - y, up: y - r.y }[port.side];
    return Math.max(this.stub, toEdge);
  }

  private avoiding(obstacles: Rect[]): boolean {
    return this.options.avoidObstacles !== false && obstacles.length > 0;
  }

  /**
   * The obstacle-avoiding detour for a stub-to-stub run, or `null` to keep `mid`
   * (avoidance off, nothing in the way, or no path exists). Obstacles are
   * inflated by the clearance. Each port's own diagram stays an obstacle (its
   * escape stem already cleared it); only a rect that still contains one of
   * `ends` — diagrams overlapping so much that no clear exit exists — is dropped
   * so the line can always be drawn.
   */
  private avoid(
    mid: Point[],
    startHeading: Heading,
    end: Point,
    endHeading: Heading | null,
    obstacles: Rect[],
    ends: Point[]
  ): Point[] | null {
    if (!this.avoiding(obstacles)) return null;
    const rects = this.activeObstacles(obstacles, ends).inflated;
    if (!polylineHitsAny(mid, rects)) return null; // fast path: the L/Z is already clear
    const start = mid[0];
    const corners = orthogonalPath(start, startHeading, end, endHeading, rects);
    return corners ? [start, ...corners, end] : null;
  }

  /**
   * Nudge `b` onto `a`'s trunk line when the two share an axis and are within
   * the align tolerance (default {@link ALIGN_TOLERANCE}), so a near-aligned pair draws as one straight run
   * instead of a tiny mid-line jog. The shift is sub-tolerance, so `b` stays on
   * its box perimeter. A detail-view arrow tip ({@link Port.owner}) is a fixed
   * point of its drawing, so it never moves: the line would detach from it.
   */
  private snapAligned(a: Port, b: Port): Port {
    if (a.axis !== b.axis || b.owner) return b;
    if (a.axis === 'v' && Math.abs(a.point.x - b.point.x) <= this.alignTolerance) return new Port({ x: a.point.x, y: b.point.y }, b.side, b.owner);
    if (a.axis === 'h' && Math.abs(a.point.y - b.point.y) <= this.alignTolerance) return new Port({ x: b.point.x, y: a.point.y }, b.side, b.owner);
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
    const p1 = port.stub(this.stubFor(port, obstacles));
    const corner = port.axis === 'h' ? { x: target.x, y: p1.y } : { x: p1.x, y: target.y };
    const mid = [p1, corner, target];
    const ends = [p1, target];
    const avoided = this.avoid(mid, SIDE_HEADING[port.side], target, null, obstacles, ends);
    return this.straighten(simplify([port.point, ...(avoided ?? mid)]), obstacles, ends);
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
