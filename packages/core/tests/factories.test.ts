import { describe, it, expect } from 'vitest';
import { BusBar, Position, Connection, element, external } from '../src';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('options-object factories (.of)', () => {
  describe('Position.of', () => {
    it('mints an id and defaults label/colSpan/subElements/data', () => {
      const p = Position.of({ type: 'line', row: 1, col: 2 });
      expect(p).toBeInstanceOf(Position);
      expect(p.id).toMatch(UUID);
      expect(p).toMatchObject({ kind: 'position', type: 'line', row: 1, col: 2, label: '', colSpan: 1 });
      expect(p.subElements).toEqual([]);
      expect(p.data).toBeUndefined();
    });

    it('honors every provided field', () => {
      const sub = [{ id: 's1', symbol: 'breaker', slot: 'stem-top' as const }];
      const p = Position.of({
        id: 'p1',
        label: 'L1',
        type: 'transformer',
        row: 3,
        col: 0,
        colSpan: 2,
        subElements: sub,
        data: { ratingA: 1200 }
      });
      expect(p).toMatchObject({ id: 'p1', label: 'L1', type: 'transformer', row: 3, col: 0, colSpan: 2 });
      expect(p.subElements).toEqual(sub);
      expect(p.data).toEqual({ ratingA: 1200 });
    });

    it('is equivalent to the positional constructor (same JSON)', () => {
      const viaOf = Position.of({ id: 'p', label: 'L1', type: 'line', row: 1, col: 0 });
      const viaCtor = new Position('p', 'L1', 'line', 1, 0);
      expect(viaOf.toJSON()).toEqual(viaCtor.toJSON());
    });

    it('gives distinct ids across calls when omitted', () => {
      expect(Position.of({ type: 'line', row: 1, col: 0 }).id).not.toBe(
        Position.of({ type: 'line', row: 1, col: 1 }).id
      );
    });
  });

  describe('BusBar.of', () => {
    it('mints an id and defaults label', () => {
      const b = BusBar.of({ row: 0 });
      expect(b).toBeInstanceOf(BusBar);
      expect(b.id).toMatch(UUID);
      expect(b).toMatchObject({ kind: 'busbar', row: 0, label: '' });
    });

    it('honors id, label and data', () => {
      const b = BusBar.of({ id: 'bb-1', label: 'BB1', row: 2, data: { installed: 1998 } });
      expect(b).toMatchObject({ id: 'bb-1', label: 'BB1', row: 2 });
      expect(b.data).toEqual({ installed: 1998 });
    });
  });

  describe('Connection.of', () => {
    it('mints an id and defaults label', () => {
      const c = Connection.of({ from: element('p'), to: element('bb-1') });
      expect(c).toBeInstanceOf(Connection);
      expect(c.id).toMatch(UUID);
      expect(c.label).toBe('');
      expect(c.elementIds()).toEqual(['p', 'bb-1']);
    });

    it('honors id, label, endpoints and data', () => {
      const c = Connection.of({
        id: 'cn-1',
        label: 'FEEDER A',
        from: element('p'),
        to: external({ asset: 'line', label: 'WEST 1', direction: 'up' }),
        data: { cable: 'XLPE' }
      });
      expect(c).toMatchObject({ id: 'cn-1', label: 'FEEDER A' });
      expect(c.to).toMatchObject({ kind: 'external', asset: 'line', label: 'WEST 1' });
      expect(c.data).toEqual({ cable: 'XLPE' });
    });

    it('is equivalent to the positional constructor (same JSON)', () => {
      const viaOf = Connection.of({ id: 'c', from: element('a'), to: element('b') });
      const viaCtor = new Connection('c', '', element('a'), element('b'));
      expect(viaOf.toJSON()).toEqual(viaCtor.toJSON());
    });
  });
});
