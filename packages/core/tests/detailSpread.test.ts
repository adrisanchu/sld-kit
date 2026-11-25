import { describe, it, expect } from 'vitest';
import {
  BOX_SIZE,
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSvgExporter,
  DETAIL_SPREAD_GAP,
  DiagramInstance,
  MapResolver,
  Serializer,
  buildDocument,
  type BaySpec,
  type ChildLayout,
  type CompositeLayout,
  type ExternalDirection,
  type Rect
} from '../src';

/**
 * Four substations in a row, a box-width apart: compact in box view, but their
 * detail drawings (three bays each) are far wider than a box, so laid out from
 * the same positions they'd overlap.
 */
function rowDoc(opts: { boxMode?: boolean; routing?: 'orthogonal' | 'straight' } = {}) {
  const ids = ['alpha', 'bravo', 'charlie', 'delta'];
  /** One line bay in `col`, its feeder leaving towards `direction`. */
  const bay = (id: string, col: number, label: string, direction: ExternalDirection): BaySpec => ({
    col,
    positions: [
      { type: 'line', row: 1, feeder: { asset: 'line', label, direction, id: `${id}-${label.toLowerCase()}` } }
    ]
  });
  const sub = (id: string, i: number) =>
    buildDocument({
      meta: { id, name: id.toUpperCase(), substation: id, voltageKv: 220 },
      busbars: [{ label: 'BB', row: 0 }],
      bays: [
        ...(i > 0 ? [bay(id, 0, 'W', 'left')] : []),
        bay(id, 1, 'S', 'down'),
        ...(i < ids.length - 1 ? [bay(id, 2, 'E', 'right')] : [])
      ]
    });
  const res = new MapResolver(new Map(ids.map((id, i) => [id, Serializer.toJSON(sub(id, i))])));
  const doc = new CompositeDocument({
    id: 'row',
    name: 'Row',
    boxMode: opts.boxMode ?? false,
    defaultRouting: opts.routing ?? 'orthogonal'
  });
  ids.forEach((id, i) => doc.addChild(DiagramInstance.of({ id, libraryId: id, x: i * 260, y: 0 })));
  const anchor = (instanceId: string, connectionId: string) => ({ kind: 'anchor' as const, instanceId, connectionId });
  for (let i = 0; i < ids.length - 1; i++) {
    const [a, b] = [ids[i], ids[i + 1]];
    doc.addLine(new CompositeLine(`l-${a}-${b}`, [anchor(a, `${a}-e`), anchor(b, `${b}-w`)]));
  }
  doc.resolveChildren(res);
  return doc;
}

const plain = () => new CompositeLayoutEngine();
const spreading = (gap?: number) =>
  new CompositeLayoutEngine(undefined, undefined, undefined, { detailSpread: gap === undefined ? {} : { gap } });

const gapBetween = (a: Rect, b: Rect) =>
  Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height));

const minGap = (layout: CompositeLayout) => {
  let min = Infinity;
  const c = layout.children;
  for (let i = 0; i < c.length; i++)
    for (let j = i + 1; j < c.length; j++) min = Math.min(min, gapBetween(c[i].worldBounds, c[j].worldBounds));
  return min;
};

const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const boxCentre = (child: ChildLayout) => ({
  x: child.instance.x + BOX_SIZE.width / 2,
  y: child.instance.y + BOX_SIZE.height / 2
});
const childOf = (layout: CompositeLayout, id: string) => layout.children.find((c) => c.instance.id === id)!;

