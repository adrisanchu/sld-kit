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
  SetChildLabelCommand,
  LABEL_ANCHORS,
  resolveNameLabelLayout,
  MapResolver,
  Transform2D,
  type CompositeDocument,
  type SldDocumentJson
} from '../src';
import {
  buildSouth400,
  buildSouth220,
  buildWest400,
  buildSouthComposite,
  buildSouthCompositeWithLine,
  buildSouthWestComposite,
  SOUTH_400_ID,
  SOUTH_220_ID,
  WEST_400_ID,
  SOUTH_WEST_1,
  SOUTH_WEST_2,
  HV_INSTANCE_ID,
  SHARED_LINK_ID
} from './fixtures';

const cycle = (v: unknown) => JSON.parse(JSON.stringify(v));

function resolver() {
  const docs = new Map<string, SldDocumentJson>([
    [SOUTH_400_ID, Serializer.toJSON(buildSouth400())],
    [SOUTH_220_ID, Serializer.toJSON(buildSouth220())]
  ]);
  return new MapResolver(docs);
}

describe('CompositeSerializer', () => {
  it('roundtrips (kind + version stable)', () => {
    const doc = buildSouthComposite();
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
    const doc = buildSouthCompositeWithLine();
    const json1 = CompositeSerializer.toJSON(doc);
    expect(json1.version).toBe(COMPOSITE_SCHEMA_VERSION);
    expect(json1.lines).toHaveLength(1);
    expect(json1.lines[0].vertices).toHaveLength(3);
    const json2 = CompositeSerializer.toJSON(CompositeSerializer.fromJSON(cycle(json1)));
    expect(json2).toEqual(json1);
  });

  it('migrates a v1 document up to the current version with an empty line list', () => {
    const v1 = { version: 1, kind: 'composite', meta: { id: 'm', name: 'old' }, children: [] };
    const doc = CompositeSerializer.fromJSON(v1);
    const json = CompositeSerializer.toJSON(doc);
    expect(json.version).toBe(COMPOSITE_SCHEMA_VERSION);
    expect(json.lines).toEqual([]);
  });

  it('defaults label placement when migrating a pre-v3 child', () => {
    const v2 = {
      version: 2,
      kind: 'composite',
      meta: { id: 'm', name: 'old' },
      children: [{ id: 'c', libraryId: 'lib', x: 0, y: 0, angleDeg: 0 }],
      lines: []
    };
    const json = CompositeSerializer.toJSON(CompositeSerializer.fromJSON(v2));
    expect(json.children[0].labelAnchor).toBe('top-left');
    expect(json.children[0].labelDirection).toBe(0);
  });

  it('roundtrips a non-default label placement', () => {
    const doc = buildSouthComposite();
    const child = doc.allChildren()[0];
    doc.setChildLabel(child.id, 'bottom-right', 90);
    const json1 = CompositeSerializer.toJSON(doc);
    expect(json1.children[0].labelAnchor).toBe('bottom-right');
    expect(json1.children[0].labelDirection).toBe(90);
    const json2 = CompositeSerializer.toJSON(CompositeSerializer.fromJSON(cycle(json1)));
    expect(json2).toEqual(json1);
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

    const noLine = buildSouthComposite();
    noLine.resolveChildren(resolver());
    const autoLink = engine.layout(noLine).links.find((l) => l.connectionId === SHARED_LINK_ID);
    expect(autoLink).toBeDefined();

    const withLine = buildSouthCompositeWithLine();
    withLine.resolveChildren(resolver());
    const [line] = engine.layout(withLine).lines;
    expect(line.points).toHaveLength(3);
    expect(line.points[0]).toEqual(autoLink!.a.point);
    expect(line.points[2]).toEqual(autoLink!.b.point);
  });

  it('suppresses the auto-link for a connection id claimed by a manual line', () => {
    const doc = buildSouthCompositeWithLine();
    doc.resolveChildren(resolver());
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.links.some((l) => l.connectionId === SHARED_LINK_ID)).toBe(false);
    expect(layout.lines).toHaveLength(1);
  });

  it('anchored ends follow their child; free bends stay put', () => {
    const engine = new CompositeLayoutEngine();
    const doc = buildSouthCompositeWithLine();
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
    const doc = buildSouthComposite();
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
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const engine = new CompositeLayoutEngine();
    const layout = engine.layout(doc);
    const tips = engine.externalConnectionTips(layout.children);
    expect(tips.some((t) => t.connectionId === SHARED_LINK_ID)).toBe(true);
  });
});

