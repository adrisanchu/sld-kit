import { describe, it, expect } from 'vitest';
import {
  BOX_SIZE,
  CURVE_RADIUS,
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSvgExporter,
  CommandStack,
  SetDefaultRoutingCommand,
  DiagramInstance,
  MapResolver,
  OBSTACLE_CLEARANCE,
  OrthogonalRouter,
  Port,
  Serializer,
  buildDocument,
  connectionPath,
  linkNodeDots,
  type LineRouting,
  type Point,
  type Rect
} from '../src';

/** Whether the axis-aligned segment `p → q` enters `r`'s open interior. */
function hits(p: Point, q: Point, r: Rect): boolean {
  const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  if (y0 === y1) return y0 > r.y && y0 < r.y + r.height && x1 > r.x && x0 < r.x + r.width;
  return x0 > r.x && x0 < r.x + r.width && y1 > r.y && y0 < r.y + r.height;
}
const crosses = (pts: Point[], r: Rect) => pts.some((p, i) => i > 0 && hits(pts[i - 1], p, r));
const axisAligned = (pts: Point[]) => pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);

/** A one-feeder substation whose feeder `id` leaves on `direction`. */
function substation(id: string, feederId: string, direction: 'left' | 'right' | 'up' | 'down') {
  return buildDocument({
    meta: { id, name: id.toUpperCase(), substation: id.toUpperCase(), voltageKv: 220 },
    busbars: [{ label: 'BB', row: 0 }],
    bays: [
      {
        col: 0,
        positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: feederId, direction, id: feederId } }]
      }
    ]
  });
}

/**
 * Three boxes in a row: A and C share the auto-link `tie` (A's feeder leaves
 * right, C's left) and B sits squarely between them on the same row, so the
 * phase-1 straight trunk would cut right through it.
 */
function blockedRow(opts: { boxMode?: boolean; routing?: LineRouting; line?: boolean; spacing?: number } = {}) {
  const dx = opts.spacing ?? 300;
  const res = new MapResolver(
    new Map([
      ['a', Serializer.toJSON(substation('a', 'tie', 'right'))],
      ['b', Serializer.toJSON(substation('b', 'b-own', 'down'))],
      ['c', Serializer.toJSON(substation('c', 'tie', 'left'))]
    ])
  );
  const doc = new CompositeDocument({
    id: 'row',
    name: 'row',
    boxMode: opts.boxMode ?? true,
    defaultRouting: opts.routing ?? 'orthogonal'
  });
  doc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'a', x: 0, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'b', libraryId: 'b', x: dx, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'c', libraryId: 'c', x: 2 * dx, y: 0 }));
  if (opts.line) {
    doc.addLine(
      new CompositeLine('ln', [
        { kind: 'anchor', instanceId: 'a', connectionId: 'tie' },
        { kind: 'anchor', instanceId: 'c', connectionId: 'tie' }
      ])
    );
  }
  doc.resolveChildren(res);
  return doc;
}

describe('OrthogonalRouter — obstacle avoidance', () => {
  const a = new Port({ x: 0, y: 0 }, 'right');
  const b = new Port({ x: 400, y: 0 }, 'left');
  const wall: Rect = { x: 150, y: -50, width: 100, height: 100 };

  it('keeps the phase-1 route when nothing is in the way (fast path)', () => {
    const router = new OrthogonalRouter();
    const clear: Rect = { x: 150, y: 200, width: 100, height: 100 };
    expect(router.route(a, b, [clear])).toEqual(router.route(a, b));
    expect(router.route(a, b)).toEqual([a.point, b.point]);
  });

  it('routes around an obstacle on the trunk, axis-aligned, keeping the clearance', () => {
    const pts = new OrthogonalRouter().route(a, b, [wall]);
    expect(pts[0]).toEqual(a.point);
    expect(pts[pts.length - 1]).toEqual(b.point);
    expect(axisAligned(pts)).toBe(true);
    const inflated = {
      x: wall.x - OBSTACLE_CLEARANCE,
      y: wall.y - OBSTACLE_CLEARANCE,
      width: wall.width + 2 * OBSTACLE_CLEARANCE,
      height: wall.height + 2 * OBSTACLE_CLEARANCE
    };
    expect(crosses(pts, inflated)).toBe(false);
    // Minimal bends: over or under the wall is a 4-bend U-detour.
    expect(pts.length).toBe(6);
  });

  it('is deterministic', () => {
    const router = new OrthogonalRouter();
    expect(router.route(a, b, [wall])).toEqual(router.route(a, b, [wall]));
  });

  it('avoidObstacles: false keeps the straight trunk through the obstacle', () => {
    const pts = new OrthogonalRouter(undefined, undefined, { avoidObstacles: false }).route(a, b, [wall]);
    expect(pts).toEqual([a.point, b.point]);
  });

  it('toPoint routes around an obstacle to a free point', () => {
    const pts = new OrthogonalRouter().toPoint(a, { x: 400, y: 0 }, [wall]);
    expect(crosses(pts, wall)).toBe(false);
    expect(axisAligned(pts)).toBe(true);
    expect(pts[pts.length - 1]).toEqual({ x: 400, y: 0 });
  });

  it('falls back to the phase-1 route when the far end is walled in', () => {
    // A closed ring of four walls around b's exit stub: no path can reach it.
    const ring: Rect[] = [
      { x: 300, y: -100, width: 200, height: 20 },
      { x: 300, y: 80, width: 200, height: 20 },
      { x: 300, y: -100, width: 20, height: 200 },
      { x: 480, y: -100, width: 20, height: 200 }
    ];
    const far = new Port({ x: 420, y: 0 }, 'left');
    const router = new OrthogonalRouter();
    expect(router.route(a, far, ring)).toEqual(router.route(a, far));
  });
});

