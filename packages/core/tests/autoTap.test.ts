import { describe, it, expect } from 'vitest';
import {
  BusBar,
  Connection,
  LayoutEngine,
  Position,
  SLD_LAYOUT,
  Serializer,
  SldDocument,
  element,
  external,
  type ConnectionGeometry,
  type DiagramLayout,
  type ExternalDirection,
  type PositionGeometry
} from '../src';
import { buildSouth220 } from './fixtures';

const conn = (layout: DiagramLayout, id: string): ConnectionGeometry => {
  const geo = layout.geometry.get(id);
  if (geo?.kind !== 'connection') throw new Error(`no connection ${id}`);
  return geo;
};
const box = (layout: DiagramLayout, id: string): PositionGeometry => {
  const geo = layout.geometry.get(id);
  if (geo?.kind !== 'position') throw new Error(`no position ${id}`);
  return geo;
};
const barY = (layout: DiagramLayout, id: string): number => {
  const geo = layout.geometry.get(id);
  if (geo?.kind !== 'busbar') throw new Error(`no bar ${id}`);
  return geo.rect.y + geo.rect.height / 2;
};

/**
 * Double bus: BB1 (row 1), BB2 (row 2), one bay above (row 0) and one below
 * (row 3), each wired to both bars, with an "Automatic" (tap-less) feeder.
 */
function outerBays(dirAbove: ExternalDirection, dirBelow: ExternalDirection, tapAbove?: 'above' | 'below'): SldDocument {
  const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 4, cols: 2 });
  doc.addElement(new BusBar('bb-1', 'BB1', 1));
  doc.addElement(new BusBar('bb-2', 'BB2', 2));
  doc.addElement(new Position('p-up', 'UP', 'line', 0, 0));
  doc.addElement(new Position('p-dn', 'DN', 'line', 3, 1));
  for (const p of ['p-up', 'p-dn']) {
    doc.addElement(new Connection(`${p}-1`, '', element(p), element('bb-1')));
    doc.addElement(new Connection(`${p}-2`, '', element(p), element('bb-2')));
  }
  doc.addElement(
    new Connection('f-up', '', element('p-up', tapAbove), external({ asset: 'line', label: 'F UP', direction: dirAbove }))
  );
  doc.addElement(new Connection('f-dn', '', element('p-dn'), external({ asset: 'line', label: 'F DN', direction: dirBelow })));
  return doc;
}

