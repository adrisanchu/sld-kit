import { describe, it, expect } from 'vitest';
import {
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSvgExporter,
  Connection,
  DiagramInstance,
  DuplicateIdError,
  LayoutEngine,
  MapResolver,
  Serializer,
  SldParseError,
  SvgExporter,
  buildDocument,
  connectionForExternalId,
  linkFormat,
  type ExternalDirection,
  type SldDocument
} from '../src';

/** One bay feeding a three-winding transformer: main end "220 kV" (id T), branch "33 kV" (id T-33). */
function level400(direction: ExternalDirection = 'up'): SldDocument {
  return buildDocument({
    meta: { id: 'L400', name: '400 kV' },
    busbars: [{ label: 'BB1', row: 1 }],
    bays: [
      {
        col: 0,
        positions: [
          {
            id: 'bay',
            type: 'transformer',
            row: direction === 'up' ? 0 : 2,
            feeder: {
              asset: 'transformer3w',
              label: '220 kV',
              id: 'T',
              direction,
              tap: direction === 'up' ? 'above' : 'below',
              branch: { label: '33 kV', id: 'T-33' },
              data: { tag: 'atp1' }
            }
          }
        ]
      }
    ]
  });
}

/** A plain level with one transformer feeder whose id is `fid`. */
function level(id: string, fid: string, label: string): SldDocument {
  return buildDocument({
    meta: { id, name: id },
    busbars: [{ label: 'BB1', row: 1 }],
    bays: [
      {
        col: 0,
        positions: [{ type: 'transformer', row: 0, feeder: { asset: 'transformer', label, id: fid, tap: 'above' } }]
      }
    ]
  });
}

describe('three-winding transformer: model', () => {
  it('roundtrips the branch with the feeder', () => {
    const json = Serializer.toJSON(level400());
    expect(Serializer.check(json).ok).toBe(true);
    const conn = Serializer.fromJSON(json).getElement('T') as Connection;
    expect(conn.to).toMatchObject({
      kind: 'external',
      asset: 'transformer3w',
      label: '220 kV',
      branch: { id: 'T-33', label: '33 kV' }
    });
  });

  it('requires a branch on transformer3w and rejects it elsewhere', () => {
    const json = Serializer.toJSON(level400());
    const feeder = json.elements.find((e) => e.id === 'T')!;
    if (feeder.kind !== 'connection' || feeder.to.kind !== 'external') throw new Error('fixture');

    const noBranch = structuredClone(json);
    const nb = noBranch.elements.find((e) => e.id === 'T')!;
    if (nb.kind === 'connection' && nb.to.kind === 'external') delete nb.to.branch;
    expect(
      Serializer.check(noBranch)
        .errors.map((e) => e.message)
        .join()
    ).toMatch(/needs a branch/);

    const onLine = structuredClone(json);
    const ol = onLine.elements.find((e) => e.id === 'T')!;
    if (ol.kind === 'connection' && ol.to.kind === 'external') ol.to.asset = 'line';
    expect(
      Serializer.check(onLine)
        .errors.map((e) => e.message)
        .join()
    ).toMatch(/only a three-winding transformer/);
  });

  it('treats branch ids like element ids: unique in the document', () => {
    const json = Serializer.toJSON(level400());
    const f = json.elements.find((e) => e.id === 'T')!;
    if (f.kind === 'connection' && f.to.kind === 'external' && f.to.branch) f.to.branch.id = 'bay';
    expect(
      Serializer.check(json)
        .errors.map((e) => e.message)
        .join()
    ).toMatch(/branch id "bay" is already used/);
  });

  it('finds the owning connection from either external id', () => {
    const doc = level400();
    expect(connectionForExternalId(doc, 'T')?.id).toBe('T');
    expect(connectionForExternalId(doc, 'T-33')?.id).toBe('T');
    expect(connectionForExternalId(doc, 'nope')).toBeUndefined();
  });
});

describe('three-winding transformer: buildDocument', () => {
  it('generates a branch id when none is given, and checks branch ids for clashes', () => {
    const doc = buildDocument({
      busbars: [{ label: 'BB1', row: 1 }],
      bays: [
        {
          col: 0,
          positions: [
            { type: 'x', row: 0, feeder: { asset: 'transformer3w', label: 'A', id: 'f', branch: { label: 'B' } } }
          ]
        }
      ]
    });
    const conn = doc.getElement('f') as Connection;
    expect(conn.to.kind === 'external' && conn.to.branch?.id).toMatch(/.+/);

    expect(() =>
      buildDocument({
        busbars: [{ label: 'BB1', row: 1 }],
        bays: [
          {
            col: 0,
            positions: [
              {
                type: 'x',
                row: 0,
                feeder: { asset: 'transformer3w', label: 'A', id: 'f', branch: { label: 'B', id: 'f' } }
              }
            ]
          }
        ]
      })
    ).toThrow(DuplicateIdError);
  });

  it('rejects a mismatched spec at runtime too (JSON / generated input)', () => {
    const spec = {
      busbars: [{ label: 'BB1', row: 1 }],
      bays: [{ col: 0, positions: [{ type: 'x', row: 0, feeder: { asset: 'transformer3w', label: 'A' } }] }]
    };
    expect(() => buildDocument(spec as Parameters<typeof buildDocument>[0])).toThrow(SldParseError);

    // …and a branch on a two-winding asset.
    const onLine = {
      busbars: [{ label: 'BB1', row: 1 }],
      bays: [{ col: 0, positions: [{ type: 'x', row: 0, feeder: { asset: 'line', label: 'A', branch: { label: 'B' } } }] }]
    };
    expect(() => buildDocument(onLine as Parameters<typeof buildDocument>[0])).toThrow(/only a three-winding transformer/);
  });

  it('types the variant: branch required on transformer3w, refused elsewhere', () => {
    const ok: Parameters<typeof buildDocument>[0]['bays'][number]['positions'][number]['feeder'] = {
      asset: 'transformer3w',
      label: 'A',
      branch: { label: 'B' }
    };
    // @ts-expect-error — a three-winding feeder needs its branch
    const missing: typeof ok = { asset: 'transformer3w', label: 'A' };
    // @ts-expect-error — only a three-winding feeder has a branch
    const extra: typeof ok = { asset: 'line', label: 'A', branch: { label: 'B' } };
    expect([ok, missing, extra]).toHaveLength(3);
  });
});

