/**
 * Demo fixture for the grid-level "box" view. Entirely FICTIONAL — invented
 * substation names and integer bus ids; no real network data belongs in this
 * repo. (The reference images are Baleares; nothing here is.)
 *
 * Each box is a real child diagram: a minimal one-bus SLD whose external feeders
 * carry stable ids, so the composite's box-lines anchor to them and stay live
 * when a box moves. Zoomed out the child renders as a voltage-coloured box; the
 * box/detail toggle (or an explorer fly-in) reveals the SLD underneath.
 */
import {
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  DiagramInstance,
  MapResolver,
  Serializer,
  buildDocument,
  newId,
  type ExternalDirection,
  type LineVertexJson,
  type SldDocument
} from '@sld-kit/core';

interface Feeder {
  id: string;
  label: string;
  direction: ExternalDirection;
}

/** A minimal one-bus substation whose feeders are the box's connection terminals. */
function buildSub(id: string, name: string, busId: number, voltageKv: number, feeders: Feeder[]): SldDocument {
  return buildDocument({
    meta: { id, name, substation: name, voltageKv, data: { busId } },
    busbars: [{ label: 'BB', row: 0 }],
    bays: feeders.map((f, i) => ({
      col: i,
      positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: f.label, direction: f.direction, id: f.id } }]
    }))
  });
}

// ── The six fictional buses ──────────────────────────────────────────────────
const SUBS: { id: string; name: string; bus: number; kv: number; x: number; y: number; feeders: Feeder[] }[] = [
  {
    id: 'lib-alpha', name: 'ALPHA', bus: 29925, kv: 400, x: 0, y: 0,
    feeders: [
      { id: 'alpha-bravo', label: 'L1', direction: 'right' },
      { id: 'alpha-charlie', label: 'T1', direction: 'down' }
    ]
  },
  {
    id: 'lib-bravo', name: 'BRAVO', bus: 29915, kv: 400, x: 560, y: 0,
    feeders: [{ id: 'bravo-alpha', label: 'L1', direction: 'left' }]
  },
  {
    id: 'lib-charlie', name: 'CHARLIE', bus: 39770, kv: 220, x: 0, y: 430,
    feeders: [
      { id: 'charlie-alpha', label: 'T1', direction: 'up' },
      { id: 'charlie-delta', label: 'L2', direction: 'right' }
    ]
  },
  {
    id: 'lib-delta', name: 'DELTA', bus: 39910, kv: 220, x: 560, y: 430,
    feeders: [
      { id: 'delta-charlie', label: 'L2', direction: 'left' },
      { id: 'delta-echo', label: 'C1', direction: 'right' }
    ]
  },
  {
    id: 'lib-echo', name: 'ECHO', bus: 39775, kv: 220, x: 1120, y: 430,
    feeders: [
      { id: 'echo-delta', label: 'C1', direction: 'left' },
      { id: 'echo-foxtrot', label: 'L3', direction: 'down' }
    ]
  },
  {
    id: 'lib-foxtrot', name: 'FOXTROT', bus: 39831, kv: 220, x: 1120, y: 860,
    feeders: [
      { id: 'foxtrot-echo', label: 'L3', direction: 'up' },
      { id: 'foxtrot-dem', label: 'D1', direction: 'down' }
    ]
  }
];

const anchor = (instanceId: string, connectionId: string): LineVertexJson => ({ kind: 'anchor', instanceId, connectionId });

/** World tip of a child's external feeder, in the current box layout. */
function feederTip(composite: CompositeDocument, instanceId: string, connectionId: string) {
  const engine = new CompositeLayoutEngine();
  return (
    engine
      .externalConnectionTips(engine.layout(composite).children)
      .find((t) => t.instanceId === instanceId && t.connectionId === connectionId)?.point ?? null
  );
}

