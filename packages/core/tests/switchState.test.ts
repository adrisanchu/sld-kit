import { describe, it, expect } from 'vitest';
import {
  BusBar,
  CommandStack,
  Connection,
  Position,
  Serializer,
  SldDocument,
  SldParseError,
  SvgExporter,
  SWITCH_OPEN_FORMAT,
  SWITCH_OPEN_CONNECTION_FORMAT,
  UpdateElementCommand,
  buildDocument,
  effectiveState,
  element,
  external,
  resolveFormat
} from '../src';

/** A one-bay diagram: BB — L1 → feeder. */
const oneBay = (state?: 'open' | 'closed') => {
  const doc = new SldDocument({ id: 'd', name: 'd' }, { rows: 2, cols: 1 });
  doc.addElement(BusBar.of({ id: 'bb', label: 'BB', row: 0 }));
  doc.addElement(Position.of({ id: 'p', label: 'L1', type: 'line', row: 1, col: 0, state }));
  doc.addElement(Connection.of({ id: 'c-bus', from: element('p'), to: element('bb') }));
  doc.addElement(Connection.of({ id: 'c-ext', from: element('p'), to: external({ asset: 'line', label: 'F', direction: 'down' }) }));
  return doc;
};
const pos = (doc: SldDocument) => doc.getElement('p') as Position;

describe('Position.state (first-class switching state)', () => {
  it('defaults to closed and is omitted from JSON when unset', () => {
    const doc = oneBay();
    expect(effectiveState(pos(doc))).toBe('closed');
    expect('state' in Serializer.toJSON(doc).elements.find((e) => e.id === 'p')!).toBe(false);
  });

  it('roundtrips an explicit state', () => {
    const back = Serializer.fromJSON(JSON.parse(JSON.stringify(Serializer.toJSON(oneBay('open')))));
    expect(effectiveState(pos(back))).toBe('open');
  });

  it('rejects an invalid state', () => {
    const json = Serializer.toJSON(oneBay()) as unknown as { elements: Record<string, unknown>[] };
    json.elements.find((e) => e.id === 'p')!.state = 'ajar';
    expect(() => Serializer.fromJSON(json)).toThrow(SldParseError);
  });

  it('buildDocument accepts a per-position state', () => {
    const doc = buildDocument({
      busbars: [{ label: 'BB', row: 0 }],
      bays: [{ col: 0, positions: [{ id: 'p', type: 'line', row: 1, state: 'open' }] }]
    });
    expect(effectiveState(pos(doc))).toBe('open');
  });

  it('toggles undoably through UpdateElementCommand', () => {
    const doc = oneBay();
    const stack = new CommandStack<SldDocument>();
    const before = pos(doc).toJSON();
    stack.execute(new UpdateElementCommand(before, { ...before, state: 'open' }), doc);
    expect(effectiveState(pos(doc))).toBe('open');
    stack.undo(doc);
    expect(effectiveState(pos(doc))).toBe('closed');
  });
});

describe('resolveFormat / default open look', () => {
  it('gives an open position the default open format, nothing to a closed one', () => {
    expect(resolveFormat(pos(oneBay('open')))).toEqual(SWITCH_OPEN_FORMAT);
    expect(resolveFormat(pos(oneBay('closed')))).toBeUndefined();
    expect(resolveFormat(pos(oneBay()))).toBeUndefined();
  });

  it("the consumer's resolver wins over the default", () => {
    const mine = { fillOpacity: 0.9 };
    expect(resolveFormat(pos(oneBay('open')), () => mine)).toBe(mine);
    // A resolver that returns nothing for the element falls back to the default.
    expect(resolveFormat(pos(oneBay('open')), () => undefined)).toEqual(SWITCH_OPEN_FORMAT);
  });

  it('exports an open position faded + dashed; output without state is unchanged', () => {
    const exporter = new SvgExporter();
    const open = exporter.export(oneBay('open'));
    expect(open).toContain('fill-opacity="0.3"');
    expect(open).toContain('stroke-dasharray="4 3"');
    expect(exporter.export(oneBay())).toBe(exporter.export(oneBay('closed')));
  });

  it('a theme can restyle the open look', () => {
    const svg = new SvgExporter().export(oneBay('open'), { theme: { switchOpenFormat: { fillOpacity: 0.1 } } });
    const rect = svg.match(/<rect[^>]*fill-opacity="0\.1"[^>]*>/)?.[0];
    expect(rect).toBeDefined();
    expect(rect).not.toContain('stroke-dasharray');
  });

  it("greys + dashes an open bay's direct connections (stem and feeder), only with the doc", () => {
    const doc = oneBay('open');
    for (const id of ['c-bus', 'c-ext']) {
      expect(resolveFormat(doc.getElement(id)!, undefined, { doc })).toEqual(SWITCH_OPEN_CONNECTION_FORMAT);
      // Without its document a connection can't know its endpoints' state.
      expect(resolveFormat(doc.getElement(id)!)).toBeUndefined();
    }
    const closed = oneBay('closed');
    expect(resolveFormat(closed.getElement('c-bus')!, undefined, { doc: closed })).toBeUndefined();
    // The consumer's resolver still wins.
    const mine = { stroke: '#ff0000' };
    expect(resolveFormat(doc.getElement('c-bus')!, () => mine, { doc })).toBe(mine);
  });

  it('exports open-bay connections grey + dashed (line and arrowhead); a theme can restyle them', () => {
    const svg = new SvgExporter().export(oneBay('open'));
    expect(svg.match(/stroke="#94a3b8"/g)!.length).toBe(2); // stem + feeder
    expect(svg).toContain('fill="#94a3b8"'); // the feeder's arrowhead
    const custom = new SvgExporter().export(oneBay('open'), { theme: { switchOpenConnectionFormat: { stroke: '#123456' } } });
    expect(custom).toContain('stroke="#123456"');
    expect(new SvgExporter().export(oneBay('closed'))).not.toContain('#94a3b8');
  });

  it('ElementFormat.stroke recolours a connection and its arrowhead in the export', () => {
    const svg = new SvgExporter().export(oneBay(), {
      theme: { resolveElementFormat: (el) => (el.id === 'c-ext' ? { stroke: '#94a3b8' } : undefined) }
    });
    expect(svg.match(/#94a3b8/g)!.length).toBeGreaterThanOrEqual(2); // line + arrowhead
  });
});
