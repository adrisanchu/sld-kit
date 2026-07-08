import { describe, it, expect } from 'vitest';
import {
  SldDocument,
  BusBar,
  Position,
  CommandStack,
  AddPositionCommand,
  DeleteElementsCommand,
  Serializer
} from '../src';

const snapshot = (doc: SldDocument) => JSON.stringify(Serializer.toJSON(doc).elements);

function barDoc(): SldDocument {
  const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 3 });
  doc.addElement(new BusBar('bb-1', 'BB1', 0));
  doc.addElement(new BusBar('bb-2', 'BB2', 2));
  return doc;
}

describe('CommandStack', () => {
  it('tracks canUndo / canRedo', () => {
    const doc = barDoc();
    const stack = new CommandStack();
    expect(stack.canUndo).toBe(false);
    stack.execute(new AddPositionCommand(new Position('p', 'L1', 'line', 1, 1)), doc);
    expect(stack.canUndo).toBe(true);
    expect(stack.canRedo).toBe(false);
    stack.undo(doc);
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(true);
  });

  it('executing a new command clears the redo stack', () => {
    const doc = barDoc();
    const stack = new CommandStack();
    stack.execute(new AddPositionCommand(new Position('p', 'L1', 'line', 1, 1)), doc);
    stack.undo(doc);
    stack.execute(new AddPositionCommand(new Position('q', 'L2', 'line', 1, 2)), doc);
    expect(stack.canRedo).toBe(false);
  });
});

describe('AddPositionCommand auto-wiring', () => {
  it('wires the new bay to both bars, and undo removes exactly what it added', () => {
    const doc = barDoc();
    const before = snapshot(doc);
    const stack = new CommandStack();
    stack.execute(new AddPositionCommand(new Position('p', 'L1', 'line', 1, 1)), doc);

    // The position plus its two bar connections now exist.
    expect(doc.getElement('p')).toBeDefined();
    expect(doc.connectionsOf('p').length).toBeGreaterThanOrEqual(2);

    stack.undo(doc);
    // Symmetric: the document is byte-for-byte what it was before.
    expect(snapshot(doc)).toBe(before);

    stack.redo(doc);
    expect(doc.getElement('p')).toBeDefined();
    expect(doc.connectionsOf('p').length).toBeGreaterThanOrEqual(2);
  });
});

describe('DeleteElementsCommand', () => {
  it('cascades to connections and restores the full set on undo', () => {
    const doc = barDoc();
    const stack = new CommandStack();
    stack.execute(new AddPositionCommand(new Position('p', 'L1', 'line', 1, 1)), doc);
    const afterAdd = snapshot(doc);

    stack.execute(new DeleteElementsCommand(['p']), doc);
    expect(doc.getElement('p')).toBeUndefined();
    expect(doc.connectionsOf('p')).toHaveLength(0);

    stack.undo(doc);
    expect(snapshot(doc)).toBe(afterAdd);
  });
});