describe('detail spread', () => {
  it('without the option, detail drawings overlap at their top-left, as before', () => {
    const layout = plain().layout(rowDoc());
    expect(minGap(layout)).toBeLessThan(0);
    for (const c of layout.children) expect(c.spreadOffset).toBeUndefined();
  });

  it('separates every detail drawing by the gap', () => {
    const layout = spreading().layout(rowDoc());
    expect(minGap(layout)).toBeGreaterThanOrEqual(DETAIL_SPREAD_GAP - 1e-6);
    const custom = spreading(100).layout(rowDoc());
    expect(minGap(custom)).toBeGreaterThanOrEqual(100 - 1e-6);
  });

  it('keeps the left-to-right order of the boxes', () => {
    const layout = spreading().layout(rowDoc());
    const xs = ['alpha', 'bravo', 'charlie', 'delta'].map((id) => centre(childOf(layout, id).worldBounds).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('places each drawing at its box centre plus its spread offset', () => {
    const layout = spreading().layout(rowDoc());
    for (const c of layout.children) {
      const d = c.spreadOffset ?? { x: 0, y: 0 };
      const home = boxCentre(c);
      expect(centre(c.worldBounds).x).toBeCloseTo(home.x + d.x);
      expect(centre(c.worldBounds).y).toBeCloseTo(home.y + d.y);
    }
    expect(layout.children.some((c) => c.spreadOffset)).toBe(true);
  });

  it('never moves a fixed child: it sits on its box centre', () => {
    const layout = spreading().layout(rowDoc(), { fixed: ['bravo'] });
    const bravo = childOf(layout, 'bravo');
    expect(bravo.spreadOffset).toBeUndefined();
    expect(centre(bravo.worldBounds).x).toBeCloseTo(boxCentre(bravo).x);
    expect(minGap(layout)).toBeGreaterThanOrEqual(DETAIL_SPREAD_GAP - 1e-6);
  });

  it('adopting the offset into x/y keeps the child where it was shown', () => {
    const doc = rowDoc();
    const engine = spreading();
    const before = childOf(engine.layout(doc), 'delta');
    const d = before.spreadOffset!;
    doc.setChildTransform('delta', before.instance.x + d.x, before.instance.y + d.y, 0);
    const after = childOf(engine.layout(doc, { fixed: ['delta'] }), 'delta');
    expect(after.worldBounds.x).toBeCloseTo(before.worldBounds.x);
    expect(after.worldBounds.y).toBeCloseTo(before.worldBounds.y);
  });

  it('leaves the box view untouched', () => {
    const a = spreading().layout(rowDoc({ boxMode: true }));
    const b = plain().layout(rowDoc({ boxMode: true }));
    expect(a.children.map((c) => c.worldBounds)).toEqual(b.children.map((c) => c.worldBounds));
    expect(a.lines.map((l) => l.points)).toEqual(b.lines.map((l) => l.points));
  });

  it('anchors lines to the spread drawings’ feeder tips', () => {
    const layout = spreading().layout(rowDoc());
    for (const ln of layout.lines) {
      const [first, last] = [ln.points[0], ln.points[ln.points.length - 1]];
      const anchors = ln.line.vertices.filter((v) => v.kind === 'anchor');
      const tip = (i: number) => {
        const v = anchors[i];
        if (v.kind !== 'anchor') throw new Error('anchor expected');
        return layout.snapTips.find((t) => t.instanceId === v.instanceId && t.connectionId === v.connectionId)!.point;
      };
      expect(Math.hypot(first.x - tip(0).x, first.y - tip(0).y)).toBeLessThan(1);
      expect(Math.hypot(last.x - tip(1).x, last.y - tip(1).y)).toBeLessThan(1);
    }
  });

  it('also spreads plain (straight, fixed-connector) composites', () => {
    const layout = spreading().layout(rowDoc({ routing: 'straight' }));
    expect(minGap(layout)).toBeGreaterThanOrEqual(DETAIL_SPREAD_GAP - 1e-6);
  });

  it('exports what the canvas shows (same engine)', () => {
    const doc = rowDoc();
    const svgWidth = (engine: CompositeLayoutEngine) =>
      Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(new CompositeSvgExporter(engine).export(doc))![1]);
    // The export frames the layout's bounds plus a fixed margin, whichever engine.
    const margin = (engine: CompositeLayoutEngine) => svgWidth(engine) - engine.layout(doc).bounds.width;
    expect(margin(spreading())).toBeCloseTo(margin(plain()), 0);
    expect(svgWidth(spreading())).toBeGreaterThan(svgWidth(plain()));
  });

  it('re-uses the last solution when nothing moved', () => {
    const doc = rowDoc();
    const engine = spreading();
    const a = engine.layout(doc);
    const b = engine.layout(doc);
    expect(b.children.map((c) => c.spreadOffset)).toEqual(a.children.map((c) => c.spreadOffset));
  });
});
