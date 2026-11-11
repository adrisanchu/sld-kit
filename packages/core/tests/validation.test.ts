import { describe, it, expect } from 'vitest';
import {
  Serializer,
  CompositeSerializer,
  SldParseError,
  SldDocument,
  BusBar,
  Position,
  Connection,
  element,
  external
} from '../src';
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

/** Deliberately untyped, so the cases below can plant wrong-typed values. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseJson = Record<string, any>;

/** A well-formed composite: two children and one anchored line. */
function validComposite(): LooseJson {
  return {
    version: 2,
    kind: 'composite',
    meta: { id: 'comp', name: 'Composite' },
    children: [
      { id: 'a', libraryId: 'lib-a', x: 0, y: 0, angleDeg: 0 },
      { id: 'b', libraryId: 'lib-b', x: 100, y: 0, angleDeg: 90, portDirections: { f1: 'up' } }
    ],
    lines: [
      {
        id: 'l1',
        kind: 'line',
        vertices: [
          { kind: 'anchor', instanceId: 'a', connectionId: 'f1' },
          { kind: 'point', x: 50, y: 50 },
          { kind: 'rel', t: 0.5, ox: 1, oy: 2 }
        ]
      }
    ]
  };
}

/** One problem per case: the message `validate()` throws (unchanged by the collecting refactor). */
const COMPOSITE_SINGLE_ERRORS: [string, (j: LooseJson) => unknown, string][] = [
  ['not an object', () => [], 'Composite is not a valid JSON object'],
  ['no version', (j) => ({ ...j, version: undefined }), 'Missing composite schema version number'],
  ['future version', (j) => ({ ...j, version: 99 }), 'Unsupported composite version 99 (maximum: 2)'],
  ['not a composite', (j) => ({ ...j, kind: 'diagram' }), 'Document is not a composite'],
  ['no meta', (j) => ({ ...j, meta: undefined }), 'Missing meta block'],
  ['bad meta.id', (j) => ({ ...j, meta: { name: 'x' } }), 'Invalid meta.id'],
  ['bad meta.name', (j) => ({ ...j, meta: { id: 'x' } }), 'Invalid meta.name'],
  ['no children', (j) => ({ ...j, children: undefined }), 'Missing child list'],
  ['child without id', (j) => void (j.children[0].id = ''), 'Child without id'],
  ['duplicate child id', (j) => void (j.children[1].id = 'a'), 'Duplicate child id: a'],
  ['bad libraryId', (j) => void (j.children[0].libraryId = 3), 'Child a: invalid libraryId'],
  ['bad transform', (j) => void (j.children[0].x = 'left'), 'Child a: invalid transform'],
  ['bad labelAnchor', (j) => void (j.children[0].labelAnchor = 'middle'), 'Child a: invalid labelAnchor'],
  ['bad labelDirection', (j) => void (j.children[0].labelDirection = 'up'), 'Child a: invalid labelDirection'],
  ['bad portDirections', (j) => void (j.children[1].portDirections = []), 'Child b: invalid portDirections'],
  [
    'bad port direction',
    (j) => void (j.children[1].portDirections = { f1: 'north' }),
    'Child b: invalid port direction "north" for f1'
  ],
  ['bad line list', (j) => ({ ...j, lines: {} }), 'Invalid line list'],
  ['line without id', (j) => void (j.lines[0].id = ''), 'Line without id'],
  ['duplicate line id', (j) => void j.lines.push({ ...j.lines[0] }), 'Duplicate line id: l1'],
  ['bad line kind', (j) => void (j.lines[0].kind = ''), 'Line l1: invalid kind'],
  ['bad routing', (j) => void (j.lines[0].routing = 7), 'Line l1: invalid routing'],
  [
    'too few vertices',
    (j) => void (j.lines[0].vertices = [j.lines[0].vertices[0]]),
    'Line l1: needs at least two vertices'
  ],
  ['bad point vertex', (j) => void (j.lines[0].vertices[1].x = null), 'Line l1: invalid point vertex'],
  ['bad rel vertex', (j) => void (j.lines[0].vertices[2].t = 'half'), 'Line l1: invalid rel vertex'],
  ['bad anchor vertex', (j) => void (j.lines[0].vertices[0].connectionId = ''), 'Line l1: invalid anchor vertex'],
  ['unknown vertex kind', (j) => void (j.lines[0].vertices[1].kind = 'curve'), 'Line l1: unknown vertex kind']
];

/** Apply a case's mutation: it edits the composite in place (`void`) or returns a replacement. */
function brokenComposite(mutate: (j: LooseJson) => unknown): unknown {
  const json = validComposite();
  const out = mutate(json);
  return out === undefined ? json : out;
}

describe('CompositeSerializer.validate (first error)', () => {
  it.each(COMPOSITE_SINGLE_ERRORS)('%s', (_name, mutate, message) => {
    expect(() => CompositeSerializer.validate(brokenComposite(mutate))).toThrow(new SldParseError(message));
  });
});

describe('CompositeSerializer.check (non-throwing, all errors)', () => {
  it('reports ok on a valid composite', () => {
    expect(CompositeSerializer.check(validComposite())).toEqual({ ok: true, errors: [] });
  });

  it('collects every problem in one pass, in document order', () => {
    const json = validComposite();
    json.children[0].x = 'left'; // bad transform
    json.children[0].labelAnchor = 'middle'; // bad labelAnchor
    json.children[1].id = 'a'; // duplicate child id
    json.children[1].portDirections = { f1: 'north', f2: 'south' }; // two bad pins
    json.lines[0].vertices[1].x = null; // bad point vertex
    // A second line reusing the id, with an unknown vertex kind.
    json.lines.push({ ...json.lines[0], vertices: [{ kind: 'curve' }, { kind: 'point', x: 0, y: 0 }] });

    const { ok, errors } = CompositeSerializer.check(json);
    expect(ok).toBe(false);
    expect(errors.every((e) => e instanceof SldParseError)).toBe(true);
    expect(errors.map((e) => e.message)).toEqual([
      'Child a: invalid transform',
      'Child a: invalid labelAnchor',
      'Duplicate child id: a',
      'Child a: invalid port direction "north" for f1',
      'Child a: invalid port direction "south" for f2',
      'Line l1: invalid point vertex',
      'Duplicate line id: l1',
      'Line l1: unknown vertex kind'
    ]);
  });

  it('keeps checking children and lines when meta is broken', () => {
    const json = validComposite();
    json.meta = { id: '' };
    json.lines[0].kind = '';
    expect(CompositeSerializer.check(json).errors.map((e) => e.message)).toEqual([
      'Invalid meta.id',
      'Invalid meta.name',
      'Line l1: invalid kind'
    ]);
  });

  it('stops at a fatal problem', () => {
    const json = validComposite();
    json.kind = 'diagram';
    json.children[0].x = 'left';
    expect(CompositeSerializer.check(json).errors.map((e) => e.message)).toEqual(['Document is not a composite']);
  });

  it("first collected error matches validate's thrown error", () => {
    const json = validComposite();
    json.children[1].libraryId = '';
    json.lines[0].routing = 3;
    const { errors } = CompositeSerializer.check(json);
    expect(errors).toHaveLength(2);
    expect(() => CompositeSerializer.validate(json)).toThrow(errors[0].message);
  });

  it('validate still normalizes a valid composite', () => {
    const out = CompositeSerializer.validate(validComposite());
    expect(out.children.map((c) => c.labelAnchor)).toEqual(['top-left', 'top-left']);
    expect(out.children[1].portDirections).toEqual({ f1: 'up' });
    expect(out.lines[0].vertices).toHaveLength(3);
  });
});