describe('Automatic connection point (tap omitted)', () => {
  it('South 220 lays out the same with every feeder tap stripped as with the explicit taps', () => {
    const explicit = buildSouth220();
    const json = Serializer.toJSON(explicit);
    for (const el of json.elements) {
      if (el.kind !== 'connection') continue;
      for (const end of [el.from, el.to]) if (end.kind === 'element') delete end.tap;
    }
    const auto = Serializer.fromJSON(json);
    const engine = new LayoutEngine();
    const a = engine.layout(explicit);
    const b = engine.layout(auto);
    for (const c of explicit.connections()) expect(b.geometry.get(c.id), c.id).toEqual(a.geometry.get(c.id));
  });

  it('an up/down feeder leaves the far edge of an outer bay: bar → position → tie', () => {
    const layout = new LayoutEngine().layout(outerBays('up', 'down'));
    const up = conn(layout, 'f-up');
    const upBox = box(layout, 'p-up').rect;
    expect(up.dot).toBeUndefined();
    for (const p of up.points) expect(p.y).toBeLessThanOrEqual(upBox.y);

    const dn = conn(layout, 'f-dn');
    const dnBox = box(layout, 'p-dn').rect;
    expect(dn.dot).toBeUndefined();
    for (const p of dn.points) expect(p.y).toBeGreaterThanOrEqual(dnBox.y + dnBox.height);
  });

  it('a left/right feeder leaves an outer bay from its far edge, then turns in the gap beyond', () => {
    for (const [above, below] of [
      ['left', 'right'],
      ['right', 'left']
    ] as const) {
      const layout = new LayoutEngine().layout(outerBays(above, below));
      const up = conn(layout, 'f-up');
      const upBox = box(layout, 'p-up').rect;
      expect(up.dot).toBeUndefined();
      // Stem out of the top edge, then a run above the box: nothing between bay and BB1.
      expect(up.points[0]).toEqual({ x: upBox.x + upBox.width / 2, y: upBox.y });
      for (const p of up.points) expect(p.y).toBeLessThanOrEqual(upBox.y);
      expect(up.points[1].y).toBeLessThan(upBox.y);

      const dn = conn(layout, 'f-dn');
      const dnBox = box(layout, 'p-dn').rect;
      expect(dn.dot).toBeUndefined();
      expect(dn.points[0]).toEqual({ x: dnBox.x + dnBox.width / 2, y: dnBox.y + dnBox.height });
      for (const p of dn.points) expect(p.y).toBeGreaterThanOrEqual(dnBox.y + dnBox.height);
      expect(barY(layout, 'bb-2')).toBeLessThan(dnBox.y);
    }
  });

  it('side exits sharing an outer gap stack outward, shortest run innermost, without crossing', () => {
    // Three top-row bays, all leaving left: col 0 (shortest run) … col 2 (longest).
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 3 });
    doc.addElement(new BusBar('bb', 'BB', 1));
    for (const col of [0, 1, 2]) {
      doc.addElement(new Position(`p${col}`, `P${col}`, 'line', 0, col));
      doc.addElement(new Connection(`c${col}`, '', element(`p${col}`), element('bb')));
      doc.addElement(new Connection(`f${col}`, '', element(`p${col}`), external({ asset: 'line', label: `F${col}`, direction: 'left' })));
    }
    const layout = new LayoutEngine().layout(doc);
    const runY = (id: string) => conn(layout, id).points[1].y;
    // Distinct lanes, each further from the boxes than the last.
    expect(runY('f0')).toBeGreaterThan(runY('f1'));
    expect(runY('f1')).toBeGreaterThan(runY('f2'));
    // A stem only rises to its own lane, so it never reaches the inner lanes'
    // runs, which all end left of it: no stem crosses another run.
    for (const col of [1, 2]) {
      const stemX = conn(layout, `f${col}`).points[0].x;
      for (const inner of [0, 1].filter((c) => c < col)) {
        const run = conn(layout, `f${inner}`).points;
        expect(Math.max(run[0].x, run[run.length - 1].x)).toBeLessThan(stemX);
      }
    }
    // Every lane stays on the canvas.
    for (const col of [0, 1, 2]) expect(runY(`f${col}`)).toBeGreaterThan(0);
  });

  it("outer bays' up/down stems are carried past stacked lanes, glyph beyond them, canvas grown to fit", () => {
    // Top row: two left exits (two lanes) plus a straight up line; bottom row: a
    // right exit (one lane) plus a straight down demand with its glyph.
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 3 });
    doc.addElement(new BusBar('bb', 'BB', 1));
    const bay = (id: string, row: number, col: number, dir: ExternalDirection, asset: 'line' | 'demand' = 'line') => {
      doc.addElement(new Position(id, id, asset === 'line' ? 'line' : 'demand', row, col));
      doc.addElement(new Connection(`${id}-bb`, '', element(id), element('bb')));
      doc.addElement(new Connection(`f-${id}`, '', element(id), external({ asset, label: id, direction: dir })));
    };
    bay('up', 0, 0, 'up');
    bay('l1', 0, 1, 'left');
    bay('l2', 0, 2, 'left');
    bay('r', 2, 0, 'right');
    bay('dem', 2, 1, 'down', 'demand');
    const layout = new LayoutEngine().layout(doc);

    const topLane = Math.min(conn(layout, 'f-l1').points[1].y, conn(layout, 'f-l2').points[1].y);
    const up = conn(layout, 'f-up');
    expect(up.arrow!.at.y).toBeLessThan(topLane - 6); // tip clears the outermost lane's hop
    expect(up.labelAt!.at.y).toBeGreaterThan(0); // label still on the canvas

    const bottomLane = conn(layout, 'f-r').points[1].y;
    const dem = conn(layout, 'f-dem');
    expect(dem.symbol!.box.y).toBeGreaterThan(bottomLane + 6); // glyph beyond the lane
    expect(dem.arrow!.at.y).toBeGreaterThan(dem.symbol!.box.y + dem.symbol!.box.height);
    expect(dem.labelAt!.at.y).toBeLessThan(layout.size.height);
  });

  it('a diagram without far-edge lanes keeps its canvas and stems', () => {
    const layout = new LayoutEngine().layout(outerBays('up', 'down'));
    // Straight stems keep the default length, and the canvas its default margins.
    expect(box(layout, 'p-up').rect.y - conn(layout, 'f-up').arrow!.at.y).toBe(SLD_LAYOUT.externalStemLength);
    expect(conn(layout, 'f-dn').arrow!.at.y - (box(layout, 'p-dn').rect.y + SLD_LAYOUT.positionBoxHeight)).toBe(
      SLD_LAYOUT.externalStemLength
    );
    const { rows } = layout;
    expect(layout.rowBoundaryY(0)).toBe(SLD_LAYOUT.margin - SLD_LAYOUT.cellGapY / 2);
    expect(layout.size.height - layout.rowBoundaryY(rows)).toBe(SLD_LAYOUT.margin - SLD_LAYOUT.cellGapY / 2);
  });

  it('an explicit tap still wins: tap "below" on a bay above the bars junctions between bay and bar', () => {
    const layout = new LayoutEngine().layout(outerBays('up', 'down', 'below'));
    const up = conn(layout, 'f-up');
    const upBox = box(layout, 'p-up').rect;
    expect(up.dot).toBeDefined();
    expect(up.dot!.y).toBeGreaterThan(upBox.y + upBox.height);
    expect(up.dot!.y).toBeLessThan(barY(layout, 'bb-1'));
  });

  it('a bay between bars still taps toward mid-bay (breaker-and-a-half unchanged)', () => {
    // BB1 row 0, top bay row 1, central row 2, bottom bay row 3, BB2 row 4.
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 5, cols: 1 });
    doc.addElement(new BusBar('bb-1', 'BB1', 0));
    doc.addElement(new BusBar('bb-2', 'BB2', 4));
    doc.addElement(new Position('top', 'T', 'line', 1, 0));
    doc.addElement(new Position('mid', 'C', 'central', 2, 0));
    doc.addElement(new Position('bot', 'B', 'line', 3, 0));
    doc.addElement(new Connection('c1', '', element('bb-1'), element('top')));
    doc.addElement(new Connection('c2', '', element('top'), element('mid')));
    doc.addElement(new Connection('c3', '', element('mid'), element('bot')));
    doc.addElement(new Connection('c4', '', element('bot'), element('bb-2')));
    doc.addElement(new Connection('f', '', element('top'), external({ asset: 'line', label: 'F', direction: 'up' })));
    const layout = new LayoutEngine().layout(doc);
    const f = conn(layout, 'f');
    const top = box(layout, 'top').rect;
    const mid = box(layout, 'mid').rect;
    // Junction in the gap between the top bay and the central one.
    expect(f.dot).toBeDefined();
    expect(f.dot!.y).toBeGreaterThan(top.y + top.height);
    expect(f.dot!.y).toBeLessThan(mid.y);
  });
});
