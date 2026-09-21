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

/**
 * A demand line: one anchored feeder end plus a placeholder free end. The box
 * router recomputes the free end as a node-relative *lead* (a stub off the
 * feeder's side), so the stored coordinate is never used — hence `(0, 0)`. This
 * is what replaces the old absolute-demand-point hack; the lead stays attached
 * and vertical in both the box and detail views.
 */
const demandLead = (instanceId: string, connectionId: string): LineVertexJson[] => [
  anchor(instanceId, connectionId),
  { kind: 'point', x: 0, y: 0 }
];

/** Build the box composite: the six boxes plus lines of every kind between them. */
export function buildBoxComposite(): CompositeDocument {
  const resolver = new MapResolver(new Map(SUBS.map((s) => [s.id, Serializer.toJSON(buildSub(s.id, s.name, s.bus, s.kv, s.feeders))])));

  // `defaultRouting: 'orthogonal'` selects the floating-connector auto router
  // (attach per view + computed bends), so lines stay orthogonal and attached
  // regardless of where the boxes sit. Individual lines can override with their
  // own `routing`. `autoFacing: true` demos the flexible archetype: a feeder's
  // exit side is derived from the live box positions, so dragging a box across
  // its peer flips which edge the tie leaves from — live, no code change. The
  // authored feeder directions stay the physical-truth base (a manual pin still
  // wins over auto).
  const composite = new CompositeDocument({
    id: 'box-overview',
    name: 'Example grid — box view',
    boxMode: true,
    defaultRouting: 'orthogonal',
    autoFacing: true
  });

  // Instance id === library id here (each bus placed once), so anchors read clearly.
  for (const s of SUBS) composite.addChild(DiagramInstance.of({ id: s.id, libraryId: s.id, x: s.x, y: s.y }));

  // Overhead lines (solid), a transformer (circles) and a cable (dashed).
  composite.addLine(new CompositeLine(newId(), [anchor('lib-alpha', 'alpha-bravo'), anchor('lib-bravo', 'bravo-alpha')], 'line'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-alpha', 'alpha-charlie'), anchor('lib-charlie', 'charlie-alpha')], 'transformer'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-charlie', 'charlie-delta'), anchor('lib-delta', 'delta-charlie')], 'line'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-delta', 'delta-echo'), anchor('lib-echo', 'echo-delta')], 'cable'));
  composite.addLine(new CompositeLine(newId(), [anchor('lib-echo', 'echo-foxtrot'), anchor('lib-foxtrot', 'foxtrot-echo')], 'line'));

  // The demand hangs off FOXTROT's 'down' feeder as a node-relative lead — the
  // router keeps it attached and vertical in both views (no alignment pass, no
  // absolute point).
  composite.addLine(new CompositeLine(newId(), demandLead('lib-foxtrot', 'foxtrot-dem'), 'demand'));

  composite.resolveChildren(resolver);

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
