import { describe, it, expect } from 'vitest';
import {
  SldDocument,
  BusBar,
  Position,
  Connection,
  CommandStack,
  AddPositionCommand,
  DeleteElementsCommand,
  RenameElementCommand,
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

describe('RenameElementCommand', () => {
  function wiredDoc(): SldDocument {
    // bar → position, with an external connection carrying its own id.
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 3 });
    doc.addElement(new BusBar('bb-1', 'BB1', 0));
    doc.addElement(new Position('p', 'L1', 'line', 1, 1));
    doc.addElement(new Connection('cn-bar', '', { kind: 'element', id: 'p' }, { kind: 'element', id: 'bb-1' }));
    doc.addElement(
      new Connection(
        'cn-ext',
        '',
        { kind: 'element', id: 'p' },
        { kind: 'external', asset: 'transformer', label: 'ATP1' }
      )
    );
    return doc;
  }

  it('repoints connection endpoints, preserves z-order, and undoes symmetrically', () => {
    const doc = wiredDoc();
    const before = snapshot(doc);
    const stack = new CommandStack();

    stack.execute(new RenameElementCommand('p', 'atp1'), doc);

    expect(doc.getElement('p')).toBeUndefined();
    expect(doc.getElement('atp1')).toBeDefined();
    // Both connections that referenced 'p' now reference 'atp1'.
    expect(doc.connectionsOf('atp1')).toHaveLength(2);
    expect(doc.connectionsOf('p')).toHaveLength(0);
    // Z-order (insertion sequence) is unchanged: bar, position, then connections.
    expect(doc.all().map((e) => e.id)).toEqual(['bb-1', 'atp1', 'cn-bar', 'cn-ext']);

    stack.undo(doc);
    expect(snapshot(doc)).toBe(before);
  });

  it('renames an external connection id (the composite auto-link use case)', () => {
    const doc = wiredDoc();
    const stack = new CommandStack();
    stack.execute(new RenameElementCommand('cn-ext', 'cn-atp1-400-220'), doc);
    expect(doc.getElement('cn-atp1-400-220')).toBeDefined();
    expect(doc.getElement('cn-ext')).toBeUndefined();
    stack.undo(doc);
    expect(doc.getElement('cn-ext')).toBeDefined();
  });

  it('no-ops on an unknown, empty, unchanged, or already-taken id', () => {
    const doc = wiredDoc();
    expect(doc.renameElement('nope', 'x')).toBe(false);
    expect(doc.renameElement('p', '')).toBe(false);
    expect(doc.renameElement('p', 'p')).toBe(false);
    expect(doc.renameElement('p', 'bb-1')).toBe(false); // collision
    // The document is untouched by any of the rejected renames.
    expect(doc.all().map((e) => e.id)).toEqual(['bb-1', 'p', 'cn-bar', 'cn-ext']);
  });
});
