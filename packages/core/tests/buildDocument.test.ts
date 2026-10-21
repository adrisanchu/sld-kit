import { describe, it, expect } from 'vitest';
import {
  buildDocument,
  SldParseError,
  DuplicateIdError,
  SldDocument,
  BusBar,
  Position,
  AddElementCommand,
  CommandStack,
  CompositeDocument,
  CompositeLine,
  DiagramInstance,
  type Endpoint
} from '../src';

const isExternal = (e: Endpoint): e is Extract<Endpoint, { kind: 'external' }> => e.kind === 'external';

/** The external endpoint of the feeder carrying `label`, if any. */
function feederFor(doc: ReturnType<typeof buildDocument>, label: string) {
  for (const c of doc.connections()) {
    for (const e of [c.from, c.to]) if (isExternal(e) && e.label === label) return { conn: c, ext: e };
  }
  return undefined;
}

/** A small, well-formed two-column diagram. */
function twoColumn() {
  return buildDocument({
    meta: { id: 'd', name: 'Test' },
    busbars: [
      { label: 'BB1', row: 0 },
      { label: 'BB2', row: 4 }
    ],
    bays: [
      {
        col: 0,
        positions: [
          { type: 'line', row: 1, feeder: { asset: 'line', label: 'FEEDER A' } },
          { type: 'central', row: 2 }
        ]
      },
      {
        col: 1,
        positions: [
          { type: 'renewable', row: 1, feeder: { asset: 'renewable', label: 'SOLAR' } },
          { type: 'central', row: 2 }
        ]
      }
    ]
  });
}

describe('buildDocument', () => {
  it('returns a validated document with the placed bars and bays', () => {
    const doc = twoColumn();
    expect(doc.validate()).toEqual([]);
    expect(doc.meta.id).toBe('d');
    expect(doc.busBars()).toHaveLength(2);
    expect(doc.positions()).toHaveLength(4);
  });

  it('auto-sizes the grid to fit the contents', () => {
    expect(twoColumn().grid).toEqual({ rows: 5, cols: 2 });
  });

  it('series-wires each column and attaches one feeder per bay', () => {
    const doc = twoColumn();
    // col0: BB1–line, line–central, central–BB2 (3) + col1 same (3) + 2 feeders
    expect(doc.connections()).toHaveLength(8);
    const feeders = doc.connections().filter((c) => isExternal(c.from) || isExternal(c.to));
    expect(feeders).toHaveLength(2);
  });

  it('auto-names unlabeled positions sequentially per type', () => {
    const doc = twoColumn();
    expect(doc.positions().map((p) => p.label)).toEqual(['line-1', 'central-1', 'ren-1', 'central-2']);
  });

  it('keeps explicit labels and does not collide auto-names with them', () => {
    const doc = buildDocument({
      busbars: [{ label: 'BB1', row: 0 }],
      bays: [
        {
          col: 0,
          positions: [
            { type: 'line', row: 1, label: 'line-5' },
            { type: 'line', row: 2 }
          ]
        }
      ]
    });
    // The explicit `line-5` bumps the auto counter past it (max suffix + 1).
    expect(doc.positions().map((p) => p.label)).toEqual(['line-5', 'line-6']);
  });

  it('attaches each feeder to the position it hangs off', () => {
    const doc = twoColumn();
    const line = doc.positions().find((p) => p.type === 'line')!;
    const ren = doc.positions().find((p) => p.type === 'renewable')!;
    const a = feederFor(doc, 'FEEDER A')!;
    const solar = feederFor(doc, 'SOLAR')!;
    const otherEnd = (c: typeof a.conn) => (isExternal(c.from) ? c.to : c.from);
    expect(otherEnd(a.conn)).toMatchObject({ kind: 'element', id: line.id });
    expect(otherEnd(solar.conn)).toMatchObject({ kind: 'element', id: ren.id });
  });

  it('supports several feeders in one column (top and bottom)', () => {
    const doc = buildDocument({
      busbars: [
        { label: 'BB1', row: 0 },
        { label: 'BB2', row: 4 }
      ],
      bays: [
        {
          col: 0,
          positions: [
            { type: 'line', row: 1, feeder: { asset: 'line', label: 'TOP' } }, // toward BB1
            { type: 'central', row: 2 },
            { type: 'line', row: 3, feeder: { asset: 'line', label: 'BOTTOM' } } // toward BB2
          ]
        }
      ]
    });
    expect(doc.validate()).toEqual([]);
    const feeders = doc.connections().filter((c) => isExternal(c.from) || isExternal(c.to));
    expect(feeders).toHaveLength(2);

    const topPos = doc.positions().find((p) => p.row === 1)!;
    const botPos = doc.positions().find((p) => p.row === 3)!;
    const otherEnd = (label: string) => {
      const { conn } = feederFor(doc, label)!;
      return isExternal(conn.from) ? conn.to : conn.from;
    };
    expect(otherEnd('TOP')).toMatchObject({ kind: 'element', id: topPos.id });
    expect(otherEnd('BOTTOM')).toMatchObject({ kind: 'element', id: botPos.id });
  });

  it('omits feeder direction so the layout derives it, unless given', () => {
    const derived = feederFor(twoColumn(), 'FEEDER A')!;
    expect(derived.ext.direction).toBeUndefined();

    const doc = buildDocument({
      busbars: [{ label: 'BB1', row: 0 }],
      bays: [{ col: 0, positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: 'F', direction: 'down' } }] }]
    });
    expect(feederFor(doc, 'F')!.ext.direction).toBe('down');
  });

  it('gives a feeder an explicit id when provided (for shared tie-lines)', () => {
    const doc = buildDocument({
      busbars: [{ label: 'BB1', row: 0 }],
      bays: [
        {
          col: 0,
          positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: 'TIE', id: 'shared-tie' } }]
        }
      ]
    });
    expect(doc.getElement('shared-tie')).toBeDefined();
    expect(feederFor(doc, 'TIE')!.conn.id).toBe('shared-tie');
  });

  it('throws SldParseError when the spec yields an invalid document', () => {
    expect(() =>
      buildDocument({
        busbars: [{ label: 'BB1', row: 0 }],
        // A position sharing the busbar's row is a structural violation.
        bays: [{ col: 0, positions: [{ type: 'line', row: 0 }] }]
      })
    ).toThrow(SldParseError);
  });

  it('applies naming-prefix overrides', () => {
    const doc = buildDocument({
      busbars: [{ label: 'BB1', row: 0 }],
      bays: [{ col: 0, positions: [{ type: 'line', row: 1 }] }],
      prefixes: { line: 'feeder' }
    });
    expect(doc.positions()[0].label).toBe('feeder-1');
  });
});

