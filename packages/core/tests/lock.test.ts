import { describe, it, expect } from 'vitest';
import {
  CommandStack,
  CompositeDocument,
  CompositeSerializer,
  DiagramInstance,
  RemoveChildCommand,
  SetChildrenLockedCommand,
  SldParseError
} from '../src';

const cycle = (v: unknown) => JSON.parse(JSON.stringify(v));

function threeBoxes() {
  const doc = new CompositeDocument({ id: 'c', name: 'Three' });
  doc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'lib-a', x: 0, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'b', libraryId: 'lib-b', x: 300, y: 0, locked: true }));
  doc.addChild(DiagramInstance.of({ id: 'c', libraryId: 'lib-c', x: 600, y: 0 }));
  return doc;
}

describe('DiagramInstance.locked', () => {
  it('defaults to unlocked', () => {
    expect(DiagramInstance.of({ libraryId: 'x' }).locked).toBe(false);
    expect(new DiagramInstance('i', 'x', 0, 0, 0).locked).toBe(false);
  });

  it('roundtrips through the composite JSON, omitted when unlocked', () => {
    const json = CompositeSerializer.toJSON(threeBoxes());
    expect(json.children.find((c) => c.id === 'b')?.locked).toBe(true);
    expect(json.children.find((c) => c.id === 'a')).not.toHaveProperty('locked');

    const back = CompositeSerializer.fromJSON(cycle(json));
    expect(back.getChild('b')?.locked).toBe(true);
    expect(back.getChild('a')?.locked).toBe(false);
    expect(CompositeSerializer.toJSON(back)).toEqual(json);
  });

  it('roundtrips through the instance JSON too', () => {
    const inst = DiagramInstance.of({ id: 'i', libraryId: 'x', locked: true });
    expect(inst.toJSON().locked).toBe(true);
    expect(DiagramInstance.fromJSON(inst.toJSON()).locked).toBe(true);
    expect(DiagramInstance.of({ id: 'j', libraryId: 'x' }).toJSON()).not.toHaveProperty('locked');
  });

  it('survives deleting the child and undoing it', () => {
    const doc = threeBoxes();
    const stack = new CommandStack<CompositeDocument>();
    stack.execute(new RemoveChildCommand('b'), doc);
    stack.undo(doc);
    expect(doc.getChild('b')?.locked).toBe(true);
  });

  it('rejects a non-boolean lock with a readable message', () => {
    const json = cycle(CompositeSerializer.toJSON(threeBoxes()));
    json.children[0].locked = 'yes';
    expect(() => CompositeSerializer.fromJSON(json)).toThrow(SldParseError);
    expect(() => CompositeSerializer.fromJSON(json)).toThrow(/Child a: invalid locked/);
  });
});

describe('SetChildrenLockedCommand', () => {
  it('locks several children in one undoable step', () => {
    const doc = threeBoxes();
    const stack = new CommandStack<CompositeDocument>();
    stack.execute(new SetChildrenLockedCommand(['a', 'b', 'c'], true), doc);
    expect(doc.allChildren().map((c) => c.locked)).toEqual([true, true, true]);

    // Undo restores the mixed state exactly (b was already locked).
    stack.undo(doc);
    expect(doc.allChildren().map((c) => c.locked)).toEqual([false, true, false]);
    stack.redo(doc);
    expect(doc.allChildren().map((c) => c.locked)).toEqual([true, true, true]);
  });

  it('unlocks, and skips unknown ids', () => {
    const doc = threeBoxes();
    const stack = new CommandStack<CompositeDocument>();
    stack.execute(new SetChildrenLockedCommand(['b', 'nope'], false), doc);
    expect(doc.getChild('b')?.locked).toBe(false);
    stack.undo(doc);
    expect(doc.getChild('b')?.locked).toBe(true);
  });

  it('notifies subscribers only for children whose lock changed', () => {
    const doc = threeBoxes();
    const changed: string[][] = [];
    doc.subscribe((c) => {
      if (c.type === 'children') changed.push(c.ids);
    });
    new SetChildrenLockedCommand(['a', 'b'], true).do(doc);
    expect(changed).toEqual([['a']]);
  });

  it('is labelled for the undo history', () => {
    expect(new SetChildrenLockedCommand(['a'], true).label).toBe('Lock position');
    expect(new SetChildrenLockedCommand(['a'], false).label).toBe('Unlock position');
  });
});
