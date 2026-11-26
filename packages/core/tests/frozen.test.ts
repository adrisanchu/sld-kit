import { describe, it, expect } from 'vitest';
import {
  CommandStack,
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  DETAIL_SPREAD_GAP,
  DiagramInstance,
  MapResolver,
  Serializer,
  TIDY_BOX_GAP,
  buildDocument,
  tidyCommand,
  type BaySpec,
  type CompositeLayout,
  type ExternalDirection,
  type Rect
} from '../src';

/** One single-bus substation with a line bay per feeder (id → exit side). */
const sub = (id: string, feeders: Record<string, ExternalDirection>) =>
  buildDocument({
    meta: { id, name: id.toUpperCase(), voltageKv: 220 },
    busbars: [{ label: 'BB', row: 0 }],
    bays: Object.entries(feeders).map(([fid, direction], col): BaySpec => ({
      col,
      positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: fid, direction, id: fid } }]
    }))
  });

/**
 * A and B joined by a line, with C sitting right between them (so the line
 * detours around it), plus D joined to C. Box view, orthogonal routing.
 */
function blockedDoc(boxMode = true) {
  const docs = {
    a: sub('a', { 'a-b': 'right' }),
    b: sub('b', { 'b-a': 'left' }),
    c: sub('c', { 'c-d': 'down' }),
    d: sub('d', { 'd-c': 'up' })
  };
  const doc = new CompositeDocument({ id: 'x', name: 'x', boxMode, defaultRouting: 'orthogonal' });
  doc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'a', x: 0, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'b', libraryId: 'b', x: 1200, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'c', libraryId: 'c', x: 600, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'd', libraryId: 'd', x: 600, y: 600 }));
  const anchor = (instanceId: string, connectionId: string) => ({ kind: 'anchor' as const, instanceId, connectionId });
  doc.addLine(new CompositeLine('ab', [anchor('a', 'a-b'), anchor('b', 'b-a')]));
  doc.addLine(new CompositeLine('cd', [anchor('c', 'c-d'), anchor('d', 'd-c')]));
  doc.resolveChildren(new MapResolver(new Map(Object.entries(docs).map(([k, d]) => [k, Serializer.toJSON(d)]))));
  return doc;
}

const lineOf = (layout: CompositeLayout, id: string) => layout.lines.find((l) => l.line.id === id)!.points;
const boundsOf = (layout: CompositeLayout, id: string) =>
  layout.children.find((c) => c.instance.id === id)!.worldBounds;
