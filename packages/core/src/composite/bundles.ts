import type { Point } from '../layout/geometry';
import { PARALLEL_LANE_SPACING } from './layout-constants';
import type { Port } from './ports';

/**
 * One orthogonal route between two floating ports, as seen by the bundler. `key`
 * names the route (its line or link); `aEnd` / `bEnd` name the box side each
 * end leaves from (see {@link sideKey}).
 */
export interface BundleMember {
  key: string;
  a: Port;
  b: Port;
  aEnd: string;
  bEnd: string;
}

/**
 * Identity of the box side a port leaves from: routes whose two ends share the
 * same pair of side keys form a bundle. Box-perimeter ports on one side share
 * the edge coordinate (which also tells a split child's section boxes apart); a
 * detail-view arrow tip is keyed by its owner drawing instead.
 */
export function sideKey(instanceId: string, port: Port): string {
  if (port.owner) return `${instanceId}:${port.side}:owner`;
  const edge = port.axis === 'h' ? port.point.x : port.point.y;
  return `${instanceId}:${port.side}:${Math.round(edge)}`;
}

/** Above this bundle size, lanes follow the slot order instead of searching every permutation. */
const MAX_SEARCHED_BUNDLE = 6;

/**
 * Lane offsets for parallel orthogonal routes. Routes joining the same two box
 * sides with a Z (both ends on the same axis) would otherwise all bend on one
 * shared mid-line, overlapping. Each bundle of two or more gets lanes spaced
 * {@link PARALLEL_LANE_SPACING} apart, centred on the midpoint, assigned so the
 * routes nest: the order with the fewest crossings (then overlaps) wins, ties
 * broken by the first order tried, so the result is deterministic. Routes not
 * in any bundle are absent from the map (offset 0, unchanged).
 *
 * `preview` returns a route's pre-detour polyline for a given offset.
 */
export function laneOffsets(
  members: BundleMember[],
  preview: (m: BundleMember, laneOffset: number) => Point[],
  spacing = PARALLEL_LANE_SPACING
): Map<string, number> {
  const groups = new Map<string, BundleMember[]>();
  for (const m of members) {
    if (m.a.axis !== m.b.axis) continue; // an L has no mid-line jog to spread
    const k = [m.aEnd, m.bEnd].sort().join('|');
    const group = groups.get(k);
    if (group) group.push(m);
    else groups.set(k, [m]);
  }

  const out = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const lane = (i: number) => (i - (group.length - 1) / 2) * spacing;
    // Base order: along the shared edge (slot order), then by key, so equal
    // costs resolve the same way every layout.
    const base = [...group].sort((p, q) => along(p) - along(q) || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
    let best = base;
    if (group.length <= MAX_SEARCHED_BUNDLE) {
      let bestCost = Infinity;
      for (const order of permutations(base)) {
        const cost = bundleCost(order.map((m, i) => preview(m, lane(i))));
        if (cost < bestCost) {
          bestCost = cost;
          best = order;
          if (cost === 0) break;
        }
      }
    }
    best.forEach((m, i) => out.set(m.key, lane(i)));
  }
  return out;
}

/** Position of a member along its shared edge: the `a` port's coordinate across the exit axis. */
function along(m: BundleMember): number {
  return m.a.axis === 'h' ? m.a.point.y : m.a.point.x;
}

/** All orderings of `items`, the identity first (lexicographic by index). */
function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i], ...tail];
  }
}

/** Crossings between the routes of a bundle, with a shared (overlapping) run weighing far more. */
function bundleCost(routes: Point[][]): number {
  let cost = 0;
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      for (const s of segments(routes[i])) for (const t of segments(routes[j])) cost += segmentCost(s, t);
    }
  }
  return cost;
}

type Segment = [Point, Point];

function segments(points: Point[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < points.length; i++) out.push([points[i - 1], points[i]]);
  return out;
}

const EPS = 0.5;
const OVERLAP_COST = 100;

/** 1 for a proper crossing of two orthogonal segments, {@link OVERLAP_COST} for a shared run, else 0. */
function segmentCost([a, b]: Segment, [c, d]: Segment): number {
  const sHoriz = Math.abs(a.y - b.y) < EPS;
  const tHoriz = Math.abs(c.y - d.y) < EPS;
  if (sHoriz === tHoriz) {
    // Parallel: overlapping only when on the same line with a shared stretch.
    const sameLine = sHoriz ? Math.abs(a.y - c.y) < EPS : Math.abs(a.x - c.x) < EPS;
    if (!sameLine) return 0;
    const [s0, s1] = sHoriz ? span(a.x, b.x) : span(a.y, b.y);
    const [t0, t1] = sHoriz ? span(c.x, d.x) : span(c.y, d.y);
    return Math.min(s1, t1) - Math.max(s0, t0) > EPS ? OVERLAP_COST : 0;
  }
  const [h0, h1] = sHoriz ? [a, b] : [c, d];
  const [v0, v1] = sHoriz ? [c, d] : [a, b];
  const [hx0, hx1] = span(h0.x, h1.x);
  const [vy0, vy1] = span(v0.y, v1.y);
  // Strictly inside both: a shared endpoint (touching ports) isn't a crossing.
  return v0.x > hx0 + EPS && v0.x < hx1 - EPS && h0.y > vy0 + EPS && h0.y < vy1 - EPS ? 1 : 0;
}

function span(p: number, q: number): [number, number] {
  return p <= q ? [p, q] : [q, p];
}
