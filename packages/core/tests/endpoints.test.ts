import { describe, it, expect } from 'vitest';
import { element, external } from '../src';

describe('endpoint helpers', () => {
  it('element() omits tap when not given', () => {
    expect(element('p1')).toEqual({ kind: 'element', id: 'p1' });
    expect(element('p1', 'below')).toEqual({ kind: 'element', id: 'p1', tap: 'below' });
  });

  it('external() omits optional fields when not given', () => {
    expect(external({ asset: 'line', label: 'FEEDER A' })).toEqual({
      kind: 'external',
      asset: 'line',
      label: 'FEEDER A'
    });
  });

  it('external() carries direction and side when given', () => {
    expect(external({ asset: 'transformer', label: 'TIE', direction: 'down', side: 'left' })).toEqual({
      kind: 'external',
      asset: 'transformer',
      label: 'TIE',
      direction: 'down',
      side: 'left'
    });
  });
});