/**
 * Straighten a vertical connection: nudge the lower box in x so its `up` feeder
 * tip sits directly under the upper box's `down` feeder tip. The two anchors then
 * share an x, so the orthogonal router draws a clean vertical instead of an elbow.
 * (Feeders land in different columns per child, and a left-exit reserves column
 * room, so the aligned x can't be hand-guessed — it's read back from the layout.)
 */
function alignVertical(
  composite: CompositeDocument,
  upperId: string,
  downConnId: string,
  lowerId: string,
  upConnId: string
): void {
  const top = feederTip(composite, upperId, downConnId);
  const bottom = feederTip(composite, lowerId, upConnId);
  const child = composite.getChild(lowerId);
  if (top && bottom && child) composite.setChildTransform(lowerId, child.x + (top.x - bottom.x), child.y, child.angleDeg);
}

/** Build the box composite: the six boxes plus lines of every kind between them. */
export function buildBoxComposite(): CompositeDocument {
  const resolver = new MapResolver(new Map(SUBS.map((s) => [s.id, Serializer.toJSON(buildSub(s.id, s.name, s.bus, s.kv, s.feeders))])));

  // `defaultRouting: 'orthogonal'` makes every line snap to the axis in the core
  // layout — the box-diagram rule — so lines are orthogonal regardless of where
  // the boxes sit. Individual lines can still override with their own `routing`.
  const composite = new CompositeDocument({
    id: 'box-overview',
    name: 'Example grid — box view',
    boxMode: true,
    defaultRouting: 'orthogonal'
  });

  // Instance id === library id here (each bus placed once), so anchors read clearly.
  for (const s of SUBS) composite.addChild(DiagramInstance.of({ id: s.id, libraryId: s.id, x: s.x, y: s.y }));

  // Overhead lines (solid), a transformer (circles) and a cable (dashed).
  composite.addLine(new CompositeLine(newId(), [anchor('lib-alpha', 'alpha-bravo'), anchor('lib-bravo', 'bravo-alpha')], 'line'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-alpha', 'alpha-charlie'), anchor('lib-charlie', 'charlie-alpha')], 'transformer'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-charlie', 'charlie-delta'), anchor('lib-delta', 'delta-charlie')], 'line'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-delta', 'delta-echo'), anchor('lib-echo', 'echo-delta')], 'cable'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-echo', 'echo-foxtrot'), anchor('lib-foxtrot', 'foxtrot-echo')], 'line'));

  composite.resolveChildren(resolver);

  // Line up the two vertical connections so they draw as clean verticals.
  alignVertical(composite, 'lib-alpha', 'alpha-charlie', 'lib-charlie', 'charlie-alpha');
  alignVertical(composite, 'lib-echo', 'echo-foxtrot', 'lib-foxtrot', 'foxtrot-echo');

  // The demand hangs straight down from FOXTROT (now aligned): anchor its 'down'
  // feeder, then drop a free end directly below the resolved tip so it stays vertical.
  const demTip = feederTip(composite, 'lib-foxtrot', 'foxtrot-dem');
  const demEnd: LineVertexJson = demTip
    ? { kind: 'point', x: demTip.x, y: demTip.y + 200 }
    : { kind: 'point', x: 1240, y: 1200 };
  composite.addLine(new CompositeLine(newId(), [anchor('lib-foxtrot', 'foxtrot-dem'), demEnd], 'demand'));

  return composite;
}

/** Voltage bucket → the `sld-volt-*` class the app CSS maps to `--sld-pos`. */
export function voltageClass(kv: number | undefined): string {
  if (kv != null && kv >= 400) return 'sld-volt-400';
  if (kv != null && kv >= 220) return 'sld-volt-220';
  if (kv != null && kv >= 100) return 'sld-volt-132';
  return 'sld-volt-unknown';
}

/** Voltage bucket → a light box-fill colour for the office-safe SVG export. */
export function voltageFill(kv: number | undefined): string {
  if (kv != null && kv >= 400) return '#dcfce7';
  if (kv != null && kv >= 220) return '#fae8ff';
  if (kv != null && kv >= 100) return '#dbeafe';
  return '#f1f5f9';
}
