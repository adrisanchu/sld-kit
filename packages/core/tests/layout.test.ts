import { describe, it, expect } from 'vitest';
import { LayoutEngine, SLD_LAYOUT } from '../src';
import { buildExampleHv } from './fixtures';

describe('LayoutEngine', () => {
  it('produces a geometry entry for every element', () => {
    const doc = buildExampleHv();
    const layout = new LayoutEngine().layout(doc);
    for (const el of doc.all()) {
      expect(layout.geometry.has(el.id), `missing geometry for ${el.id}`).toBe(true);
    }
  });

  it('cellAt is the inverse of cellRect centers', () => {
    const doc = buildExampleHv();
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
    const doc = buildExampleHv();
    const base = new LayoutEngine().layout(doc);
    const wide = new LayoutEngine({ ...SLD_LAYOUT, cellWidth: SLD_LAYOUT.cellWidth + 40 }).layout(doc);
    expect(wide.size.width).toBeGreaterThan(base.size.width);
  });

  it('geometry is stable (snapshot)', () => {
    const doc = buildExampleHv();
    const layout = new LayoutEngine().layout(doc);
    const serialized = [...layout.geometry.entries()]
      .map(([id, geo]) => [id, geo])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect({ size: layout.size, geometry: serialized }).toMatchSnapshot();
  });
});