describe('OrthogonalRouter — escape stems (ports inside their own diagram)', () => {
  // A detail-view tip sits inside its own frame; the port carries that frame.
  const ownA: Rect = { x: -200, y: -100, width: 260, height: 200 };
  const a = new Port({ x: 40, y: 0 }, 'right', ownA);
  const b = new Port({ x: 400, y: 300 }, 'left');

  it('leaves its own frame with a straight stem, then keeps out of it', () => {
    const pts = new OrthogonalRouter().route(a, b, [ownA]);
    // The stem runs straight out past the inflated frame edge before it turns
    // (collinear points merge, so the first corner may lie further out).
    expect(pts[0]).toEqual(a.point);
    expect(pts[1].y).toBe(0);
    expect(pts[1].x).toBeGreaterThanOrEqual(ownA.x + ownA.width + OBSTACLE_CLEARANCE);
    expect(crosses(pts.slice(1), ownA)).toBe(false);
  });

  it('keeps the fixed stub when avoidance is off', () => {
    const pts = new OrthogonalRouter(undefined, undefined, { avoidObstacles: false }).route(a, b, [ownA]);
    expect(pts).toEqual(new OrthogonalRouter().route(new Port(a.point, a.side), b));
  });
});

describe('OrthogonalRouter — no small jogs', () => {
  it('caps the stubs of close facing ports instead of doubling back', () => {
    // 30px apart, offset 10: two 24px stubs would overshoot each other.
    const pts = new OrthogonalRouter(undefined, 0).route(new Port({ x: 0, y: 0 }, 'right'), new Port({ x: 30, y: 10 }, 'left'));
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 10 }, { x: 30, y: 10 }]);
  });

  it('never snaps a detail-view tip: the line stays on the arrow', () => {
    const own: Rect = { x: 300, y: -50, width: 200, height: 100 };
    const tip = new Port({ x: 400, y: 5 }, 'left', own);
    const pts = new OrthogonalRouter().route(new Port({ x: 0, y: 0 }, 'right'), tip, [own]);
    expect(pts[pts.length - 1]).toEqual(tip.point);
  });

  it('straightens a run that hugs a clearance edge a few px off the port line', () => {
    // The direct run along y = 0 grazes the box's clearance band (box bottom at
    // y = -3), so the search hugs its inflated edge at y = 9 and then has to step
    // 9px back up to the port. Sliding that run onto y = 0 still clears the box.
    const box: Rect = { x: 300, y: -60, width: 100, height: 57 };
    const a = new Port({ x: 500, y: 300 }, 'up');
    const b = new Port({ x: 0, y: 0 }, 'right');
    const pts = new OrthogonalRouter().route(a, b, [box]);
    expect(pts).toEqual([{ x: 500, y: 300 }, { x: 500, y: 0 }, { x: 0, y: 0 }]);
    expect(crosses(pts, box)).toBe(false);
    // With straightening off, the 9px step is still there.
    const raw = new OrthogonalRouter(undefined, undefined, { minJog: 0 }).route(a, b, [box]);
    expect(raw.some((p) => p.y === 9)).toBe(true);
  });

  it('keeps a jog it cannot slide (both runs end at fixed ports)', () => {
    const a = new Port({ x: 0, y: 0 }, 'down');
    const b = new Port({ x: 11, y: 200 }, 'up');
    expect(new OrthogonalRouter(undefined, 0).route(a, b, [{ x: 500, y: 500, width: 10, height: 10 }])).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 11, y: 100 },
      { x: 11, y: 200 }
    ]);
  });
});