describe('CompositeLayoutEngine', () => {
  it('auto-links children by shared external connection id', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.children).toHaveLength(2);
    expect(layout.links.map((l) => l.connectionId)).toContain(SHARED_LINK_ID);
  });

  it('leaves an unresolved child as a placeholder (no crash)', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(new MapResolver(new Map())); // resolves nothing
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.children.every((c) => c.layout === null)).toBe(true);
    expect(layout.links).toHaveLength(0);
  });

  it('labels each child with its resolved meta.name at the frame top-left', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const layout = new CompositeLayoutEngine().layout(doc);
    const hv = layout.children.find((c) => c.instance.libraryId === SOUTH_400_ID)!;
    expect(hv.name).toBe('South 400 kV');
    // Anchor is the top-left frame corner plus a small inset (child-local).
    expect(hv.nameLabel.x).toBeGreaterThan(hv.frame.x);
    expect(hv.nameLabel.y).toBeGreaterThan(hv.frame.y);
    expect(hv.nameLabel.x).toBeLessThan(hv.frame.x + hv.frame.width);
  });

  it('falls back to the libraryId when the child is unresolved', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(new MapResolver(new Map()));
    const layout = new CompositeLayoutEngine().layout(doc);
    expect(layout.children.map((c) => c.name)).toContain(SOUTH_400_ID);
  });

  it('places the name label at the chosen slot', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const child = doc.allChildren()[0];
    doc.setChildLabel(child.id, 'bottom-right', 0);
    const c = new CompositeLayoutEngine().layout(doc).children.find((x) => x.instance.id === child.id)!;
    expect(c.nameLabel.textAnchor).toBe('end');
    // Bottom slot sits in the lower half of the frame.
    expect(c.nameLabel.y).toBeGreaterThan(c.frame.y + c.frame.height / 2);
  });

  it('adds labelDirection into the label rotation', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const child = doc.allChildren()[0];
    doc.setChildTransform(child.id, child.x, child.y, 0); // angle 0 isolates direction
    doc.setChildLabel(child.id, 'top-left', 90); // 0 + flip(0+90)=0 → 90
    const c = new CompositeLayoutEngine().layout(doc).children.find((x) => x.instance.id === child.id)!;
    expect(c.nameLabel.rotation).toBe(90);
  });

  it('flips the label 180 so it never reads upside-down', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const child = doc.allChildren()[0];
    doc.setChildTransform(child.id, child.x, child.y, 180); // upside-down half
    doc.setChildLabel(child.id, 'top-left', 0); // 0 + flip(180)=180
    const c = new CompositeLayoutEngine().layout(doc).children.find((x) => x.instance.id === child.id)!;
    expect(c.nameLabel.rotation).toBe(180);
  });
});

