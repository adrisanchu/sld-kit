import { describe, it, expect } from 'vitest';
import {
  Serializer,
  CompositeSerializer,
  COMPOSITE_SCHEMA_VERSION,
  CompositeLayoutEngine,
  CompositeSvgExporter,
  CompositeLine,
  CommandStack,
  TransformChildCommand,
  MapResolver,
  Transform2D,
  type CompositeDocument,
  type SldDocumentJson
} from '../src';
import {
  buildExampleHv,
  buildExampleMv,
  buildExampleComposite,
  buildExampleCompositeWithLine,
  EXAMPLE_HV_ID,
  EXAMPLE_MV_ID,
  HV_INSTANCE_ID,
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

  it('roundtrips manual lines (point + anchor vertices)', () => {
    const doc = buildExampleCompositeWithLine();
    const json1 = CompositeSerializer.toJSON(doc);
    expect(json1.version).toBe(2);
    expect(json1.lines).toHaveLength(1);
    expect(json1.lines[0].vertices).toHaveLength(3);
    const json2 = CompositeSerializer.toJSON(CompositeSerializer.fromJSON(cycle(json1)));
    expect(json2).toEqual(json1);
  });

  it('migrates a v1 document to v2 with an empty line list', () => {
    const v1 = { version: 1, kind: 'composite', meta: { id: 'm', name: 'old' }, children: [] };
    const doc = CompositeSerializer.fromJSON(v1);
    const json = CompositeSerializer.toJSON(doc);
    expect(json.version).toBe(COMPOSITE_SCHEMA_VERSION);
    expect(json.lines).toEqual([]);
  });

  it('rejects a line with fewer than two vertices', () => {
    const bad = {
      version: 2,
      kind: 'composite',
      meta: { id: 'm', name: 'x' },
      children: [],
      lines: [{ id: 'l', vertices: [{ kind: 'point', x: 0, y: 0 }] }]
    };
    expect(() => CompositeSerializer.fromJSON(bad)).toThrow(/at least two vertices/);
  });
});

describe('CompositeLayoutEngine — manual lines', () => {
  it('resolves anchored ends to the same tips the auto-link would use', () => {
    const engine = new CompositeLayoutEngine();

    const noLine = buildExampleComposite();
    noLine.resolveChildren(resolver());
    const autoLink = engine.layout(noLine).links.find((l) => l.connectionId === SHARED_LINK_ID);
    expect(autoLink).toBeDefined();

    const withLine = buildExampleCompositeWithLine();
    withLine.resolveChildren(resolver());
    const [line] = engine.layout(withLine).lines;
    expect(line.points).toHaveLength(3);
    expect(line.points[0]).toEqual(autoLink!.a.point);
    expect(line.points[2]).toEqual(autoLink!.b.point);
  });

  it('suppresses the auto-link for a connection id claimed by a manual line', () => {
    const doc = buildExampleCompositeWithLine();
    doc.resolveChildren(resolver());
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.links.some((l) => l.connectionId === SHARED_LINK_ID)).toBe(false);
    expect(layout.lines).toHaveLength(1);
  });

  it('anchored ends follow their child; free bends stay put', () => {
    const engine = new CompositeLayoutEngine();
    const doc = buildExampleCompositeWithLine();
    doc.resolveChildren(resolver());
    const before = engine.layout(doc).lines[0];

    const stack = new CommandStack<CompositeDocument>();
    stack.execute(
      new TransformChildCommand('Move diagram', HV_INSTANCE_ID, { x: 0, y: 0, angleDeg: 90 }, { x: 120, y: 0, angleDeg: 90 }),
      doc
    );
    const moved = engine.layout(doc).lines[0];
    // The HV-anchored end shifted with the child; the free bend did not.
    expect(moved.points[0]).not.toEqual(before.points[0]);
    expect(moved.points[0].x).toBeCloseTo(before.points[0].x + 120, 6);
    expect(moved.points[1]).toEqual({ x: 250, y: 400 });

    stack.undo(doc);
    expect(engine.layout(doc).lines[0].points[0]).toEqual(before.points[0]);
  });

  it('drops unresolvable anchors and omits a line with fewer than two points', () => {
    const doc = buildExampleComposite();
    doc.resolveChildren(resolver());
    doc.addLine(
      new CompositeLine('dangling', [
        { kind: 'anchor', instanceId: 'missing-a', connectionId: 'nope' },
        { kind: 'anchor', instanceId: 'missing-b', connectionId: 'nope' }
      ])
    );
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.lines).toHaveLength(0);
  });

  it('exposes external connection tips for snap/convert targets', () => {
    const doc = buildExampleComposite();
    doc.resolveChildren(resolver());
    const engine = new CompositeLayoutEngine();
    const layout = engine.layout(doc);
    const tips = engine.externalConnectionTips(layout.children);
    expect(tips.some((t) => t.connectionId === SHARED_LINK_ID)).toBe(true);
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

  it('renders a manual line as a plain path and stays Office-safe', () => {
    const doc = buildExampleCompositeWithLine();
    doc.resolveChildren(resolver());
    const svg = new CompositeSvgExporter().export(doc);
    // The free bend vertex {250,400} lands verbatim in the line path's `d`.
    expect(svg).toContain('250 400');
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<style');
    expect(svg).not.toContain('<foreignObject');
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
