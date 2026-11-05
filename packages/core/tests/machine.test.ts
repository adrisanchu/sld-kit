import { describe, it, expect } from 'vitest';
import {
  AddPositionCommand,
  BusBar,
  CommandStack,
  Connection,
  Position,
  Serializer,
  SldDocument,
  SvgExporter,
  buildDocument,
  createDefaultSymbolRegistry
} from '../src';

describe('synchronous machine external asset', () => {
  const doc = () =>
    buildDocument({
      busbars: [{ label: 'BB1', row: 1 }],
      bays: [{ col: 0, positions: [{ type: 'machine', row: 0, feeder: { asset: 'machine', label: 'G1', id: 'f' } }] }]
    });

  it('validates and roundtrips', () => {
    const json = Serializer.toJSON(doc());
    expect(Serializer.check(json).ok).toBe(true);
    const feeder = Serializer.fromJSON(json).getElement('f');
    expect(feeder instanceof Connection && feeder.to).toMatchObject({ kind: 'external', asset: 'machine' });
  });

  it('draws a circle with "SM" (shapes only, office-safe)', () => {
    const def = createDefaultSymbolRegistry().get('external:machine');
    expect(def?.shapes.map((s) => s.type)).toEqual(['circle', 'path', 'path']);
    const svg = new SvgExporter().export(doc());
    expect(svg).toContain('V 8.6 L 14.9 13.2'); // the "M"
    expect(svg).not.toContain('<text>SM');
    expect(svg).not.toContain('currentColor');
  });

  it('is auto-spawned by a machine-typed bay, auto-named mac-N', () => {
    const d = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 1 });
    d.addElement(new BusBar('bb-1', 'BB1', 0));
    d.addElement(new BusBar('bb-2', 'BB2', 2));
    new CommandStack().execute(new AddPositionCommand(new Position('p', 'X', 'machine', 1, 0)), d);
    const feeder = d.connectionsOf('p').find((c) => c.to.kind === 'external');
    expect(feeder?.to.kind === 'external' && [feeder.to.asset, feeder.to.label]).toEqual(['machine', 'mac-1']);
  });
});
