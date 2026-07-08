import { describe, it, expect } from 'vitest';
import {
  Serializer,
  SldDocument,
  BusBar,
  Position,
  Connection,
  CommandStack,
  UpdateElementCommand,
  getElementData
} from '../src';

const cycle = (v: unknown) => JSON.parse(JSON.stringify(v));

interface BayData {
  commissionedAt: string;
  ratingA: number;
  owner: string;
}

function docWithData(): SldDocument {
  const doc = new SldDocument({ id: 'd', name: 'x', data: { note: 'doc-level' } }, { rows: 3, cols: 2 });
  doc.addElement(new BusBar('bar', 'BB', 0, { installed: 1998 }));
  doc.addElement(
    new Position('pos', 'L1', 'line', 1, 0, 1, [], {
      commissionedAt: '2024-05-01',
      ratingA: 1200,
      owner: 'ACME'
    } satisfies BayData)
  );
  doc.addElement(
    new Connection('cn', '', { kind: 'element', id: 'pos' }, { kind: 'element', id: 'bar' }, { cable: 'XLPE' })
  );
  return doc;
}

describe('opaque data channel', () => {
  it('roundtrips data on every element kind and on meta', () => {
    const doc = docWithData();
    const restored = Serializer.fromJSON(cycle(Serializer.toJSON(doc)));
    expect(getElementData<{ installed: number }>(restored.getElement('bar')!)).toEqual({ installed: 1998 });
    expect(getElementData<BayData>(restored.getElement('pos')!)).toEqual({
      commissionedAt: '2024-05-01',
      ratingA: 1200,
      owner: 'ACME'
    });
    expect(getElementData<{ cable: string }>(restored.getElement('cn')!)).toEqual({ cable: 'XLPE' });
    expect(restored.meta.data).toEqual({ note: 'doc-level' });
  });

  it('omits the data key entirely when unset (no `data: undefined`)', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 2, cols: 2 });
    doc.addElement(new BusBar('bar', 'BB', 0));
    const json = Serializer.toJSON(doc).elements[0];
    expect('data' in json).toBe(false);
  });

  it('deep-copies data (mutating the source does not leak into the snapshot)', () => {
    const source = { ratingA: 1200 };
    const pos = new Position('pos', 'L1', 'line', 1, 0, 1, [], source);
    const json = pos.toJSON();
    source.ratingA = 9999;
    expect((json.data as { ratingA: number }).ratingA).toBe(1200);
  });

  it('survives an UpdateElementCommand and its undo', () => {
    const doc = new SldDocument({ id: 'd', name: 'x' }, { rows: 3, cols: 2 });
    doc.addElement(new BusBar('bar', 'BB', 0));
    doc.addElement(new Position('pos', 'L1', 'line', 1, 0));
    const stack = new CommandStack();
    const before = doc.getElement('pos')!.toJSON();
    const after = { ...before, data: { ratingA: 800 } };
    stack.execute(new UpdateElementCommand(before, after), doc);
    expect(getElementData<{ ratingA: number }>(doc.getElement('pos')!)).toEqual({ ratingA: 800 });
    stack.undo(doc);
    expect(doc.getElement('pos')!.data).toBeUndefined();
    stack.redo(doc);
    expect(getElementData<{ ratingA: number }>(doc.getElement('pos')!)).toEqual({ ratingA: 800 });
  });
});