describe('CompositeLayoutEngine — obstacle avoidance', () => {
  const boxOf = (layout: ReturnType<CompositeLayoutEngine['layout']>, id: string) =>
    layout.children.find((c) => c.instance.id === id)!.worldBounds;

  it('routes an auto-link around a box sitting between its two peers (box view)', () => {
    const layout = new CompositeLayoutEngine().layout(blockedRow());
    const [link] = layout.links;
    expect(link.connectionId).toBe('tie');
    expect(axisAligned(link.points)).toBe(true);
    expect(crosses(link.points, boxOf(layout, 'b'))).toBe(false);
    // …and never doubles back through its own endpoint boxes.
    expect(crosses(link.points.slice(1, -1), boxOf(layout, 'a'))).toBe(false);
    expect(crosses(link.points.slice(1, -1), boxOf(layout, 'c'))).toBe(false);
  });

  it('routes a manual orthogonal line around the box too, deterministically', () => {
    const engine = new CompositeLayoutEngine();
    const layout = engine.layout(blockedRow({ line: true }));
    const [line] = layout.lines;
    expect(crosses(line.points, boxOf(layout, 'b'))).toBe(false);
    expect(engine.layout(blockedRow({ line: true })).lines[0].points).toEqual(line.points);
  });

  it('routes around the middle diagram in detail view', () => {
    // Detail frames are wider than boxes: space them so the diagrams don't overlap.
    const layout = new CompositeLayoutEngine().layout(blockedRow({ boxMode: false, spacing: 500 }));
    const [link] = layout.links;
    expect(link.points.length).toBeGreaterThan(2);
    expect(crosses(link.points, boxOf(layout, 'b'))).toBe(false);
  });

  // Detail view: C sits below A, and C's feeder leaves its *left* edge, so the
  // phase-1 Z (elbow halfway between the stubs) reaches C's tip by cutting
  // through C's own drawing. The escape stems keep both diagrams obstacles.
  function detailPair() {
    const res = new MapResolver(
      new Map([
        ['a', Serializer.toJSON(substation('a', 'tie', 'right'))],
        ['c', Serializer.toJSON(substation('c', 'tie', 'left'))]
      ])
    );
    const doc = new CompositeDocument({ id: 'pair', name: 'pair', boxMode: false, defaultRouting: 'orthogonal' });
    doc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'a', x: 0, y: 0 }));
    doc.addChild(DiagramInstance.of({ id: 'c', libraryId: 'c', x: 0, y: 600 }));
    doc.resolveChildren(res);
    return doc;
  }

  it('never routes back through the diagrams a line connects (detail view)', () => {
    const doc = detailPair();
    const stems = (pts: Point[]) => pts.slice(1, -1); // drop the tip → stem-end segments
    // Without avoidance, the old route does cut through C's drawing…
    const naive = new CompositeLayoutEngine(undefined, undefined, new OrthogonalRouter(undefined, undefined, { avoidObstacles: false })).layout(doc);
    expect(crosses(stems(naive.links[0].points), boxOf(naive, 'c'))).toBe(true);
    // …with it, only the straight stems at each end lie inside their own frame.
    const layout = new CompositeLayoutEngine().layout(doc);
    const pts = layout.links[0].points;
    expect(axisAligned(pts)).toBe(true);
    expect(crosses(stems(pts), boxOf(layout, 'a'))).toBe(false);
    expect(crosses(stems(pts), boxOf(layout, 'c'))).toBe(false);
  });

  it('leaves the straight trunk when the boxes are not in the way', () => {
    const doc = blockedRow();
    doc.getChild('b')!.y = 400;
    const [link] = new CompositeLayoutEngine().layout(doc).links;
    expect(link.points).toHaveLength(2);
    expect(link.points[0].y).toBe(link.points[1].y);
    expect(link.points[0].y).toBe(BOX_SIZE.height / 2);
  });
});

