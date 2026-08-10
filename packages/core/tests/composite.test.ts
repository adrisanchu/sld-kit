import { describe, it, expect } from 'vitest';
import {
  Serializer,
  CompositeSerializer,
  COMPOSITE_SCHEMA_VERSION,
  CompositeLayoutEngine,
  CompositeSvgExporter,
  CompositeLine,
  chordFrame,
  CommandStack,
  TransformChildCommand,
  SetChildLabelCommand,
  DiagramInstance,
  LABEL_ANCHORS,
  resolveNameLabelLayout,
  MapResolver,
  Transform2D,
  linkConnections,
  lineConnections,
  type SldElement,
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
  MV_INSTANCE_ID,
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

  it('roundtrips a manual line with a rel bend', () => {
    const doc = buildSouthComposite();
    doc.addLine(
      new CompositeLine('rel-line', [
        { kind: 'anchor', instanceId: doc.allChildren()[0].id, connectionId: SHARED_LINK_ID },
        { kind: 'rel', t: 0.5, ox: 12, oy: -8 },
        { kind: 'anchor', instanceId: doc.allChildren()[1].id, connectionId: SHARED_LINK_ID }
      ])
    );
    const json1 = CompositeSerializer.toJSON(doc);
    expect(json1.lines[0].vertices[1]).toEqual({ kind: 'rel', t: 0.5, ox: 12, oy: -8 });
    const json2 = CompositeSerializer.toJSON(CompositeSerializer.fromJSON(cycle(json1)));
    expect(json2).toEqual(json1);
  });

  it('rejects a rel vertex with non-finite coordinates', () => {
    const bad = {
      version: COMPOSITE_SCHEMA_VERSION,
      kind: 'composite',
      meta: { id: 'm', name: 'x' },
      children: [],
      lines: [{ id: 'l', vertices: [{ kind: 'rel', t: 0.5, ox: 1, oy: 2 }, { kind: 'rel', t: 0.5, ox: NaN, oy: 0 }] }]
    };
    expect(() => CompositeSerializer.fromJSON(bad)).toThrow(/invalid rel vertex/);
  });

  it('defaults label placement when a child omits it', () => {
    const doc = {
      version: COMPOSITE_SCHEMA_VERSION,
      kind: 'composite',
      meta: { id: 'm', name: 'x' },
      children: [{ id: 'c', libraryId: 'lib', x: 0, y: 0, angleDeg: 0 }],
      lines: []
    };
    const json = CompositeSerializer.toJSON(CompositeSerializer.fromJSON(doc));
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
      version: COMPOSITE_SCHEMA_VERSION,
      kind: 'composite',
      meta: { id: 'm', name: 'x' },
      children: [],
      lines: [{ id: 'l', vertices: [{ kind: 'point', x: 0, y: 0 }] }]
    };
    expect(() => CompositeSerializer.fromJSON(bad)).toThrow(/at least two vertices/);
  });
});

