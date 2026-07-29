import { describe, it, expect } from 'vitest';
import { Serializer, SldParseError, SldDocument, BusBar, Position, Connection, element, external } from '../src';
import { buildSouth400 } from './fixtures';

describe('Serializer.check (non-throwing, all errors)', () => {
  it('reports ok on a valid document', () => {
    const result = Serializer.check(Serializer.toJSON(buildSouth400()));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('collects multiple problems in one pass', () => {
    const json = {
      version: 2,
      meta: { id: 'd', name: 'x' },
      grid: { rows: 2, cols: 2 },
      elements: [
        { id: 'dup', kind: 'busbar', label: 'a', row: 0 },
        { id: 'dup', kind: 'busbar', label: 'b', row: 1 }, // duplicate id
        { id: 'p', kind: 'position', label: 'p', type: 'line', row: 9, col: 0 }, // row out of range
        { id: 'c', kind: 'connection', label: '', from: { kind: 'element', id: 'ghost' }, to: { kind: 'element', id: 'dup' } } // missing ref
      ]
    };
    const { ok, errors } = Serializer.check(json);
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.every((e) => e instanceof SldParseError)).toBe(true);
    const text = errors.map((e) => e.message).join('\n');
    expect(text).toMatch(/Duplicate id: dup/);
    expect(text).toMatch(/row out of range/);
    expect(text).toMatch(/references missing element ghost/);
  });

  it("first collected error matches fromJSON's thrown error", () => {
    const bad = { version: 99, meta: { id: 'a', name: 'x' }, grid: { rows: 0, cols: 0 }, elements: [] };
    const { errors } = Serializer.check(bad);
    expect(errors[0]).toBeInstanceOf(SldParseError);
    expect(() => Serializer.fromJSON(bad)).toThrow(errors[0].message);
  });
});

describe('SldDocument.validate (live document)', () => {
  it('returns [] for a well-formed document', () => {
    expect(buildSouth400().validate()).toEqual([]);
  });

  it('accepts placements in memory that it then reports as invalid', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 2 });
    doc.addElement(new BusBar('bar', 'BB', 0));
    // A position sharing the bus bar's row: accepted by addElement, caught by validate.
    doc.addElement(new Position('p', 'L1', 'line', 0, 0));
    const errors = doc.validate();
    expect(errors.map((e) => e.message).join('\n')).toMatch(/shares a row with a bus bar/);
  });

  it('flags a dangling connection endpoint', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 1 });
    doc.addElement(new BusBar('bar', 'BB', 0));
    doc.addElement(new Position('p', 'L1', 'line', 1, 0));
    doc.addElement(new Connection('c', '', element('p'), element('ghost')));
    expect(doc.validate().map((e) => e.message).join('\n')).toMatch(/references missing element ghost/);
  });

  it('is clean for a hand-wired bay built with the endpoint helpers', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 1 });
    doc.addElement(new BusBar('bar', 'BB', 0));
    doc.addElement(new Position('p', 'L1', 'line', 1, 0));
    doc.addElement(new Connection('c1', '', element('p'), element('bar')));
    doc.addElement(new Connection('c2', '', element('p'), external({ asset: 'line', label: 'FEEDER A', direction: 'down' })));
    expect(doc.validate()).toEqual([]);
  });
});