const frozenEngine = () =>
  new CompositeLayoutEngine(undefined, undefined, undefined, { freeze: true, detailSpread: {} });
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('frozen layout (freeze)', () => {
  it('detours around a box in the way', () => {
    const ab = lineOf(new CompositeLayoutEngine().layout(blockedDoc()), 'ab');
    expect(ab.length).toBeGreaterThan(2);
  });

  it('keeps a line’s route when another box moves out of its way', () => {
    const doc = blockedDoc();
    const engine = frozenEngine();
    const before = lineOf(engine.layout(doc), 'ab');
    doc.setChildTransform('c', 600, 2000, 0); // C leaves the A–B corridor
    expect(lineOf(engine.layout(doc), 'ab')).toEqual(before);
    // An unfrozen engine straightens it right away.
    expect(lineOf(new CompositeLayoutEngine().layout(doc), 'ab').length).toBeLessThan(before.length);
  });

  it('re-routes the moved box’s own lines', () => {
    const doc = blockedDoc();
    const engine = frozenEngine();
    const before = lineOf(engine.layout(doc), 'cd');
    doc.setChildTransform('d', 900, 600, 0);
    expect(lineOf(engine.layout(doc), 'cd')).not.toEqual(before);
  });

  it('re-solves everything after invalidate()', () => {
    const doc = blockedDoc();
    const engine = frozenEngine();
    engine.layout(doc);
    doc.setChildTransform('c', 600, 2000, 0);
    engine.invalidate(doc);
    expect(lineOf(engine.layout(doc), 'ab')).toEqual(lineOf(new CompositeLayoutEngine().layout(doc), 'ab'));
  });

  it('keeps one state per document', () => {
    const doc = blockedDoc();
    const engine = frozenEngine();
    const before = lineOf(engine.layout(doc), 'ab');
    engine.layout(blockedDoc()); // another composite on the same engine
    doc.setChildTransform('c', 600, 2000, 0);
    expect(lineOf(engine.layout(doc), 'ab')).toEqual(before);
  });

  it('holds the other detail drawings still while one moves', () => {
    const doc = blockedDoc(false);
    const engine = frozenEngine();
    const first = engine.layout(doc);
    doc.setChildTransform('d', 3000, 3000, 0);
    const next = engine.layout(doc);
    for (const id of ['a', 'b', 'c']) expect(boundsOf(next, id)).toEqual(boundsOf(first, id));
  });

  // Where there is room. Squeezed between two drawings that hold still with no
  // room for it, it can stay overlapping — the deferred "trapped" case.
  it('places a moved drawing clear of the ones holding still, where there is room', () => {
    const doc = blockedDoc(false);
    const engine = frozenEngine();
    engine.layout(doc);
    doc.setChildTransform('d', 600, 200, 0); // half onto C, room below it
    const next = engine.layout(doc);
    expect(overlap(boundsOf(next, 'd'), boundsOf(next, 'c'))).toBe(false);
  });

  it('changes nothing when off', () => {
    const doc = blockedDoc();
    const a = new CompositeLayoutEngine().layout(doc);
    const b = new CompositeLayoutEngine(undefined, undefined, undefined, { freeze: false }).layout(doc);
    expect(b.lines.map((l) => l.points)).toEqual(a.lines.map((l) => l.points));
  });
});

describe('structural sharing: unchanged children keep their layout object', () => {
  // Always on (frozen layout or not): an unchanged child's ChildLayout is the
  // very same object from one layout to the next, so views can skip it.
  const engines = [
    ['plain', () => new CompositeLayoutEngine()],
    ['frozen', frozenEngine]
  ] as const;

  it.each(engines.flatMap(([name, make]) => [true, false].map((box) => [name, box, make] as const)))(
    '%s engine, box view %s: only the moved child gets a new ChildLayout',
    (_name, boxMode, make) => {
      const doc = blockedDoc(boxMode);
      const engine = make();
      const first = engine.layout(doc);
      doc.setChildTransform('d', 900, 600, 0);
      const next = engine.layout(doc);
      const same = (id: string) =>
        first.children.find((c) => c.instance.id === id) === next.children.find((c) => c.instance.id === id);
      expect(same('a') && same('b') && same('c')).toBe(true);
      expect(same('d')).toBe(false);
    }
  );

  it('a child whose document changed gets a new layout', () => {
    const doc = blockedDoc();
    const engine = new CompositeLayoutEngine();
    const before = engine.layout(doc).children.find((c) => c.instance.id === 'c')!;
    doc.getChild('c')!.resolved!.updateMeta({ name: 'Renamed' });
    const after = engine.layout(doc).children.find((c) => c.instance.id === 'c')!;
    expect(after).not.toBe(before);
    expect(after.name).toBe('Renamed');
  });

  it('a lock toggle gives the child a new layout (views re-render it)', () => {
    const doc = blockedDoc();
    const engine = new CompositeLayoutEngine();
    const before = engine.layout(doc).children.find((c) => c.instance.id === 'a')!;
    doc.setChildLocked('a', true);
    expect(engine.layout(doc).children.find((c) => c.instance.id === 'a')).not.toBe(before);
  });

  it('a re-laid detail drawing (pinned feeder) follows edits to its document', () => {
    // Pinning a feeder to another side re-lays the child out from a copy, cached
    // per document: an edit to the document must not leave the old copy in use.
    const doc = blockedDoc(false);
    doc.setPortDirection('c', 'c-d', 'up');
    const engine = new CompositeLayoutEngine();
    const before = engine.layout(doc).children.find((c) => c.instance.id === 'c')!;
    const resolved = doc.getChild('c')!.resolved!;
    resolved.replaceContents(Serializer.toJSON(sub('c', { 'c-d': 'down', 'c-x': 'right', 'c-y': 'right' })));
    const after = engine.layout(doc).children.find((c) => c.instance.id === 'c')!;
    expect(after.frame.width).toBeGreaterThan(before.frame.width);
  });

  it('keeps sharing per composite', () => {
    const engine = new CompositeLayoutEngine();
    const one = blockedDoc();
    const first = engine.layout(one);
    engine.layout(blockedDoc()); // another composite on the same engine
    expect(engine.layout(one).children).toEqual(first.children);
    expect(engine.layout(one).children.every((c, i) => c === first.children[i])).toBe(true);
  });
});