describe('buildDocument — explicit ids and data', () => {
  // Double bus with a coupler between the bars: a feeder above BB1, one below
  // BB2, the coupler wired to both bars.
  const doubleBus = () =>
    buildDocument({
      busbars: [
        { id: 'bb-1', label: 'BB1', row: 1, data: { busId: 1 } },
        { id: 'bb-2', label: 'BB2', row: 3, data: { busId: 2 } }
      ],
      bays: [
        { col: 0, positions: [{ id: 'p-up', type: 'line', row: 0, data: { tag: 'up' }, feeder: { asset: 'line', label: 'UP' } }] },
        { col: 1, positions: [{ id: 'cpl', type: 'central', row: 2 }] },
        { col: 2, positions: [{ id: 'p-dn', type: 'line', row: 4, feeder: { asset: 'line', label: 'DN' } }] }
      ]
    });
  const wiredTo = (doc: ReturnType<typeof buildDocument>, id: string) =>
    doc
      .connectionsOf(id)
      .flatMap((c) => c.elementIds())
      .filter((x) => x !== id)
      .sort();

  it('keeps explicit busbar/position ids and data', () => {
    const doc = doubleBus();
    expect(doc.getElement('bb-1')?.data).toEqual({ busId: 1 });
    expect(doc.getElement('bb-2')?.data).toEqual({ busId: 2 });
    expect(doc.getElement('p-up')?.data).toEqual({ tag: 'up' });
    expect(doc.getElement('cpl')?.data).toBeUndefined();
  });

  it('wires a coupler between two bars to both, and outer feeders to one bar', () => {
    const doc = doubleBus();
    expect(wiredTo(doc, 'cpl')).toEqual(['bb-1', 'bb-2']);
    expect(wiredTo(doc, 'p-up')).toEqual(['bb-1']);
    expect(wiredTo(doc, 'p-dn')).toEqual(['bb-2']);
  });
});

