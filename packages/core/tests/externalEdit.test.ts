import { describe, it, expect } from 'vitest';
import {
  AddPositionCommand,
  BusBar,
  CommandStack,
  DEFAULT_POSITION_TYPES,
  DEFAULT_THEME,
  EXTERNAL_ASSET_KINDS,
  EXTERNAL_POSITION_TYPES,
  Position,
  Serializer,
  SldDocument,
  buildDocument,
  nextPositionLabel,
  updateExternal,
  type ConnectionJson,
  type Endpoint,
  type ExternalEndpoint,
  type SldDocumentJson
} from '../src';

/** A one-bay document whose feeder is a three-winding transformer (the #79 repro). */
function transformer3wJson(): { json: SldDocumentJson; conn: ConnectionJson; side: 'from' | 'to' } {
  const doc = buildDocument({
    meta: { name: 't' },
    busbars: [{ row: 0, label: 'B1' }],
    bays: [
      {
        col: 0,
        positions: [
          {
            type: 'transformer',
            row: 1,
            feeder: { asset: 'transformer3w', label: '220 kV', id: 'T1', branch: { id: 'T1b', label: '33 kV' } }
          }
        ]
      }
    ]
  });
  const json = Serializer.toJSON(doc);
  const conn = json.elements.find(
    (e): e is ConnectionJson => e.kind === 'connection' && (e.to.kind === 'external' || e.from.kind === 'external')
  )!;
  return { json, conn, side: conn.to.kind === 'external' ? 'to' : 'from' };
}

const asExternal = (e: Endpoint): ExternalEndpoint => {
  if (e.kind !== 'external') throw new Error('expected an external endpoint');
  return e;
};

describe('updateExternal', () => {
  it('keeps a transformer3w branch when saving without changes (#79 regression)', () => {
    const { json, conn, side } = transformer3wJson();
    const prev = asExternal(conn[side]);
    conn[side] = updateExternal(prev, { asset: prev.asset, label: prev.label, direction: prev.direction });

    expect(Serializer.check(json).ok).toBe(true);
    expect(asExternal(conn[side]).branch).toEqual({ id: 'T1b', label: '33 kV' });
  });

  it('edits only the branch label when one is given', () => {
    const { json, conn, side } = transformer3wJson();
    const prev = asExternal(conn[side]);
    conn[side] = updateExternal(prev, { asset: 'transformer3w', label: '220 kV', branchLabel: ' 30 kV ' });

    expect(Serializer.check(json).ok).toBe(true);
    expect(asExternal(conn[side]).branch).toEqual({ id: 'T1b', label: '30 kV' });
  });

  it('drops the branch when switching away from transformer3w', () => {
    const { json, conn, side } = transformer3wJson();
    conn[side] = updateExternal(asExternal(conn[side]), { asset: 'line', label: '220 kV' });

    expect(Serializer.check(json).ok).toBe(true);
    expect('branch' in conn[side]).toBe(false);
  });

  it('mints a branch when switching to transformer3w', () => {
    const { json, conn, side } = transformer3wJson();
    conn[side] = updateExternal(asExternal(conn[side]), { asset: 'line', label: 'L' });
    conn[side] = updateExternal(asExternal(conn[side]), { asset: 'transformer3w', label: 'L' });

    expect(Serializer.check(json).ok).toBe(true);
    const branch = asExternal(conn[side]).branch!;
    expect(branch.label).toBe('L-3');
    expect(branch.id).toBeTruthy();
    expect(branch.id).not.toBe('T1b');
  });

  it('builds from scratch with direction and side, omitting the unset ones', () => {
    expect(updateExternal(undefined, { asset: 'reactor', label: 'R1', direction: 'down' })).toEqual({
      kind: 'external',
      asset: 'reactor',
      label: 'R1',
      direction: 'down'
    });
    expect(updateExternal(undefined, { asset: 'line', label: 'L', side: 'left' })).toEqual({
      kind: 'external',
      asset: 'line',
      label: 'L',
      side: 'left'
    });
  });
});

describe('EXTERNAL_ASSET_KINDS / EXTERNAL_POSITION_TYPES', () => {
  it('every asset kind validates on a connection', () => {
    for (const asset of EXTERNAL_ASSET_KINDS) {
      const { json, conn, side } = transformer3wJson();
      conn[side] = updateExternal(asExternal(conn[side]), { asset, label: 'X' });
      expect(
        Serializer.check(json).errors.map((e) => e.message),
        asset
      ).toEqual([]);
    }
  });

  it('every external position type auto-spawns its external via AddPositionCommand', () => {
    for (const type of EXTERNAL_POSITION_TYPES) {
      const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 3 });
      doc.addElement(new BusBar('bb-1', 'BB1', 0));
      doc.addElement(new BusBar('bb-2', 'BB2', 2));
      new CommandStack().execute(new AddPositionCommand(new Position('p', 'X', type, 1, 1)), doc);
      const feeder = doc.connectionsOf('p').find((c) => c.from.kind === 'external' || c.to.kind === 'external');
      const ep = feeder && [feeder.from, feeder.to].find((e) => e.kind === 'external');
      expect(ep?.kind === 'external' ? ep.asset : undefined, type).toBe(type);
    }
  });

  it('every external position type is a default position type', () => {
    for (const type of EXTERNAL_POSITION_TYPES) expect(DEFAULT_POSITION_TYPES).toContain(type);
  });

  it('the default theme colors every default position type', () => {
    for (const type of DEFAULT_POSITION_TYPES) expect(DEFAULT_THEME.positionTypes[type], type).toBeDefined();
  });
});

describe('coupler position type', () => {
  it('is a default position type with its own colour, but never an external', () => {
    expect(DEFAULT_POSITION_TYPES).toContain('coupler');
    expect(DEFAULT_THEME.positionTypes.coupler).toBeDefined();
    expect(EXTERNAL_POSITION_TYPES as readonly string[]).not.toContain('coupler');
  });

  it('auto-names with the `cpl` prefix', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 3 });
    expect(nextPositionLabel(doc, 'coupler')).toBe('cpl-1');
    doc.addElement(new Position('c', 'cpl-1', 'coupler', 1, 0));
    expect(nextPositionLabel(doc, 'coupler')).toBe('cpl-2');
  });

  it('AddPositionCommand spawns no external for a coupler between two bars', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 3 });
    doc.addElement(new BusBar('bb-1', 'BB1', 0));
    doc.addElement(new BusBar('bb-2', 'BB2', 2));
    new CommandStack().execute(new AddPositionCommand(new Position('c', 'C', 'coupler', 1, 1)), doc);
    const conns = doc.connectionsOf('c');
    expect(conns.some((c) => c.from.kind === 'external' || c.to.kind === 'external')).toBe(false);
    expect(conns.flatMap((c) => c.elementIds()).filter((id) => id !== 'c').sort()).toEqual(['bb-1', 'bb-2']);
  });
});
