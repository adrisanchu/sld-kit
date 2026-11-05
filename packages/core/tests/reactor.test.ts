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
  createDefaultSymbolRegistry,
  element,
  external
} from '../src';

/** A bar, a `reactor` bay under it and its reactor feeder. */
function reactorDoc(): SldDocument {
  const doc = new SldDocument({ id: 'r', name: 'Reactor' }, { rows: 2, cols: 1 });
  doc.addElement(new BusBar('bb', 'BB1', 0));
  doc.addElement(new Position('rea', 'REA1', 'reactor', 1, 0));
  doc.addElement(new Connection('w', '', element('rea'), element('bb')));
  doc.addElement(
    new Connection('f', '', element('rea'), external({ asset: 'reactor', label: 'RPT1', direction: 'down' }))
  );
  return doc;
}

describe('reactor external asset', () => {
  it('validates and roundtrips', () => {
    const json = Serializer.toJSON(reactorDoc());
    expect(Serializer.check(json).ok).toBe(true);
    const back = Serializer.fromJSON(json);
    const feeder = back.getElement('f') as Connection;
    expect(feeder.to.kind === 'external' && feeder.to.asset).toBe('reactor');
  });

  it('has a default glyph the export draws (office-safe)', () => {
    expect(createDefaultSymbolRegistry().get('external:reactor')).toBeDefined();
    const svg = new SvgExporter().export(reactorDoc());
    expect(svg).toContain('C 17 2.5, 17 7.25, 12 7.25'); // first coil hump
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('currentColor');
  });

  it('is auto-spawned by a reactor-typed bay, auto-named rea-N', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 1 });
    doc.addElement(new BusBar('bb-1', 'BB1', 0));
    doc.addElement(new BusBar('bb-2', 'BB2', 2));
    new CommandStack().execute(new AddPositionCommand(new Position('p', 'X', 'reactor', 1, 0)), doc);
    const feeder = doc.connectionsOf('p').find((c) => c.to.kind === 'external');
    expect(feeder?.to.kind === 'external' && feeder.to.asset).toBe('reactor');
    expect(feeder?.to.kind === 'external' && feeder.to.label).toBe('rea-1');
  });

  it('is accepted as a buildDocument feeder', () => {
    const doc = buildDocument({
      busbars: [{ label: 'BB1', row: 1 }],
      bays: [{ col: 0, positions: [{ type: 'reactor', row: 0, feeder: { asset: 'reactor', label: 'RPT1' } }] }]
    });
    expect(doc.validate()).toEqual([]);
  });
});
