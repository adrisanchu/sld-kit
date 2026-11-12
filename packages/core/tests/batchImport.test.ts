import { describe, it, expect } from 'vitest';
import {
  ImportPlan,
  planImport,
  detectDocumentKind,
  buildDocument,
  Serializer,
  type ImportContext,
  type ImportInput
} from '../src';

const EMPTY: ImportContext = { existingIds: new Set(), existingNames: new Set() };

/** A valid single-diagram file with the given id and name. */
function diagram(id: string, name = id): string {
  const doc = buildDocument({ meta: { id, name }, busbars: [{ row: 0, label: 'B1' }], bays: [] });
  return JSON.stringify(Serializer.toJSON(doc));
}

/** A valid composite file whose children point at `libraryIds`. */
function composite(id: string, libraryIds: string[], name = id): string {
  return JSON.stringify({
    version: 2,
    kind: 'composite',
    meta: { id, name },
    children: libraryIds.map((libraryId, i) => ({ id: `c${i}`, libraryId, x: i * 100, y: 0, angleDeg: 0 })),
    lines: []
  });
}

const input = (path: string, text?: string): ImportInput => ({ path, text });

describe('detectDocumentKind', () => {
  it('reads kind: composite, anything else is a diagram', () => {
    expect(detectDocumentKind({ kind: 'composite' })).toBe('composite');
    expect(detectDocumentKind({ version: 2 })).toBe('diagram');
    expect(detectDocumentKind(null)).toBe('diagram');
  });
});

describe('ImportPlan: per-file results', () => {
  it('keeps input order and reports skipped, invalid-JSON and valid files', () => {
    const plan = planImport(
      [input('a.json', diagram('a')), input('notes.txt'), input('bad.json', '{ nope'), input('b.json', diagram('b'))],
      EMPTY
    );
    plan.diagrams();
    plan.composites();
    const results = plan.results();

    expect(results.map((r) => [r.path, r.status])).toEqual([
      ['a.json', 'imported'],
      ['notes.txt', 'skipped'],
      ['bad.json', 'error'],
      ['b.json', 'imported']
    ]);
    expect(results[1].messages).toEqual(['Not a JSON file']);
    expect(results[2].messages[0]).toMatch(/^Invalid JSON: /);
    expect(results[0]).toMatchObject({ kind: 'diagram', name: 'a' });
  });

  it('lists every error of an invalid diagram', () => {
    const json = { version: 2, meta: { id: '', name: 'x' }, grid: { rows: -1, cols: 1 }, elements: [] };
    const [result] = planImport([input('d.json', JSON.stringify(json))], EMPTY).results();
    expect(result.status).toBe('error');
    expect(result.messages).toEqual(['Invalid meta.id', 'Invalid grid dimensions']);
    expect(result.name).toBe('x');
  });

  it('lists every error of an invalid composite', () => {
    const json = JSON.parse(composite('k', ['a', 'b']));
    json.children[0].x = 'left';
    json.children[1].id = 'c0';
    const [result] = planImport([input('k.json', JSON.stringify(json))], EMPTY).results();
    expect(result).toMatchObject({ status: 'error', kind: 'composite' });
    expect(result.messages).toEqual(['Child c0: invalid transform', 'Duplicate child id: c0']);
  });
});

describe('ImportPlan: warnings', () => {
  it('warns about a duplicate id within the batch', () => {
    const plan = planImport([input('one/a.json', diagram('a')), input('two/a.json', diagram('a', 'other'))], EMPTY);
    plan.diagrams();
    const results = plan.results();
    expect(results[0].status).toBe('imported');
    expect(results[1]).toMatchObject({ status: 'warning', messages: ['Same id as one/a.json'] });
  });

  it('warns about a name already in the library', () => {
    const plan = planImport([input('a.json', diagram('a', 'North'))], { ...EMPTY, existingNames: new Set(['North']) });
    plan.diagrams();
    expect(plan.results()[0]).toMatchObject({
      status: 'warning',
      messages: ['A document named "North" already exists in the library']
    });
  });
});

describe('ImportPlan: ids and relinking', () => {
  it('gives every document a fresh id, minted once', () => {
    const plan = planImport([input('a.json', diagram('a')), input('k.json', composite('k', ['a']))], EMPTY);
    const [d] = plan.diagrams();
    const [c] = plan.composites();
    expect(d.sourceId).toBe('a');
    expect(d.json.meta.id).not.toBe('a');
    expect(d.result.id).toBe(d.json.meta.id);
    expect(c.json.meta.id).not.toBe('k');
    expect(plan.diagrams()[0]).toBe(d);
    expect(plan.composites()[0]).toBe(c);
  });

  it('relinks composites to the batch, keeps library ids and reports the rest', () => {
    const plan = planImport([input('k.json', composite('k', ['a', 'lib-1', 'ghost'])), input('a.json', diagram('a'))], {
      ...EMPTY,
      existingIds: new Set(['lib-1'])
    });
    const [d] = plan.diagrams();
    const [c] = plan.composites();
    expect(c.json.children.map((ch) => ch.libraryId)).toEqual([d.json.meta.id, 'lib-1', 'ghost']);
    expect(plan.results()[0]).toMatchObject({
      status: 'warning',
      messages: ['1 referenced diagram(s) not found: ghost']
    });
  });

  it('relinks a duplicated source id to the first diagram that saved', () => {
    const plan = planImport(
      [input('1.json', diagram('a')), input('2.json', diagram('a')), input('k.json', composite('k', ['a']))],
      EMPTY
    );
    const [first, second] = plan.diagrams();
    plan.markSaved(first, { ok: false, error: 'Browser storage is full' });
    plan.markSaved(second, { ok: true });
    expect(plan.composites()[0].json.children[0].libraryId).toBe(second.json.meta.id);
  });

  it('does not relink to a diagram whose save failed, and reports the failure', () => {
    const plan = planImport([input('a.json', diagram('a')), input('k.json', composite('k', ['a']))], EMPTY);
    const [d] = plan.diagrams();
    plan.markSaved(d, { ok: false, error: 'Browser storage is full' });
    const [c] = plan.composites();
    plan.markSaved(c, { ok: true });

    expect(c.json.children[0].libraryId).toBe('a');
    const [diagramResult, compositeResult] = plan.results();
    expect(diagramResult).toMatchObject({ status: 'error', messages: ['Browser storage is full'] });
    expect(diagramResult.id).toBeUndefined();
    expect(compositeResult).toMatchObject({ status: 'warning', messages: ['1 referenced diagram(s) not found: a'] });
    expect(compositeResult.id).toBe(c.json.meta.id);
  });

  it('can be fed file by file', () => {
    const plan = new ImportPlan(EMPTY);
    const result = plan.add(input('a.json', diagram('a')));
    expect(result).toMatchObject({ path: 'a.json', status: 'imported', kind: 'diagram' });
    expect(plan.diagrams()).toHaveLength(1);
    expect(plan.composites()).toEqual([]);
  });
});
