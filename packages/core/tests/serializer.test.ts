import { describe, it, expect } from 'vitest';
import { Serializer, SldParseError, SLD_SCHEMA_VERSION, SldDocument, BusBar, Position } from '../src';
import { buildExampleHv } from './fixtures';

/** Deep clone through JSON, mimicking a localStorage save/load cycle. */
const cycle = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('Serializer roundtrip', () => {
  it('is stable: toJSON → fromJSON → toJSON deep-equals', () => {
    const doc = buildExampleHv();
    const json1 = Serializer.toJSON(doc);
    const restored = Serializer.fromJSON(cycle(json1));
    const json2 = Serializer.toJSON(restored);
    expect(json2).toEqual(json1);
  });

  it('preserves element count and ids', () => {
    const doc = buildExampleHv();
    const restored = Serializer.fromJSON(cycle(Serializer.toJSON(doc)));
    expect(
      restored
        .all()
        .map((e) => e.id)
        .sort()
    ).toEqual(
      doc
        .all()
        .map((e) => e.id)
        .sort()
    );
  });

  it('stamps the current schema version', () => {
    expect(Serializer.toJSON(buildExampleHv()).version).toBe(SLD_SCHEMA_VERSION);
  });
});

describe('Serializer validation', () => {
  it('throws SldParseError (English) on a non-object', () => {
    expect(() => Serializer.fromJSON(42)).toThrow(SldParseError);
    expect(() => Serializer.fromJSON(42)).toThrow(/valid JSON object/);
  });

  it('rejects a future schema version', () => {
    expect(() =>
      Serializer.fromJSON({ version: 99, meta: { id: 'a', name: 'x' }, grid: { rows: 0, cols: 0 }, elements: [] })
    ).toThrow(/Unsupported schema version/);
  });

  it('rejects duplicate ids', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 2 });
    const json = Serializer.toJSON(doc);
    json.elements = [
      { id: 'dup', kind: 'busbar', label: 'a', row: 0 },
      { id: 'dup', kind: 'busbar', label: 'b', row: 1 }
    ];
    expect(() => Serializer.fromJSON(json)).toThrow(/Duplicate id/);
  });

  it('rejects a position sharing a row with a bus bar', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 2 });
    const json = Serializer.toJSON(doc);
    json.elements = [
      { id: 'bar', kind: 'busbar', label: 'a', row: 0 },
      { id: 'pos', kind: 'position', label: 'p', type: 'line', row: 0, col: 0, colSpan: 1, subElements: [] }
    ];
    expect(() => Serializer.fromJSON(json)).toThrow(/shares a row/);
  });

  it('accepts an unknown (open) position type', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 2 });
    doc.addElement(new BusBar('bar', 'BB', 0));
    doc.addElement(new Position('p', 'coupling-1', 'coupling', 1, 0));
    const restored = Serializer.fromJSON(cycle(Serializer.toJSON(doc)));
    const pos = restored.positions()[0];
    expect(pos.type).toBe('coupling');
  });

  it('rejects an empty position type', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 2 });
    const json = Serializer.toJSON(doc);
    json.elements = [{ id: 'p', kind: 'position', label: 'p', type: '', row: 1, col: 0, colSpan: 1, subElements: [] }];
    expect(() => Serializer.fromJSON(json)).toThrow(/missing type/);
  });
});

describe('Serializer migrations', () => {
  it('upgrades a v1 document to v2 (identity widening)', () => {
    const v2 = Serializer.toJSON(buildExampleHv());
    const v1 = { ...cycle(v2), version: 1 };
    const restored = Serializer.fromJSON(v1);
    expect(Serializer.toJSON(restored).version).toBe(2);
  });

  it('rejects a version with no registered migration', () => {
    // Version 0 has no migration path.
    expect(() =>
      Serializer.fromJSON({ version: 0, meta: { id: 'a', name: 'x' }, grid: { rows: 0, cols: 0 }, elements: [] })
    ).toThrow(/No migration available from version 0/);
  });
});