describe('CompositeLayoutEngine — manual lines', () => {
  it('resolves anchored ends to each child external connection tip', () => {
    const engine = new CompositeLayoutEngine();
    const withLine = buildSouthCompositeWithLine();
    withLine.resolveChildren(resolver());
    const layout = engine.layout(withLine);
    const [line] = layout.lines;
    expect(line.points).toHaveLength(3);
    // Each anchored end lands exactly on its child's connection tip — the same
    // point the auto-link would use (both go through externalTip). Comparing
    // within one composite keeps this independent of the fixture's transforms.
    const tipOf = (instanceId: string) =>
      engine
        .externalConnectionTips(layout.children)
        .find((t) => t.instanceId === instanceId && t.connectionId === SHARED_LINK_ID)!.point;
    expect(line.points[0]).toEqual(tipOf(HV_INSTANCE_ID));
    expect(line.points[2]).toEqual(tipOf(MV_INSTANCE_ID));
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

  it('resolves a rel bend to the same world point as the equivalent free bend', () => {
    const engine = new CompositeLayoutEngine();
    const doc = buildSouthCompositeWithLine();
    doc.resolveChildren(resolver());
    const before = engine.layout(doc).lines[0]; // point bend at index 1
    const [a, , b] = before.points;
    const rel = chordFrame(a, b)!.toRel(before.points[1]);

    // Same line, but the free bend is now stored relative to the anchor chord.
    doc.setLineVertices('line-1', [
      { kind: 'anchor', instanceId: HV_INSTANCE_ID, connectionId: SHARED_LINK_ID },
      { kind: 'rel', ...rel },
      { kind: 'anchor', instanceId: MV_INSTANCE_ID, connectionId: SHARED_LINK_ID }
    ]);
    const resolved = engine.layout(doc).lines[0];
    expect(resolved.points[1].x).toBeCloseTo(before.points[1].x, 6);
    expect(resolved.points[1].y).toBeCloseTo(before.points[1].y, 6);
  });

  it('a rel bend follows the endpoints, translating rigidly without rotating', () => {
    const engine = new CompositeLayoutEngine();
    const doc = buildSouthCompositeWithLine();
    doc.resolveChildren(resolver());
    const seed = engine.layout(doc).lines[0];
    const rel = chordFrame(seed.points[0], seed.points[2])!.toRel(seed.points[1]);
    doc.setLineVertices('line-1', [
      { kind: 'anchor', instanceId: HV_INSTANCE_ID, connectionId: SHARED_LINK_ID },
      { kind: 'rel', ...rel },
      { kind: 'anchor', instanceId: MV_INSTANCE_ID, connectionId: SHARED_LINK_ID }
    ]);
    const before = engine.layout(doc).lines[0];

    // Move BOTH children by the same delta: the whole line (anchors + bend) must
    // translate rigidly by that delta — a `point` bend would have stayed put, and
    // a similarity mapping would have swung the bend around the tilted chord.
    const dx = 120;
    const dy = -45;
    doc.setChildTransform(HV_INSTANCE_ID, 0 + dx, 0 + dy, 90); // HV starts at (0,0,90)
    doc.setChildTransform(MV_INSTANCE_ID, 400 + dx, 60 + dy, 90); // MV starts at (400,60,90)
    const after = engine.layout(doc).lines[0];
    for (let i = 0; i < 3; i++) {
      expect(after.points[i].x).toBeCloseTo(before.points[i].x + dx, 6);
      expect(after.points[i].y).toBeCloseTo(before.points[i].y + dy, 6);
    }
  });

  it('drops a rel bend when the line lacks two resolvable anchors (no chord)', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(resolver());
    doc.addLine(
      new CompositeLine('one-anchor', [
        { kind: 'anchor', instanceId: doc.allChildren()[0].id, connectionId: SHARED_LINK_ID },
        { kind: 'rel', t: 0.5, ox: 20, oy: -10 },
        { kind: 'point', x: 900, y: 900 }
      ])
    );
    const line = new CompositeLayoutEngine().layout(doc).lines.find((l) => l.line.id === 'one-anchor')!;
    // The rel bend is dropped (one anchor → no frame); the anchor tip and the
    // absolute point remain, so the line still renders with two points.
    expect(line.points).toHaveLength(2);
    expect(line.points).toContainEqual({ x: 900, y: 900 });
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
    doc.setChildTransform(child.id, child.x, child.y, 0); // angle 0 isolates slot placement from the fixture's rotation
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

describe('DiagramInstance.of', () => {
  it('fills constructor defaults (fresh id, origin, no rotation, top-left label)', () => {
    const inst = DiagramInstance.of({ libraryId: 'lib-x' });
    expect(inst.libraryId).toBe('lib-x');
    expect(inst.id).toBeTruthy();
    expect([inst.x, inst.y, inst.angleDeg]).toEqual([0, 0, 0]);
    expect(inst.labelAnchor).toBe('top-left');
    expect(inst.labelDirection).toBe(0);
  });

  it('places a child with an explicit label anchor + direction in one pass', () => {
    const inst = DiagramInstance.of({
      id: 'inst-a',
      libraryId: 'lib-x',
      x: 10,
      y: 20,
      angleDeg: 90,
      label: { anchor: 'center-left', direction: 90 }
    });
    expect(inst.id).toBe('inst-a');
    expect([inst.x, inst.y, inst.angleDeg]).toEqual([10, 20, 90]);
    expect(inst.labelAnchor).toBe('center-left');
    expect(inst.labelDirection).toBe(90);
  });

  it('normalizes an off-quarter label direction', () => {
    const inst = DiagramInstance.of({ libraryId: 'lib-x', label: { anchor: 'top-right', direction: 100 } });
    expect(inst.labelDirection).toBe(90);
  });

  it('roundtrips the label through toJSON/fromJSON', () => {
    const inst = DiagramInstance.of({ libraryId: 'lib-x', label: { anchor: 'bottom-center', direction: 270 } });
    const back = DiagramInstance.fromJSON(cycle(inst.toJSON()));
    expect(back.labelAnchor).toBe('bottom-center');
    expect(back.labelDirection).toBe(270);
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

  // A consumer-side resolver: style any element flagged `data.mark`. The core
  // never reads `data` — it just applies this over the tie-line's backing
  // connections (see `firstFormat` + `linkConnections`/`lineConnections`).
  const byMark = (el: SldElement) =>
    (el.data as { mark?: boolean } | undefined)?.mark ? { strokeWidth: 4, dashArray: '2 3' } : undefined;

  function taggedResolver(id: string) {
    const s400 = buildSouth400();
    s400.getElement(id)!.data = { mark: true };
    return new MapResolver(
      new Map<string, SldDocumentJson>([
        [SOUTH_400_ID, Serializer.toJSON(s400)],
        [SOUTH_220_ID, Serializer.toJSON(buildSouth220())]
      ])
    );
  }

  it('restyles the auto-link tie-line from a resolver match in one child', () => {
    // Flag the shared connection in the 400 kV child only; the tie-line must pick it up.
    const doc = buildSouthComposite();
    doc.resolveChildren(taggedResolver(SHARED_LINK_ID));
    const svg = new CompositeSvgExporter().export(doc, { theme: { resolveElementFormat: byMark } });
    expect(svg).toContain('stroke-dasharray="2 3"');
    expect(svg).toContain('stroke-width="4"');
  });

  it('exposes the backing connections of an auto-link (both ends, structural)', () => {
    const doc = buildSouthComposite();
    doc.resolveChildren(taggedResolver(SHARED_LINK_ID));
    const layout = new CompositeLayoutEngine().layout(doc);
    const link = layout.links.find((l) => l.connectionId === SHARED_LINK_ID)!;
    const conns = linkConnections(link, layout.children);
    // Two ends resolve; exactly the flagged one carries the consumer's tag.
    expect(conns.length).toBe(2);
    expect(conns.filter((c) => (c.data as { mark?: boolean } | undefined)?.mark)).toHaveLength(1);
  });

  it('restyles a hand-drawn manual line from a resolver match on its anchored connection', () => {
    // `buildSouthCompositeWithLine` draws a manual line anchored to SHARED_LINK_ID.
    const doc = buildSouthCompositeWithLine();
    doc.resolveChildren(taggedResolver(SHARED_LINK_ID));
    const layout = new CompositeLayoutEngine().layout(doc);
    const line = layout.lines.find((l) => l.line.id === 'line-1')!;
    // The tag is reachable through the manual line's anchor vertices.
    expect(lineConnections(line.line, layout.children).some((c) => (c.data as { mark?: boolean }).mark)).toBe(true);

    const svg = new CompositeSvgExporter().export(doc, { theme: { resolveElementFormat: byMark } });
    expect(svg).toContain('stroke-dasharray="2 3"');
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

  it('draws the two custom tie-lines and suppresses their auto-links', () => {
    const doc = buildSouthWestComposite();
    doc.resolveChildren(
      new MapResolver(
        new Map<string, SldDocumentJson>([
          [SOUTH_400_ID, Serializer.toJSON(buildSouth400())],
          [WEST_400_ID, Serializer.toJSON(buildWest400())]
        ])
      )
    );
    const layout = new CompositeLayoutEngine().layout(doc);
    // Two hand-routed lines claim south-west-1/2, so the straight auto-links are
    // replaced by the polylines (each: 2 anchored ends + 4 free bends).
    expect(layout.lines).toHaveLength(2);
    for (const line of layout.lines) expect(line.points).toHaveLength(6);
    const linkIds = layout.links.map((l) => l.connectionId);
    expect(linkIds).not.toContain(SOUTH_WEST_1);
    expect(linkIds).not.toContain(SOUTH_WEST_2);
  });

  it('the seed tie-lines relativize on open and then follow the diagrams', () => {
    // The demo authors these lines with absolute `point` bends; the editor's
    // on-load upgrade converts them to `rel`. Replicate that here against the
    // real seed data and confirm the bends then translate with the diagrams
    // instead of staying frozen.
    const engine = new CompositeLayoutEngine();
    const doc = buildSouthWestComposite();
    doc.resolveChildren(
      new MapResolver(
        new Map<string, SldDocumentJson>([
          [SOUTH_400_ID, Serializer.toJSON(buildSouth400())],
          [WEST_400_ID, Serializer.toJSON(buildWest400())]
        ])
      )
    );

    for (const ln of engine.layout(doc).lines) {
      const vs = ln.line.vertices;
      if (ln.points.length !== vs.length) continue;
      let first = -1;
      let last = -1;
      vs.forEach((v, i) => {
        if (v.kind === 'anchor') {
          if (first < 0) first = i;
          last = i;
        }
      });
      if (first < 0 || first === last) continue;
      const frame = chordFrame(ln.points[first], ln.points[last]);
      if (!frame) continue;
      doc.setLineVertices(
        ln.line.id,
        vs.map((v, i) => (v.kind === 'point' ? { kind: 'rel' as const, ...frame.toRel(ln.points[i]) } : v))
      );
    }

    // Every free bend on both seed lines is now relative — nothing left absolute.
    for (const line of doc.allLines()) {
      expect(line.vertices.some((v) => v.kind === 'rel')).toBe(true);
      expect(line.vertices.filter((v) => v.kind === 'point')).toHaveLength(0);
    }

    // Shift both diagrams by the same delta: the whole line must translate rigidly.
    const before = engine.layout(doc);
    const [a, b] = doc.allChildren();
    const dx = 200;
    const dy = -120;
    doc.setChildTransform(a.id, a.x + dx, a.y + dy, a.angleDeg);
    doc.setChildTransform(b.id, b.x + dx, b.y + dy, b.angleDeg);
    const after = engine.layout(doc);
    for (let li = 0; li < before.lines.length; li++) {
      for (let i = 0; i < before.lines[li].points.length; i++) {
        expect(after.lines[li].points[i].x).toBeCloseTo(before.lines[li].points[i].x + dx, 6);
        expect(after.lines[li].points[i].y).toBeCloseTo(before.lines[li].points[i].y + dy, 6);
      }
    }
  });
});