describe('tidyCommand', () => {
  /** Box view, C dropped on top of B. */
  const piled = () => {
    const doc = blockedDoc();
    doc.setChildTransform('c', 1250, 20, 0);
    return doc;
  };

  it('pushes overlapping boxes apart in box view, as one undoable step', () => {
    const doc = piled();
    const engine = frozenEngine();
    const stack = new CommandStack<CompositeDocument>();
    const cmd = tidyCommand(doc, engine);
    expect(cmd).not.toBeNull();
    stack.execute(cmd!, doc);
    const layout = engine.layout(doc);
    const gap = (a: Rect, b: Rect) =>
      Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height));
    expect(gap(boundsOf(layout, 'b'), boundsOf(layout, 'c'))).toBeGreaterThanOrEqual(TIDY_BOX_GAP - 1e-6);
    stack.undo(doc);
    expect(doc.getChild('c')!.x).toBe(1250);
  });

  it('keeps locked boxes put unless asked to include them', () => {
    const doc = piled();
    doc.setChildLocked('b', true);
    doc.setChildLocked('c', true);
    // Both locked: nothing may move.
    expect(tidyCommand(doc, frozenEngine())).toBeNull();
    // Including locked boxes: they move, and stay locked.
    const cmd = tidyCommand(doc, frozenEngine(), { includeLocked: true });
    expect(cmd).not.toBeNull();
    cmd!.do(doc);
    expect(doc.getChild('b')!.locked && doc.getChild('c')!.locked).toBe(true);
    expect(overlap(boundsOf(frozenEngine().layout(doc), 'b'), boundsOf(frozenEngine().layout(doc), 'c'))).toBe(false);
  });

  it('moves only the unlocked box when one of a pair is locked', () => {
    const doc = piled();
    doc.setChildLocked('b', true);
    tidyCommand(doc, frozenEngine())!.do(doc);
    expect(doc.getChild('b')!.x).toBe(1200);
    expect(doc.getChild('c')!.x !== 1250 || doc.getChild('c')!.y !== 20).toBe(true);
  });

  it('returns null when nothing moves, and still re-routes from scratch', () => {
    const doc = blockedDoc();
    const engine = frozenEngine();
    engine.layout(doc);
    doc.setChildTransform('c', 600, 2000, 0); // frozen: A–B keeps its detour…
    expect(tidyCommand(doc, engine)).toBeNull();
    // …until the tidy: it re-routes straight.
    expect(lineOf(engine.layout(doc), 'ab')).toEqual(lineOf(new CompositeLayoutEngine().layout(doc), 'ab'));
  });

  it('detail view: spreads locked drawings too when included, and stores their spots', () => {
    const doc = blockedDoc(false);
    doc.setChildTransform('c', 1250, 20, 0); // C's drawing on top of B's
    doc.setChildLocked('b', true);
    doc.setChildLocked('c', true);
    const engine = frozenEngine();
    expect(tidyCommand(doc, engine)).toBeNull(); // locked stay put
    const cmd = tidyCommand(doc, engine, { includeLocked: true });
    expect(cmd).not.toBeNull();
    cmd!.do(doc);
    const layout = engine.layout(doc);
    expect(overlap(boundsOf(layout, 'b'), boundsOf(layout, 'c'))).toBe(false);
    // Still locked: shown exactly at their (new) stored spots.
    expect(layout.children.filter((c) => c.instance.locked).every((c) => !c.spreadOffset)).toBe(true);
    expect(DETAIL_SPREAD_GAP).toBeGreaterThan(0);
  });
});