describe('Duplicate ids', () => {
  const bay = (col: number, id?: string, feederId?: string) => ({
    col,
    positions: [{ id, type: 'line' as const, row: 1, feeder: feederId ? { asset: 'line' as const, label: `F${col}`, id: feederId } : undefined }]
  });

  it('buildDocument without ids or data still just works (the quick first draft)', () => {
    const doc = buildDocument({ busbars: [{ label: 'BB', row: 0 }], bays: [bay(0), bay(1)] });
    expect(doc.positions()).toHaveLength(2);
    expect(doc.positions().every((p) => p.data === undefined)).toBe(true);
  });

  it('buildDocument reports every duplicate, with where it is, before building', () => {
    let err: unknown;
    try {
      buildDocument({
        busbars: [{ id: 'x', label: 'BB1', row: 0 }],
        bays: [bay(0, 'p'), bay(1, 'p'), bay(2, 'x'), bay(3, undefined, 'p')]
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DuplicateIdError);
    expect(err).toBeInstanceOf(SldParseError); // existing handlers keep working
    const dup = err as DuplicateIdError;
    expect(dup.ids.sort()).toEqual(['p', 'x']);
    expect(dup.message).toContain('duplicate id "p" (position col 0 row 1, position col 1 row 1, feeder "F3")');
    expect(dup.message).toContain('duplicate id "x" (busbar "BB1", position col 2 row 1)');
  });

  it('buildDocument deep-copies data, so elements never share an object', () => {
    const shared = { switch: { state: 'closed' } };
    const doc = buildDocument({
      busbars: [{ label: 'BB', row: 0, data: shared }],
      bays: [0, 1].map((col) => ({ col, positions: [{ id: `p${col}`, type: 'line', row: 1, data: shared }] }))
    });
    expect(doc.getElement('p0')!.data).toEqual(shared);
    expect(doc.getElement('p0')!.data).not.toBe(doc.getElement('p1')!.data);
    expect(doc.getElement('p0')!.data).not.toBe(shared);
  });

  it('addElement rejects a taken id and leaves the document unchanged', () => {
    const doc = new SldDocument(undefined, { rows: 2, cols: 1 });
    doc.addElement(BusBar.of({ id: 'bb', label: 'BB', row: 0 }));
    expect(() => doc.addElement(Position.of({ id: 'bb', type: 'line', row: 1, col: 0 }))).toThrow(DuplicateIdError);
    expect(doc.all()).toHaveLength(1);
    expect(doc.getElement('bb')).toBeInstanceOf(BusBar);
  });

  it('a rejected AddElementCommand never enters undo history', () => {
    const doc = new SldDocument(undefined, { rows: 2, cols: 1 });
    const stack = new CommandStack<SldDocument>();
    stack.execute(new AddElementCommand(BusBar.of({ id: 'bb', label: 'BB', row: 0 })), doc);
    expect(() => stack.execute(new AddElementCommand(BusBar.of({ id: 'bb', label: 'BB', row: 1 })), doc)).toThrow(DuplicateIdError);
    expect(doc.all()).toHaveLength(1);
    stack.undo(doc); // undoes the first (successful) add, not the rejected one
    expect(doc.all()).toHaveLength(0);
    expect(stack.canUndo).toBe(false);
  });

  it('composites reject duplicate child and line ids', () => {
    const doc = new CompositeDocument({ id: 'c', name: 'c' });
    doc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'lib', x: 0, y: 0 }));
    expect(() => doc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'other', x: 9, y: 9 }))).toThrow(DuplicateIdError);
    expect(doc.getChild('a')!.libraryId).toBe('lib');
    const pts = [
      { kind: 'point' as const, x: 0, y: 0 },
      { kind: 'point' as const, x: 1, y: 1 }
    ];
    doc.addLine(new CompositeLine('l', pts));
    expect(() => doc.addLine(new CompositeLine('l', pts, 'cable'))).toThrow(DuplicateIdError);
    expect(doc.getLine('l')!.kind).toBe('line');
  });
});
