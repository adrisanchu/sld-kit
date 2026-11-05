import { describe, it, expect } from 'vitest';
import {
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSvgExporter,
  DiagramInstance,
  MapResolver,
  Serializer,
  buildDocument,
  type ExternalAssetKind
} from '../src';

/** A one-bar child whose bays each feed one asset (feeder id = `${id}-${asset}`). */
/** Two-winding assets only: a `transformer3w` feeder also needs its `branch`. */
type SimpleAsset = Exclude<ExternalAssetKind, 'transformer3w'>;

function child(id: string, feeders: { asset: SimpleAsset; label: string; fid?: string }[]) {
  return buildDocument({
    meta: { id, name: id },
    busbars: [{ label: 'BB', row: 1 }],
    bays: feeders.map((f, col) => ({
      col,
      positions: [
        {
          type: f.asset,
          row: 0,
          feeder: { asset: f.asset, label: f.label, direction: 'up', tap: 'above', id: f.fid ?? `${id}-${f.asset}` }
        }
      ]
    }))
  });
}

function composite(boxMode: boolean) {
  const north = child('north', [
    { asset: 'line', label: 'TO SOUTH', fid: 'tie' }, // auto-linked to south
    { asset: 'renewable', label: 'WIND FARM' },
    { asset: 'demand', label: 'LOAD' },
    { asset: 'reactor', label: 'R1' },
    { asset: 'machine', label: 'G1' },
    { asset: 'storage', label: 'BESS' },
    { asset: 'transformer', label: '132 kV' }, // a tie to another level: not hanging
    { asset: 'line', label: 'FAR AWAY' } // an unlinked line: not hanging
  ]);
  const south = child('south', [{ asset: 'line', label: 'TO NORTH', fid: 'tie' }]);
  const doc = new CompositeDocument({ id: 'c', name: 'c', boxMode, defaultRouting: 'orthogonal' });
  doc.addChild(DiagramInstance.of({ id: 'n', libraryId: 'north', x: 0, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 's', libraryId: 'south', x: 0, y: 600 }));
  doc.resolveChildren(new MapResolver(new Map([north, south].map((d) => [d.meta.id, Serializer.toJSON(d)]))));
  return doc;
}

describe('box view: hanging ties', () => {
  it('draws every hanging-asset feeder leaving its box, with glyph and label', () => {
    const layout = new CompositeLayoutEngine().layout(composite(true));
    expect(layout.hangers.map((h) => [h.connectionId, h.terminus.key, h.label?.text])).toEqual([
      ['north-renewable', 'external:renewable', 'WIND FARM'],
      ['north-demand', 'external:demand', 'LOAD'],
      ['north-reactor', 'external:reactor', 'R1'],
      ['north-machine', 'external:machine', 'G1'],
      ['north-storage', 'external:storage', 'BESS']
    ]);
    // Lines and transformers tie nodes: the shared line is an auto-link instead.
    expect(layout.links.map((l) => l.connectionId)).toEqual(['tie']);
  });

  it('leaves from the feeder port (the snap target) and ends at the glyph', () => {
    const layout = new CompositeLayoutEngine().layout(composite(true));
    const h = layout.hangers.find((x) => x.asset === 'reactor')!;
    const tip = layout.snapTips.find((t) => t.instanceId === 'n' && t.connectionId === 'north-reactor')!;
    expect(h.points[0]).toEqual(tip.point);
    expect(h.terminus.at).toEqual(h.points[h.points.length - 1]);
    expect(h.label!.at.y).toBeLessThan(h.terminus.at.y); // an up lead: label above the glyph
    expect(layout.bounds.y).toBeLessThanOrEqual(h.label!.at.y - 12); // the label is inside the bounds
  });

  it('yields to a manual line on the same feeder', () => {
    const doc = composite(true);
    doc.addLine(
      new CompositeLine(
        'l-load',
        [
          { kind: 'anchor', instanceId: 'n', connectionId: 'north-demand' },
          { kind: 'point', x: 0, y: 0 }
        ],
        'demand'
      )
    );
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.hangers.map((h) => h.connectionId)).not.toContain('north-demand');
    expect(layout.lines.map((l) => l.line.id)).toEqual(['l-load']);
  });

  it('is box view only: detail view and expanded children draw their own feeders', () => {
    expect(new CompositeLayoutEngine().layout(composite(false)).hangers).toEqual([]);
    expect(new CompositeLayoutEngine().layout(composite(true), { expanded: ['n'] }).hangers).toEqual([]);
  });

  it('exports the ties office-safe', () => {
    const svg = new CompositeSvgExporter().export(composite(true));
    expect(svg).toContain('>WIND FARM<');
    expect(svg).toContain('V 8.6 L 14.9 13.2'); // the machine glyph's "M"
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('currentColor');
  });
});