describe('SetChildLabelCommand', () => {
  it('sets and undoes a child label placement', () => {
    const doc = buildSouthComposite();
    const child = doc.allChildren()[0];
    const stack = new CommandStack<CompositeDocument>();
    const before = { anchor: child.labelAnchor, direction: child.labelDirection };
    stack.execute(new SetChildLabelCommand(child.id, before, { anchor: 'bottom-center', direction: 270 }), doc);
    expect(child.labelAnchor).toBe('bottom-center');
    expect(child.labelDirection).toBe(270);
    stack.undo(doc);
    expect(child.labelAnchor).toBe(before.anchor);
    expect(child.labelDirection).toBe(before.direction);
  });

  it('normalizes an off-quarter direction to the nearest quarter turn', () => {
    const doc = buildSouthComposite();
    const child = doc.allChildren()[0];
    doc.setChildLabel(child.id, 'top-left', 100);
    expect(child.labelDirection).toBe(90);
    expect(LABEL_ANCHORS).toContain(child.labelAnchor);
  });

  it('keeps the label anchor inside the frame for every slot, direction and tilt', () => {
    const frame = { x: 0, y: 0, width: 360, height: 240 };
    for (const anchor of LABEL_ANCHORS) {
      for (const direction of [0, 90, 180, 270]) {
        // Sample tilts including the ones that trip the readability flip.
        for (const angleDeg of [0, 20, 90, 135, 200, 340]) {
          const { x, y } = resolveNameLabelLayout(frame, anchor, direction, angleDeg);
          expect(x).toBeGreaterThanOrEqual(frame.x);
          expect(x).toBeLessThanOrEqual(frame.x + frame.width);
          expect(y).toBeGreaterThanOrEqual(frame.y);
          expect(y).toBeLessThanOrEqual(frame.y + frame.height);
        }
      }
    }
  });
});

describe('CompositeSvgExporter', () => {
  it('exports a PowerPoint-safe SVG for a resolved composite', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const svg = new CompositeSvgExporter().export(doc);
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<foreignObject');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('renders a manual line as a plain path and stays Office-safe', () => {
    const doc = buildSouthCompositeWithLine();
    doc.resolveChildren(resolver());
    const svg = new CompositeSvgExporter().export(doc);
    // The free bend vertex {250,400} lands verbatim in the line path's `d`.
    expect(svg).toContain('250 400');
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<style');
    expect(svg).not.toContain('<foreignObject');
  });

  it('renders each child diagram name into the export', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const svg = new CompositeSvgExporter().export(doc);
    expect(svg).toContain('South 400 kV');
    expect(svg).toContain('South 220 kV');
  });

  it('renders the libraryId as the name for an unresolved child', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(new MapResolver(new Map()));
    const svg = new CompositeSvgExporter().export(doc);
    expect(svg).toContain(SOUTH_400_ID);
  });

  it('renders the diagram name bold and stays Office-safe', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    const svg = new CompositeSvgExporter().export(doc);
    expect(svg).toContain('font-weight="700"');
    expect(svg).not.toContain('class=');
    expect(svg).not.toContain('<style');
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

describe('South ⇄ West 400 kV (high-level authoring)', () => {
  it('builds a valid West 400 kV via the high-level API', () => {
    // The AddPositionCommand-based builder must produce a fully valid document
    // (auto-wiring + the two relinked tie-feeders), with no dangling refs.
    expect(buildWest400().validate()).toEqual([]);
  });

  it('exposes the two shared tie-feeder ids on both substations', () => {
    const west = buildWest400();
    const westIds = west.connections().map((c) => c.id);
    expect(westIds).toContain(SOUTH_WEST_1);
    expect(westIds).toContain(SOUTH_WEST_2);
    const southIds = buildSouth400().connections().map((c) => c.id);
    expect(southIds).toContain(SOUTH_WEST_1);
    expect(southIds).toContain(SOUTH_WEST_2);
  });

  it('auto-links the two substations through the shared feeder ids', () => {
    const doc = buildSouthWestComposite();
    doc.resolveChildren(
      new MapResolver(
        new Map<string, SldDocumentJson>([
          [SOUTH_400_ID, Serializer.toJSON(buildSouth400())],
          [WEST_400_ID, Serializer.toJSON(buildWest400())]
        ])
      )
    );
    const links = new CompositeLayoutEngine().layout(doc).links.map((l) => l.connectionId);
    expect(links).toContain(SOUTH_WEST_1);
    expect(links).toContain(SOUTH_WEST_2);
  });
});
