import type { ElementId } from '../types';
import type { ElementGeometry, ConnectionGeometry } from './LayoutEngine';
import type { Point } from './geometry';

/**
 * Post-layout pass: annotates `ConnectionGeometry.hops` in-place for every
 * horizontal segment that crosses a vertical segment of a different connection.
 *
 * Convention: the horizontal segment hops over the vertical one (standard
 * schematic practice — visually the side-exit arcs over each bay trunk it
 * crosses). Only strict interior crossings are detected (endpoints excluded
 * with a 0.5 px epsilon) so T-joints, junction-dot taps, and bus-bar crossings
 * are all correctly ignored.
 *
 * Complexity: O(S²) where S = total segments across all connections. At SLD
 * scale (tens of connections, 2–4 segments each) this is microseconds.
 */
export function detectCrossings(geometry: Map<ElementId, ElementGeometry>): void {
  const eps = 0.5;

  const conns: { id: ElementId; geo: ConnectionGeometry }[] = [];
  for (const [id, geo] of geometry) {
    if (geo.kind === 'connection') conns.push({ id, geo });
  }

  for (let i = 0; i < conns.length; i++) {
    const A = conns[i];
    for (let j = 0; j < conns.length; j++) {
      if (i === j) continue;
      const B = conns[j];

      for (let si = 0; si < A.geo.points.length - 1; si++) {
        const p1 = A.geo.points[si];
        const p2 = A.geo.points[si + 1];
        if (Math.abs(p1.y - p2.y) >= eps) continue; // not horizontal

        const hy = p1.y;
        const hMinX = Math.min(p1.x, p2.x);
        const hMaxX = Math.max(p1.x, p2.x);

        for (let sj = 0; sj < B.geo.points.length - 1; sj++) {
          const q1 = B.geo.points[sj];
          const q2 = B.geo.points[sj + 1];
          if (Math.abs(q1.x - q2.x) >= eps) continue; // not vertical

          const vx = q1.x;
          const vMinY = Math.min(q1.y, q2.y);
          const vMaxY = Math.max(q1.y, q2.y);

          // Strict interior crossing: each point must be inside the other segment.
          if (vx <= hMinX + eps || vx >= hMaxX - eps) continue;
          if (hy <= vMinY + eps || hy >= vMaxY - eps) continue;

          const crossing: Point = { x: vx, y: hy };

          // Skip if the crossing coincides with a junction dot of either connection
          // (that's a real electrical junction, not a graphical crossing).
          if (isNearDot(A.geo, crossing, eps)) continue;
          if (isNearDot(B.geo, crossing, eps)) continue;

          if (!A.geo.hops) A.geo.hops = [];
          if (!A.geo.hops.some((h) => Math.abs(h.x - vx) < eps && Math.abs(h.y - hy) < eps)) {
            A.geo.hops.push(crossing);
          }
        }
      }
    }
  }

  // Sort hops by x so the path builder can process them in order.
  for (const { geo } of conns) {
    if (geo.hops) geo.hops.sort((a, b) => a.x - b.x);
  }
}

function isNearDot(geo: ConnectionGeometry, p: Point, eps: number): boolean {
  return !!geo.dot && Math.abs(geo.dot.x - p.x) < eps && Math.abs(geo.dot.y - p.y) < eps;
}
