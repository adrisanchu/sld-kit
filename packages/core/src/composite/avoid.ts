import type { Point, Rect } from '../layout/geometry';
import { BEND_PENALTY } from './layout-constants';

/**
 * Obstacle-avoiding orthogonal search for the floating-connector router: a
 * small visibility-grid (libavoid-style) Dijkstra over axis-aligned moves, with
 * a bend penalty so routes keep as few corners as possible. Pure and
 * deterministic — the same input always yields the same path.
 */

/** Travel heading: 0 = +x, 1 = +y (down), 2 = −x, 3 = −y (up). */
export type Heading = 0 | 1 | 2 | 3;

const EPS = 1e-6;

/** Heading of the unit move `a → b` (axis-aligned, non-degenerate), else null. */
export function headingOf(a: Point, b: Point): Heading | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) < EPS && Math.abs(dx) >= EPS) return dx > 0 ? 0 : 2;
  if (Math.abs(dx) < EPS && Math.abs(dy) >= EPS) return dy > 0 ? 1 : 3;
  return null;
}

/** Grow a rect by `by` on every side. */
export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

/** Whether `p` lies strictly inside `r` (edges don't count). */
export function insideRect(p: Point, r: Rect): boolean {
  return p.x > r.x + EPS && p.x < r.x + r.width - EPS && p.y > r.y + EPS && p.y < r.y + r.height - EPS;
}

/**
 * Whether the segment `p → q` passes through the **open interior** of `r`. A
 * segment running along an edge, or touching a corner, does not hit. Works for
 * any segment orientation, but the router only feeds it axis-aligned ones.
 */
export function segmentHitsRect(p: Point, q: Point, r: Rect): boolean {
  const minX = Math.min(p.x, q.x);
  const maxX = Math.max(p.x, q.x);
  const minY = Math.min(p.y, q.y);
  const maxY = Math.max(p.y, q.y);
  const left = r.x;
  const right = r.x + r.width;
  const top = r.y;
  const bottom = r.y + r.height;
  // Axis-aligned overlap of the open interior with the segment's bounding box.
  if (Math.abs(p.y - q.y) < EPS)
    return p.y > top + EPS && p.y < bottom - EPS && maxX > left + EPS && minX < right - EPS;
  if (Math.abs(p.x - q.x) < EPS)
    return p.x > left + EPS && p.x < right - EPS && maxY > top + EPS && minY < bottom - EPS;
  // Diagonal (not produced by the router): Liang–Barsky clip against the interior.
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (den: number, num: number) => {
    if (Math.abs(den) < EPS) return num > EPS;
    const t = num / den;
    if (den > 0) t1 = Math.min(t1, t);
    else t0 = Math.max(t0, t);
    return t0 < t1;
  };
  return (
    clip(dx, right - p.x) && clip(-dx, p.x - left) && clip(dy, bottom - p.y) && clip(-dy, p.y - top) && t1 - t0 > EPS
  );
}

/** Whether any segment of `points` passes through any obstacle's interior. */
export function polylineHitsAny(points: Point[], obstacles: Rect[]): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const r of obstacles) if (segmentHitsRect(points[i - 1], points[i], r)) return true;
  }
  return false;
}

/** Sorted, de-duplicated coordinates plus the midpoint of every gap between them. */
function candidateCoords(base: number[]): number[] {
  const sorted = [...new Set(base.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i + 1 < sorted.length) out.push((sorted[i] + sorted[i + 1]) / 2);
  }
  return out;
}

/** Minimal binary heap ordered by `(cost, seq)` — `seq` makes ties deterministic. */
class Heap {
  private items: { cost: number; seq: number; state: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(cost: number, seq: number, state: number): void {
    const items = this.items;
    items.push({ cost, seq, state });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }
  pop(): { cost: number; seq: number; state: number } {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (last && items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(l, m)) m = l;
        if (r < items.length && this.less(r, m)) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top;
  }
  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x.cost < y.cost || (x.cost === y.cost && x.seq < y.seq);
  }
}

