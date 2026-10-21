import { describe, it, expect } from 'vitest';
import { LayoutEngine, SLD_LAYOUT } from '../src';
import { buildSouth400 } from './fixtures';

describe('LayoutEngine', () => {
  it('produces a geometry entry for every element', () => {
    const doc = buildSouth400();
    const layout = new LayoutEngine().layout(doc);
    for (const el of doc.all()) {
      expect(layout.geometry.has(el.id), `missing geometry for ${el.id}`).toBe(true);
    }
  });

  it('cellAt is the inverse of cellRect centers', () => {
    const doc = buildSouth400();
    const layout = new LayoutEngine().layout(doc);
    for (const cell of [
      { row: 1, col: 0 },
      { row: 2, col: 3 },
      { row: 3, col: 1 }
    ]) {
      const rect = layout.cellRect(cell);
      const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      expect(layout.cellAt(center)).toEqual(cell);
    }
  });

  it('respects an injected layout config (wider cells shift geometry)', () => {
    const doc = buildSouth400();
    const base = new LayoutEngine().layout(doc);
    const wide = new LayoutEngine({ ...SLD_LAYOUT, cellWidth: SLD_LAYOUT.cellWidth + 40 }).layout(doc);
    expect(wide.size.width).toBeGreaterThan(base.size.width);
  });

  it('geometry is stable (snapshot)', () => {
    const doc = buildSouth400();
    const layout = new LayoutEngine().layout(doc);
    const serialized = [...layout.geometry.entries()]
      .map(([id, geo]) => [id, geo])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect({ size: layout.size, geometry: serialized }).toMatchSnapshot();
  });
});

describe('LayoutEngine — bus bar labels', () => {
  const barGeo = (layout: ReturnType<LayoutEngine['layout']>, id: string) => {
    const geo = layout.geometry.get(id);
    if (geo?.kind !== 'busbar') throw new Error(`no bar ${id}`);
    return geo;
  };

  it("defaults to the bar's own label, above its left end", () => {
    const geo = barGeo(new LayoutEngine().layout(buildSouth400()), 'bb-1');
    expect(geo.label).toBe('BB1');
    expect(geo.textAnchor).toBe('start');
    expect(geo.labelAt).toEqual({ x: geo.rect.x, y: geo.rect.y - 8 });
  });

  it('a busBarLabel resolver overrides the text (null keeps the label, "" hides it)', () => {
    const engine = new LayoutEngine(SLD_LAYOUT, {
      busBarLabel: (bar) => (bar.id === 'bb-1' ? '39770' : bar.id === 'bb-2' ? null : '')
    });
    const layout = engine.layout(buildSouth400());
    expect(barGeo(layout, 'bb-1').label).toBe('39770');
    expect(barGeo(layout, 'bb-2').label).toBe('BB2');
  });

  it("'center-left' puts the label before the bar and widens the margin to fit it", () => {
    const doc = buildSouth400();
    const base = new LayoutEngine().layout(doc);
    const long = 'A VERY LONG BUS BAR NAME';
    const left = new LayoutEngine({ ...SLD_LAYOUT, busBarLabelAnchor: 'center-left' }, { busBarLabel: () => long }).layout(doc);
    const geo = barGeo(left, 'bb-1');
    expect(geo.textAnchor).toBe('end');
    expect(geo.labelAt.x).toBeLessThan(geo.rect.x);
    // Vertically centred on the bar.
    expect(Math.abs(geo.labelAt.y - (geo.rect.y + geo.rect.height / 2))).toBeLessThan(SLD_LAYOUT.busLabelFontSize);
    // The estimated text fits inside the canvas, which grew to make room.
    const estWidth = long.length * SLD_LAYOUT.busLabelFontSize * 0.62;
    expect(geo.labelAt.x - estWidth).toBeGreaterThanOrEqual(0);
    expect(left.size.width).toBeGreaterThan(base.size.width);
  });
});
