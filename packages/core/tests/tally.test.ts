import { describe, it, expect } from 'vitest';
import {
  tallyPositions,
  tallyComposite,
  CompositeDocument,
  DiagramInstance,
  MapResolver,
  Serializer,
  SldDocument,
  Position,
  newId,
  type SldDocumentJson
} from '../src';
import { buildSouth400, buildSouth220, SOUTH_400_ID, SOUTH_220_ID } from './fixtures';

/** A tiny doc with the given positions (type + optional tag in `data`). */
function docWith(specs: { type: string; tag?: string }[]): SldDocument {
  const doc = new SldDocument({ name: 'T' }, { rows: 1, cols: specs.length });
  specs.forEach((s, col) =>
    doc.addElement(
      Position.of({ label: `P${col}`, type: s.type, row: 0, col, data: s.tag ? { tag: s.tag } : undefined })
    )
  );
  return doc;
}

const byTag = (p: Position) => (p.data as { tag?: string } | undefined)?.tag;

function resolver(): MapResolver {
  return new MapResolver(
    new Map<string, SldDocumentJson>([
      [SOUTH_400_ID, Serializer.toJSON(buildSouth400())],
      [SOUTH_220_ID, Serializer.toJSON(buildSouth220())]
    ])
  );
}

describe('tallyPositions', () => {
  it('counts by type, with everything in the uncategorised bucket by default', () => {
    const t = tallyPositions([docWith([{ type: 'line' }, { type: 'line' }, { type: 'renewable' }])]);
    expect(t.total).toBe(3);
    expect(t.byType).toEqual({ line: 2, renewable: 1 });
    expect(t.byCategory).toEqual({ '': 3 });
    expect(t.categories).toEqual(['']);
  });

  it('buckets by the consumer category and builds the cross-tab', () => {
    const t = tallyPositions(
      [
        docWith([{ type: 'line', tag: 'new' }, { type: 'line' }]),
        docWith([
          { type: 'renewable', tag: 'new' },
          { type: 'renewable', tag: 'future' }
        ])
      ],
      { category: byTag }
    );
    expect(t.total).toBe(4);
    expect(t.byCategory).toEqual({ new: 2, '': 1, future: 1 });
    expect(t.categories).toEqual(['new', '', 'future']);
    expect(t.cells).toEqual({ line: { new: 1, '': 1 }, renewable: { new: 1, future: 1 } });
    // Row and column sums agree with the totals.
    const rowSum = (type: string) => Object.values(t.cells[type]).reduce((a, b) => a + b, 0);
    expect(t.types.map(rowSum)).toEqual(t.types.map((type) => t.byType[type]));
  });

  it('orders default types canonically, custom types after in first-seen order', () => {
    const t = tallyPositions([docWith([{ type: 'zeta' }, { type: 'renewable' }, { type: 'alpha' }, { type: 'line' }])]);
    expect(t.types).toEqual(['line', 'renewable', 'zeta', 'alpha']);
  });

  it('is safe for keys that shadow Object.prototype', () => {
    const t = tallyPositions([docWith([{ type: 'constructor', tag: 'toString' }])], { category: byTag });
    expect(t.byType).toEqual({ constructor: 1 });
    expect(t.cells.constructor).toEqual({ toString: 1 });
  });
});

describe('tallyComposite', () => {
  it('aggregates every resolved child, one count per placed instance', () => {
    const solo400 = tallyPositions([buildSouth400()]).total;
    const solo220 = tallyPositions([buildSouth220()]).total;
    const doc = new CompositeDocument({ name: 'C' });
    doc.addChild(new DiagramInstance(newId(), SOUTH_400_ID, 0, 0, 0));
    doc.addChild(new DiagramInstance(newId(), SOUTH_400_ID, 500, 0, 0)); // placed twice
    doc.addChild(new DiagramInstance(newId(), SOUTH_220_ID, 0, 500, 0));
    doc.resolveChildren(resolver());

    const t = tallyComposite(doc);
    expect(t.diagrams).toBe(3);
    expect(t.unresolved).toBe(0);
    expect(t.total).toBe(2 * solo400 + solo220);
  });

  it('excludes unresolved children and reports them', () => {
    const doc = new CompositeDocument({ name: 'C' });
    doc.addChild(new DiagramInstance(newId(), SOUTH_400_ID, 0, 0, 0));
    doc.addChild(new DiagramInstance(newId(), 'missing', 500, 0, 0));
    doc.resolveChildren(resolver());

    const t = tallyComposite(doc);
    expect(t.diagrams).toBe(1);
    expect(t.unresolved).toBe(1);
    expect(t.total).toBe(tallyPositions([buildSouth400()]).total);
  });

  it('passes the category option through', () => {
    const doc = new CompositeDocument({ name: 'C' });
    doc.addChild(new DiagramInstance(newId(), SOUTH_400_ID, 0, 0, 0));
    doc.resolveChildren(resolver());
    const t = tallyComposite(doc, { category: (p) => (p.type === 'line' ? 'L' : undefined) });
    expect(t.byCategory.L).toBe(t.byType.line);
  });

  it('returns zeros for an empty composite', () => {
    const t = tallyComposite(new CompositeDocument({ name: 'C' }));
    expect(t).toMatchObject({ total: 0, diagrams: 0, unresolved: 0, types: [], categories: [] });
  });
});
