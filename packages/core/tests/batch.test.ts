import { describe, it, expect } from 'vitest';
import {
  AddLineCommand,
  AddPositionCommand,
  BatchCommand,
  BusBar,
  CommandStack,
  CompositeDocument,
  CompositeLine,
  DiagramInstance,
  Position,
  RemoveChildCommand,
  RemoveLineCommand,
  Serializer,
  SldDocument,
  type Command
} from '../src';

function barDoc(): SldDocument {
  const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 3 });
  doc.addElement(new BusBar('bb', 'BB', 0));
  return doc;
}

const elements = (doc: SldDocument) => JSON.stringify(Serializer.toJSON(doc).elements);

describe('BatchCommand', () => {
  it('runs as one undo step, undoing in reverse order', () => {
    const doc = barDoc();
    const before = elements(doc);
    const stack = new CommandStack();
    stack.execute(
      new BatchCommand('Two bays', [
        new AddPositionCommand(new Position('p1', 'L1', 'line', 1, 0)),
        new AddPositionCommand(new Position('p2', 'L2', 'line', 1, 1))
      ]),
      doc
    );
    expect(doc.getElement('p1')).toBeDefined();
    expect(doc.getElement('p2')).toBeDefined();
    const after = elements(doc);

    stack.undo(doc);
    expect(elements(doc)).toBe(before);
    expect(stack.canUndo).toBe(false);

    stack.redo(doc);
    expect(elements(doc)).toBe(after);
  });

  it('undoes later commands first', () => {
    const log: string[] = [];
    const cmd = (name: string): Command<null> => ({
      label: name,
      do: () => log.push(`do ${name}`),
      undo: () => log.push(`undo ${name}`)
    });
    const batch = new BatchCommand<null>('ab', [cmd('a'), cmd('b')]);
    batch.do(null);
    batch.undo(null);
    expect(log).toEqual(['do a', 'do b', 'undo b', 'undo a']);
  });

  it('is an empty no-op with no commands', () => {
    const batch = new BatchCommand('none', []);
    expect(batch.isEmpty).toBe(true);
    const doc = barDoc();
    const before = elements(doc);
    batch.do(doc);
    batch.undo(doc);
    expect(elements(doc)).toBe(before);
  });
});

describe('CompositeDocument.linesAt', () => {
  function composite(): CompositeDocument {
    const c = new CompositeDocument({ name: 'c' });
    c.addChild(new DiagramInstance('a', 'lib-a', 0, 0, 0));
    c.addChild(new DiagramInstance('b', 'lib-b', 300, 0, 0));
    c.addLine(
      new CompositeLine('l1', [
        { kind: 'anchor', instanceId: 'a', connectionId: 'f1' },
        { kind: 'anchor', instanceId: 'b', connectionId: 'f1' }
      ])
    );
    c.addLine(
      new CompositeLine('l2', [
        { kind: 'anchor', instanceId: 'a', connectionId: 'f2' },
        { kind: 'point', x: 0, y: 200 }
      ])
    );
    return c;
  }

  it('finds lines by child and by feeder', () => {
    const c = composite();
    expect(c.linesAt('a').map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(c.linesAt('a', 'f2').map((l) => l.id)).toEqual(['l2']);
    expect(c.linesAt('b').map((l) => l.id)).toEqual(['l1']);
    expect(c.linesAt('b', 'f2')).toEqual([]);
    expect(c.linesAt('missing')).toEqual([]);
  });

  it('cascades a child removal with its lines as one undoable batch', () => {
    const c = composite();
    const stack = new CommandStack<CompositeDocument>();
    stack.execute(
      new BatchCommand<CompositeDocument>('Delete', [
        ...c.linesAt('a').map((l) => new RemoveLineCommand(l.id)),
        new RemoveChildCommand('a')
      ]),
      c
    );
    expect(c.getChild('a')).toBeUndefined();
    expect(c.allLines()).toEqual([]);

    stack.undo(c);
    expect(c.getChild('a')).toBeDefined();
    expect(c.allLines().map((l) => l.id).sort()).toEqual(['l1', 'l2']);

    // A fresh line added after undo still lands normally.
    stack.execute(new AddLineCommand(new CompositeLine('l3', [{ kind: 'point', x: 0, y: 0 }, { kind: 'point', x: 1, y: 0 }])), c);
    expect(c.getLine('l3')).toBeDefined();
  });
});