/**
 * Shortest orthogonal path from `start` to `end` that never enters an
 * obstacle's interior, minimising `length + bendPenalty × bends`. `startHeading`
 * is the direction the line is already travelling at `start` (the port's exit
 * stub), so carrying straight on is free; `endHeading`, when given, is the
 * direction it must travel on arrival (into the far port), and arriving any
 * other way costs one bend. Returns the corner points strictly between `start`
 * and `end` (the caller owns the endpoints), or `null` when no path exists.
 */
export function orthogonalPath(
  start: Point,
  startHeading: Heading,
  end: Point,
  endHeading: Heading | null,
  obstacles: Rect[],
  bendPenalty = BEND_PENALTY
): Point[] | null {
  const xs = candidateCoords([start.x, end.x, ...obstacles.flatMap((r) => [r.x, r.x + r.width])]);
  const ys = candidateCoords([start.y, end.y, ...obstacles.flatMap((r) => [r.y, r.y + r.height])]);
  const nx = xs.length;
  const ny = ys.length;
  const idx = (i: number, j: number) => j * nx + i;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  const si = xs.findIndex((v) => near(v, start.x));
  const sj = ys.findIndex((v) => near(v, start.y));
  const ei = xs.findIndex((v) => near(v, end.x));
  const ej = ys.findIndex((v) => near(v, end.y));
  if (si < 0 || sj < 0 || ei < 0 || ej < 0) return null;

  // Grid nodes strictly inside an obstacle are blocked.
  const blocked = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p = { x: xs[i], y: ys[j] };
      if (obstacles.some((r) => insideRect(p, r))) blocked[idx(i, j)] = 1;
    }
  }
  const startNode = idx(si, sj);
  const endNode = idx(ei, ej);
  if (blocked[startNode] || blocked[endNode]) return null;

  const STEP: Record<Heading, [number, number]> = { 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] };
  const nStates = nx * ny * 4;
  const dist = new Float64Array(nStates).fill(Infinity);
  const prev = new Int32Array(nStates).fill(-1);
  const heap = new Heap();
  let seq = 0;
  const startState = startNode * 4 + startHeading;
  dist[startState] = 0;
  heap.push(0, seq++, startState);

  let best = -1;
  let bestCost = Infinity;
  while (heap.size > 0) {
    const { cost, state } = heap.pop();
    if (cost > dist[state] || cost >= bestCost) continue;
    const node = state >> 2;
    const h = (state & 3) as Heading;
    if (node === endNode) {
      const total = cost + (endHeading !== null && h !== endHeading ? bendPenalty : 0);
      if (total < bestCost) {
        bestCost = total;
        best = state;
      }
      continue;
    }
    const i = node % nx;
    const j = (node - i) / nx;
    for (const nh of [0, 1, 2, 3] as Heading[]) {
      if (nh === (h + 2) % 4) continue; // never reverse in place
      const [di, dj] = STEP[nh];
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const nn = idx(ni, nj);
      if (blocked[nn]) continue;
      const a = { x: xs[i], y: ys[j] };
      const b = { x: xs[ni], y: ys[nj] };
      if (obstacles.some((r) => segmentHitsRect(a, b, r))) continue;
      const nc = cost + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (nh === h ? 0 : bendPenalty);
      const ns = nn * 4 + nh;
      if (nc < dist[ns]) {
        dist[ns] = nc;
        prev[ns] = state;
        heap.push(nc, seq++, ns);
      }
    }
  }
  if (best < 0) return null;

  // Walk back, keeping only the corners (heading changes).
  const nodes: Point[] = [];
  for (let s = best; s >= 0; s = prev[s]) {
    const node = s >> 2;
    const i = node % nx;
    nodes.push({ x: xs[i], y: ys[(node - i) / nx] });
  }
  nodes.reverse();
  const corners: Point[] = [];
  for (let k = 1; k < nodes.length - 1; k++) {
    if (headingOf(nodes[k - 1], nodes[k]) !== headingOf(nodes[k], nodes[k + 1])) corners.push(nodes[k]);
  }
  return corners;
}
