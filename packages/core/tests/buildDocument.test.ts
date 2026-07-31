import { describe, it, expect } from 'vitest';
import { buildDocument, SldParseError, type Endpoint } from '../src';

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
          { type: 'line', row: 1 },
          { type: 'central', row: 2 }
        ],
        feeder: { asset: 'line', label: 'FEEDER A' }
      },
      {
        col: 1,
        positions: [
          { type: 'renewable', row: 1 },
          { type: 'central', row: 2 }
        ],
        feeder: { asset: 'renewable', label: 'SOLAR' }
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

  it('attaches the feeder to the position whose type matches the asset', () => {
    const doc = twoColumn();
    const line = doc.positions().find((p) => p.type === 'line')!;
    const ren = doc.positions().find((p) => p.type === 'renewable')!;
    const a = feederFor(doc, 'FEEDER A')!;
    const solar = feederFor(doc, 'SOLAR')!;
    const otherEnd = (c: typeof a.conn) => (isExternal(c.from) ? c.to : c.from);
    expect(otherEnd(a.conn)).toMatchObject({ kind: 'element', id: line.id });
    expect(otherEnd(solar.conn)).toMatchObject({ kind: 'element', id: ren.id });
  });

  it('omits feeder direction so the layout derives it, unless given', () => {
    const derived = feederFor(twoColumn(), 'FEEDER A')!;
    expect(derived.ext.direction).toBeUndefined();

    const doc = buildDocument({
      busbars: [{ label: 'BB1', row: 0 }],
      bays: [{ col: 0, positions: [{ type: 'line', row: 1 }], feeder: { asset: 'line', label: 'F', direction: 'down' } }]
    });
    expect(feederFor(doc, 'F')!.ext.direction).toBe('down');
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
