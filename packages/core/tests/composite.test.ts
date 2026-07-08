import { describe, it, expect } from 'vitest';
import {
  Serializer,
  CompositeSerializer,
  COMPOSITE_SCHEMA_VERSION,
  CompositeLayoutEngine,
  CompositeSvgExporter,
  MapResolver,
  Transform2D,
  type SldDocumentJson
} from '../src';
import {
  buildExampleHv,
  buildExampleMv,
  buildExampleComposite,
  EXAMPLE_HV_ID,
  EXAMPLE_MV_ID,
  SHARED_LINK_ID
} from './fixtures';

const cycle = (v: unknown) => JSON.parse(JSON.stringify(v));

function resolver() {
  const docs = new Map<string, SldDocumentJson>([
    [EXAMPLE_HV_ID, Serializer.toJSON(buildExampleHv())],
    [EXAMPLE_MV_ID, Serializer.toJSON(buildExampleMv())]
  ]);
  return new MapResolver(docs);
}

describe('CompositeSerializer', () => {
  it('roundtrips (kind + version stable)', () => {
    const doc = buildExampleComposite();
    const json1 = CompositeSerializer.toJSON(doc);
    expect(json1.kind).toBe('composite');
    expect(json1.version).toBe(COMPOSITE_SCHEMA_VERSION);
    const json2 = CompositeSerializer.toJSON(CompositeSerializer.fromJSON(cycle(json1)));
    expect(json2).toEqual(json1);
  });

  it('rejects a non-composite document', () => {
    expect(() => CompositeSerializer.fromJSON({ version: 1, kind: 'diagram', meta: {}, children: [] })).toThrow(
      /not a composite/
    );
  });
});

describe('CompositeLayoutEngine', () => {
  it('auto-links children by shared external connection id', () => {
    const doc = buildExampleComposite();
    doc.resolveChildren(resolver());
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.children).toHaveLength(2);
    expect(layout.links.map((l) => l.connectionId)).toContain(SHARED_LINK_ID);
  });

  it('leaves an unresolved child as a placeholder (no crash)', () => {
    const doc = buildExampleComposite();
    doc.resolveChildren(new MapResolver(new Map())); // resolves nothing
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.children.every((c) => c.layout === null)).toBe(true);
    expect(layout.links).toHaveLength(0);
  });
});

describe('CompositeSvgExporter', () => {
  it('exports a PowerPoint-safe SVG for a resolved composite', () => {
    const doc = buildExampleComposite();
    doc.resolveChildren(resolver());
    const svg = new CompositeSvgExporter().export(doc);
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<foreignObject');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});

describe('Transform2D', () => {
  it('apply then invert is the identity', () => {
    const t = new Transform2D(400, 60, 90, { x: 100, y: 80 });
    const p = { x: 33, y: 77 };
    const back = t.invert(t.apply(p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('a 0° transform is a pure translation', () => {
    const t = new Transform2D(10, 20, 0, { x: 0, y: 0 });
    expect(t.apply({ x: 5, y: 5 })).toEqual({ x: 15, y: 25 });
  });
});
