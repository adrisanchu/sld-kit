import { describe, it, expect } from 'vitest';
import { SldDocument, BusBar, Position, CommandStack, AddPositionCommand, autoWire } from '../src';

/**
 * Normalize a document's connections to an order-, id- and label-independent
 * signature so two differently-authored documents can be compared purely on
 * topology: each connection becomes a sorted pair of `el:<id>` / `ext:<asset>`
 * endpoints. This ignores connection ids, labels, direction and tap — exactly
 * the details autoWire mints fresh — leaving only who is wired to whom.
 */
function connTopology(doc: SldDocument): string[] {
  return doc
    .connections()
    .map((c) =>
      [c.from, c.to]
        .map((e) => (e.kind === 'element' ? `el:${e.id}` : `ext:${e.asset}`))
        .sort()
        .join('~')
    )
    .sort();
}

/** A single-busbar document with three bays stacked in one column, unwired. */
function stackDoc(): SldDocument {
  const doc = new SldDocument({ id: 'd', name: 'x' });
  doc.addElement(new BusBar('bb', 'BB', 0));
  doc.addElement(new Position('a', 'A', 'line', 1, 0));
  doc.addElement(new Position('b', 'B', 'central', 2, 0));
  doc.addElement(new Position('c', 'C', 'line', 3, 0));
  return doc;
}

/**
 * A breaker-and-a-half layout (two bars, three columns of stacked bays) used to
 * cross-check batch wiring. Placements only — no connections.
 */
const WEST_LIKE_BARS = [
  { id: 'bb-1', label: 'BB1', row: 0 },
  { id: 'bb-2', label: 'BB2', row: 4 }
];
const WEST_LIKE_POSITIONS: Array<{ id: string; label: string; type: string; row: number; col: number }> = [
  { id: 'c0', label: 'C1', type: 'central', row: 2, col: 0 },
  { id: 'c1', label: 'C2', type: 'central', row: 2, col: 1 },
  { id: 'c2', label: 'C3', type: 'central', row: 2, col: 2 },
  { id: 'l1', label: 'L1', type: 'line', row: 1, col: 0 },
  { id: 'sto1', label: 'S1', type: 'storage', row: 1, col: 1 },
  { id: 'dem1', label: 'D1', type: 'demand', row: 3, col: 1 },
  { id: 'l3', label: 'L3', type: 'line', row: 3, col: 2 }
];

describe('SldDocument.fitGrid', () => {
  it('sizes rows/cols to contain the current elements', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' });
    doc.addElement(new BusBar('bb', 'BB', 0));
    doc.addElement(new Position('p', 'P', 'line', 2, 3));
    doc.fitGrid();
    expect(doc.grid).toEqual({ rows: 3, cols: 4 });
  });

  it('accounts for colSpan when fitting columns', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' });
    doc.addElement(new Position('p', 'P', 'line', 0, 1, 3));
    doc.fitGrid();
    expect(doc.grid.cols).toBe(4); // col 1 + span 3
  });

  it('adds pad lanes on each axis when asked', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' });
    doc.addElement(new Position('p', 'P', 'line', 2, 3));
    doc.fitGrid({ pad: 1 });
    expect(doc.grid).toEqual({ rows: 4, cols: 5 });
  });

  it('tightens an oversized grid without moving elements', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 10, cols: 10 });
    doc.addElement(new Position('p', 'P', 'line', 1, 1));
    doc.fitGrid();
    expect(doc.grid).toEqual({ rows: 2, cols: 2 });
    const p = doc.getElement('p') as Position;
    expect({ row: p.row, col: p.col }).toEqual({ row: 1, col: 1 });
  });

  it('leaves an empty document at 0×0', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 5, cols: 5 });
    doc.fitGrid();
    expect(doc.grid).toEqual({ rows: 0, cols: 0 });
  });
});

describe('autoWire', () => {
  it('reproduces the topology of an AddPositionCommand sequence', () => {
    // Reference: author the same layout one bay at a time via AddPositionCommand
    // (an independent wiring path — centrals first, so outer bays split cleanly).
    const expected = new SldDocument({ id: 'w', name: 'x' }, { rows: 5, cols: 3 });
    for (const b of WEST_LIKE_BARS) expected.addElement(new BusBar(b.id, b.label, b.row));
    const stack = new CommandStack();
    for (const p of WEST_LIKE_POSITIONS) {
      stack.execute(new AddPositionCommand(new Position(p.id, p.label, p.type, p.row, p.col)), expected);
    }

    // Under test: place the same bars + bays with no connections, then batch-wire.
    const doc = new SldDocument({ id: 'w', name: 'x' }); // grid omitted → 0×0
    for (const b of WEST_LIKE_BARS) doc.addElement(new BusBar(b.id, b.label, b.row));
    for (const p of WEST_LIKE_POSITIONS) doc.addElement(new Position(p.id, p.label, p.type, p.row, p.col));
    autoWire(doc);

    expect(connTopology(doc)).toEqual(connTopology(expected));
    // fitGrid ran, so the place-first document matches the reference's grid.
    expect(doc.grid).toEqual(expected.grid);
  });

  it('wires each column as a series chain, skipping empty slots', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' });
    doc.addElement(new BusBar('bb', 'BB', 0));
    doc.addElement(new Position('a', 'A', 'line', 1, 0));
    doc.addElement(new Position('b', 'B', 'central', 3, 0)); // row 2 left empty
    autoWire(doc, { externals: false });
    expect(connTopology(doc)).toEqual(['el:a~el:bb', 'el:a~el:b'].sort());
  });

  it('spawns exactly one feeder per external-typed position', () => {
    const doc = stackDoc();
    autoWire(doc);
    const feeders = doc.connections().filter((c) => c.from.kind === 'external' || c.to.kind === 'external');
    // a and c are lines (external); b is central (no feeder)
    expect(feeders).toHaveLength(2);
    expect(doc.connectionsOf('b').every((c) => c.from.kind === 'element' && c.to.kind === 'element')).toBe(true);
  });

  it('skips all feeders when externals is false', () => {
    const doc = stackDoc();
    autoWire(doc, { externals: false });
    const feeders = doc.connections().filter((c) => c.from.kind === 'external' || c.to.kind === 'external');
    expect(feeders).toHaveLength(0);
  });

  it('never duplicates a link between adjacent bays', () => {
    const doc = stackDoc();
    autoWire(doc, { externals: false });
    const keys = connTopology(doc);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tops up a partially-wired document instead of double-wiring', () => {
    const doc = stackDoc();
    autoWire(doc, { externals: false });
    const first = connTopology(doc);
    autoWire(doc, { externals: false }); // second pass adds nothing
    expect(connTopology(doc)).toEqual(first);
  });

  it('auto-names spawned feeders sequentially per asset kind', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' });
    doc.addElement(new BusBar('bb', 'BB', 0));
    doc.addElement(new Position('a', 'A', 'line', 1, 0));
    doc.addElement(new Position('b', 'B', 'line', 1, 1));
    autoWire(doc);
    const labels = doc
      .connections()
      .flatMap((c) => [c.from, c.to])
      .filter((e) => e.kind === 'external')
      .map((e) => (e.kind === 'external' ? e.label : ''))
      .sort();
    expect(labels).toEqual(['line-1', 'line-2']);
  });
});