describe('three-winding transformer: layout and export', () => {
  it('draws the branch to the right of an up/down feeder, its label after the arrow', () => {
    const layout = new LayoutEngine().layout(level400('up'));
    const geo = layout.geometry.get('T');
    if (geo?.kind !== 'connection' || !geo.symbol || !geo.branch) throw new Error('no branch geometry');
    expect(geo.symbol.key).toBe('external:transformer3w');
    const [start, end] = geo.branch.points;
    expect(start.x).toBeGreaterThan(geo.symbol.box.x + geo.symbol.box.width / 2); // leaves the side circle
    expect(start.y).toBe(end.y); // horizontal stub
    expect(geo.branch.arrow.angle).toBe(0);
    expect(geo.branch.labelAt.anchor).toBe('start');
    const labelRight = geo.branch.labelAt.at.x + '33 kV'.length * 12 * 0.62;
    expect(layout.size.width).toBeGreaterThanOrEqual(labelRight); // the canvas fits the label
  });

  it('drops the branch below a left/right feeder', () => {
    const doc = level400('up');
    const conn = doc.getElement('T') as Connection;
    doc.replaceElement({ ...conn.toJSON(), to: { ...conn.to, direction: 'right' } } as ReturnType<
      Connection['toJSON']
    >);
    const geo = new LayoutEngine().layout(doc).geometry.get('T');
    if (geo?.kind !== 'connection' || !geo.branch) throw new Error('no branch geometry');
    expect(geo.branch.arrow.angle).toBe(90);
    expect(geo.branch.points[0].x).toBe(geo.branch.points[1].x); // vertical stub
  });

  it('exports both ends office-safe', () => {
    const svg = new SvgExporter().export(level400());
    expect(svg).toContain('>220 kV<');
    expect(svg).toContain('>33 kV<');
    expect(svg).toContain('cx="17.4"'); // the third circle
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('currentColor');
  });

  it('leaves two-winding documents unchanged (no branch geometry)', () => {
    const geo = new LayoutEngine().layout(level('L220', 'T', '400 kV')).geometry.get('T');
    expect(geo?.kind === 'connection' && geo.branch).toBeUndefined();
  });
});

describe('three-winding transformer: composites', () => {
  function threeLevels(boxMode: boolean) {
    const docs = [level400(), level('L220', 'T', '400 kV'), level('L33', 'T-33', '400 kV')];
    const c = new CompositeDocument({
      id: 'c',
      name: 'c',
      boxMode,
      ...(boxMode ? { defaultRouting: 'orthogonal' as const } : {})
    });
    c.addChild(DiagramInstance.of({ id: 'a', libraryId: 'L400', x: 0, y: 0 }));
    c.addChild(DiagramInstance.of({ id: 'b', libraryId: 'L220', x: 0, y: 600 }));
    c.addChild(DiagramInstance.of({ id: 'm', libraryId: 'L33', x: 700, y: 0 }));
    c.resolveChildren(new MapResolver(new Map(docs.map((d) => [d.meta.id, Serializer.toJSON(d)]))));
    return c;
  }

  it.each([false, true])('links the main end and the branch to their own peers (boxMode %s)', (boxMode) => {
    const layout = new CompositeLayoutEngine().layout(threeLevels(boxMode));
    const links = layout.links.map((l) => [l.connectionId, l.a.instanceId, l.b.instanceId]);
    expect(links).toContainEqual(['T', 'a', 'b']); // 400 ↔ 220 through the main end
    expect(links).toContainEqual(['T-33', 'a', 'm']); // 400 ↔ 33 through the branch
    expect(
      layout.snapTips
        .filter((t) => t.instanceId === 'a')
        .map((t) => t.connectionId)
        .sort()
    ).toEqual(['T', 'T-33']);
  });

  it('styles a branch link from the owning connection', () => {
    const layout = new CompositeLayoutEngine().layout(threeLevels(false));
    const link = layout.links.find((l) => l.connectionId === 'T-33')!;
    const fmt = linkFormat(link, layout.children, (el) =>
      (el.data as { tag?: string } | undefined)?.tag === 'atp1' ? { dashArray: '2 2' } : undefined
    );
    expect(fmt).toEqual({ dashArray: '2 2' });
  });

  it('anchors a manual line on a branch end, and draws the three-circle glyph for a transformer3w line', () => {
    const doc = threeLevels(true);
    doc.addLine(
      new CompositeLine(
        'l3',
        [
          { kind: 'anchor', instanceId: 'a', connectionId: 'T-33' },
          { kind: 'anchor', instanceId: 'm', connectionId: 'T-33' }
        ],
        'transformer3w'
      )
    );
    const layout = new CompositeLayoutEngine().layout(doc);
    const line = layout.lines.find((l) => l.line.id === 'l3')!;
    expect(line.glyph?.key).toBe('external:transformer3w');
    expect(layout.links.map((l) => l.connectionId)).not.toContain('T-33'); // the line takes over
    expect(new CompositeSvgExporter().export(doc)).toContain('cx="17.4"');
  });
});
