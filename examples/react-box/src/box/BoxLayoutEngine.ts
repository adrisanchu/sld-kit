import {
  CompositeLayoutEngine,
  type ChildLayout,
  type CompositeDocument,
  type CompositeLayout,
  type CompositeLine,
  type CompositeLineLayout,
  type ExternalConnectionTip,
  type LineVertexJson,
  type Point,
  type Rect
} from '@sld-kit/core';
import { CABLE_DASH_ARRAY, DEMAND_LEAD_LENGTH, DEMAND_SYMBOL, TRANSFORMER_SYMBOL } from './constants';
import { OrthogonalRouter } from './OrthogonalRouter';
import { Port } from './Port';
import { PortResolver } from './PortResolver';
import { arcMidpoint, segmentAngleDeg, simplify } from './polyline';

/** A resolved line endpoint: a floating port (anchored) or a fixed free point. */
type End = { port: Port; point?: undefined } | { port?: undefined; point: Point } | null;

export interface BoxLayoutResult {
  /** A `CompositeLayout` with floating-connector-routed lines, ready for the canvas. */
  layout: CompositeLayout;
  /** Active-view feeder attach points — draw-mode snap targets. */
  snapTargets: ExternalConnectionTip[];
}

/**
 * The box view's layout engine. It **extends** the core `CompositeLayoutEngine`,
 * reusing its child layout (frames, transforms, child SLD geometry) but replacing
 * the fixed-connector line resolution with the floating-connector model:
 * endpoints resolve to the active view's frame (box perimeter vs SLD tip) and
 * bends are computed by an orthogonal router. The same document lays out cleanly
 * in *both* views because no per-view pixel geometry is ever stored.
 *
 * Because it subclasses the core engine, the `CompositeSvgExporter` renders the
 * exact routed geometry (`new CompositeSvgExporter(boxEngine)`) — screen and
 * export stay in lock-step, the way the core engine and exporter already do.
 */
export class BoxLayoutEngine extends CompositeLayoutEngine {
  constructor(private readonly router = new OrthogonalRouter()) {
    super();
  }

  /** Override: the base child layout, with lines re-resolved via floating connectors. */
  override layout(doc: CompositeDocument): CompositeLayout {
    return this.route(doc).layout;
  }

  /** The routed layout plus the active-view feeder attach points (draw-mode snapping). */
  build(doc: CompositeDocument): BoxLayoutResult {
    return this.route(doc);
  }

  private route(doc: CompositeDocument): BoxLayoutResult {
    const core = super.layout(doc);
    const boxMode = doc.meta.boxMode ?? false;
    const defaultRouting = doc.meta.defaultRouting ?? 'straight';
    const resolver = new PortResolver(core.children, boxMode);

    const lines: CompositeLineLayout[] = [];
    for (const line of doc.allLines()) {
      const routed = this.routeLine(line, resolver, line.routing ?? defaultRouting);
      if (routed) lines.push(routed);
    }

    return {
      layout: { children: core.children, links: [], lines, bounds: this.routedBounds(core.children, lines) },
      snapTargets: resolver.tips()
    };
  }

  /** Resolve one line's endpoints to the active view and route its polyline. */
  private routeLine(line: CompositeLine, resolver: PortResolver, routing: string): CompositeLineLayout | null {
    const ends = line.vertices.map((v) => this.resolveEnd(v, resolver));
    const first = ends[0];
    const last = ends[ends.length - 1];

    // A demand's free end is a node-relative lead: recomputed off its feeder's
    // port every layout, so it stays attached and vertical in both views — it is
    // never the stored coordinate (that's the view-specific hack this replaces).
    if (line.kind === 'demand') {
      const anchored = first?.port ? first : last?.port ? last : null;
      if (!anchored?.port) return null;
      return this.decorate(line, this.router.lead(anchored.port, DEMAND_LEAD_LENGTH));
    }

    const orthogonal = routing === 'orthogonal';
    let points: Point[] | null = null;

    if (first?.port && last?.port) {
      points = orthogonal ? this.router.route(first.port, last.port) : simplify([first.port.point, last.port.point]);
    } else if (first?.port && last?.point) {
      points = orthogonal ? this.router.toPoint(first.port, last.point) : simplify([first.port.point, last.point]);
    } else if (first?.point && last?.port) {
      points = orthogonal ? this.router.toPoint(last.port, first.point) : simplify([last.port.point, first.point]);
    } else {
      // No floating end: draw the resolved free points straight (manual polyline).
      const raw = ends.flatMap((e) => (e?.point ? [e.point] : []));
      points = raw.length >= 2 ? simplify(raw) : null;
    }

    return points ? this.decorate(line, points) : null;
  }

  private resolveEnd(v: LineVertexJson, resolver: PortResolver): End {
    if (v.kind === 'anchor') {
      const port = resolver.resolve(v.instanceId, v.connectionId);
      return port ? { port } : null;
    }
    if (v.kind === 'point') return { point: { x: v.x, y: v.y } };
    return null; // `rel` bends aren't used by the auto router (phase 1)
  }

  /** Attach the kind's stroke/glyph presentation to a resolved polyline. */
  private decorate(line: CompositeLine, points: Point[]): CompositeLineLayout {
    const layout: CompositeLineLayout = { line, points, kind: line.kind };

    if (line.kind === 'cable') layout.dashArray = CABLE_DASH_ARRAY;

    if (line.kind === 'transformer') {
      const mid = arcMidpoint(points);
      if (mid) layout.glyph = { key: TRANSFORMER_SYMBOL, at: mid.at, angleDeg: mid.angleDeg };
    }

    if (line.kind === 'demand' && points.length >= 2) {
      const b = points[points.length - 1];
      const a = points[points.length - 2];
      layout.terminus = { key: DEMAND_SYMBOL, at: b, angleDeg: segmentAngleDeg(a, b) };
    }

    return layout;
  }

  private routedBounds(children: ChildLayout[], lines: CompositeLineLayout[]): Rect {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const extend = (p: Point) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    };
    for (const child of children) {
      const b = child.worldBounds;
      extend({ x: b.x, y: b.y });
      extend({ x: b.x + b.width, y: b.y + b.height });
    }
    for (const line of lines) for (const p of line.points) extend(p);

    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}
