import { describe, it, expect } from 'vitest';
import { SldDocument, BusBar, Position, Grid } from '../src';

/** Two bounding bars (rows 0 and 4) with a 4-col slot area between them. */
function gridDoc(): SldDocument {
  const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 5, cols: 4 });
  doc.addElement(new BusBar('bb-1', 'BB1', 0));
  doc.addElement(new BusBar('bb-2', 'BB2', 4));
  return doc;
}

describe('Grid occupancy', () => {
  it('reports free and occupied cells', () => {
    const doc = gridDoc();
    doc.addElement(new Position('p', 'L1', 'line', 1, 1));
    const grid = new Grid(doc);
    expect(grid.isFree({ row: 1, col: 1 })).toBe(false);
    expect(grid.occupant({ row: 1, col: 1 })).toBe('p');
    expect(grid.isFree({ row: 1, col: 2 })).toBe(true);
    expect(grid.occupant({ row: 1, col: 2 })).toBeNull();
  });

  it('treats bar rows as not slot rows', () => {
    const grid = new Grid(gridDoc());
    expect(grid.rowKind(0)).toBe('busbar');
    expect(grid.rowKind(1)).toBe('slots');
    expect(grid.busBarRows()).toEqual(new Set([0, 4]));
  });

  it('detects empty rows and columns', () => {
    const doc = gridDoc();
    doc.addElement(new Position('p', 'L1', 'line', 1, 1));
    const grid = new Grid(doc);
    expect(grid.isRowEmpty(2)).toBe(true);
    expect(grid.isRowEmpty(1)).toBe(false);
    expect(grid.isColEmpty(0)).toBe(true);
    expect(grid.isColEmpty(1)).toBe(false);
  });
});

describe('Grid.planMove', () => {
  it('moves a position into a free cell (single move)', () => {
    const doc = gridDoc();
    doc.addElement(new Position('p', 'L1', 'line', 1, 1));
    const plan = new Grid(doc).planMove('p', { row: 1, col: 2 });
    expect(plan).not.toBeNull();
    expect(plan!.moves).toEqual([{ id: 'p', from: { row: 1, col: 1 }, to: { row: 1, col: 2 } }]);
  });

  it('displaces the occupant chain when moving into an occupied same-row slot', () => {
    const doc = gridDoc();
    doc.addElement(new Position('a', 'A', 'line', 1, 1));
    doc.addElement(new Position('b', 'B', 'line', 1, 2));
    const plan = new Grid(doc).planMove('a', { row: 1, col: 2 });
    expect(plan).not.toBeNull();
    // Both the mover and the displaced occupant appear in the plan.
    expect(plan!.moves.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });
});