describe('curved routing', () => {
  it('routes exactly like orthogonal and reports the corner radius', () => {
    const engine = new CompositeLayoutEngine();
    const ortho = engine.layout(blockedRow({ line: true }));
    const curved = engine.layout(blockedRow({ line: true, routing: 'curved' }));
    expect(curved.lines[0].points).toEqual(ortho.lines[0].points);
    expect(curved.lines[0].cornerRadius).toBe(CURVE_RADIUS);
    expect(ortho.lines[0].cornerRadius).toBeUndefined();
  });

  it('a per-line orthogonal override opts out of a curved default', () => {
    const doc = blockedRow({ line: true, routing: 'curved' });
    doc.getLine('ln')!.routing = 'orthogonal';
    expect(new CompositeLayoutEngine().layout(doc).lines[0].cornerRadius).toBeUndefined();
  });

  it('curves auto-links and honours the cornerRadius option', () => {
    const engine = new CompositeLayoutEngine(undefined, undefined, undefined, { cornerRadius: 5 });
    const [link] = engine.layout(blockedRow({ routing: 'curved' })).links;
    expect(link.cornerRadius).toBe(5);
    // A curved link's node dots sit on its two ends only.
    expect(linkNodeDots(link)).toEqual([link.points[0], link.points[link.points.length - 1]]);
  });

  it('exports rounded bends, Office-safe', () => {
    const svg = new CompositeSvgExporter().export(blockedRow({ routing: 'curved', line: true }));
    expect(svg).toMatch(/A 12 12 0 0 [01] /);
    expect(svg).not.toContain('<style');
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('currentColor');
  });

  it('SetDefaultRoutingCommand do/undo flips orthogonal ↔ curved', () => {
    const doc = blockedRow();
    const stack = new CommandStack<CompositeDocument>();
    stack.execute(new SetDefaultRoutingCommand('orthogonal', 'curved'), doc);
    expect(doc.meta.defaultRouting).toBe('curved');
    stack.undo(doc);
    expect(doc.meta.defaultRouting).toBe('orthogonal');
  });

  it('an orthogonal export draws no arcs', () => {
    expect(new CompositeSvgExporter().export(blockedRow({ line: true }))).not.toMatch(/ A \d/);
  });
});

describe('connectionPath — rounded corners', () => {
  const L = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 }
  ];

  it('cornerRadius 0 is the plain path', () => {
    expect(connectionPath(L, undefined, 6, 0)).toBe(connectionPath(L, undefined, 6));
    expect(connectionPath(L, undefined, 6)).toBe('M 0 0 L 100 0 L 100 100');
  });

  it('rounds a right turn (sweep 1) and a left turn (sweep 0)', () => {
    expect(connectionPath(L, undefined, 6, 10)).toBe('M 0 0 L 90 0 A 10 10 0 0 1 100 10 L 100 100');
    const left = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: -100 }
    ];
    expect(connectionPath(left, undefined, 6, 10)).toBe('M 0 0 L 90 0 A 10 10 0 0 0 100 -10 L 100 -100');
  });

  it('draws a jog shorter than two radii as one smooth S-curve', () => {
    const z = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 8 }, { x: 200, y: 8 }];
    expect(connectionPath(z, undefined, 6, 10)).toBe('M 0 0 L 90 0 C 100 0 100 8 110 8 L 200 8');
  });

  it('keeps arcs for a jog of two radii or more, and for a short U-turn', () => {
    const z = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 200, y: 20 }];
    expect(connectionPath(z, undefined, 6, 10)).toBe('M 0 0 L 90 0 A 10 10 0 0 1 100 10 A 10 10 0 0 0 110 20 L 200 20');
    const u = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 8 }, { x: 0, y: 8 }];
    expect(connectionPath(u, undefined, 6, 10)).toBe('M 0 0 L 96 0 A 4 4 0 0 1 100 4 A 4 4 0 0 1 96 8 L 0 8');
  });

  it('keeps hops clear of a rounded corner, mid-segment hops still drawn', () => {
    const hops = [
      { x: 50, y: 0 },
      { x: 88, y: 0 }
    ];
    const d = connectionPath(L, hops, 6, 10);
    expect(d).toContain('L 44 0 A 6 6 0 0 0 56 0'); // the mid hop
    expect(d).not.toContain('82 0'); // the hop at x=88 would overlap the corner arc
  });
});
