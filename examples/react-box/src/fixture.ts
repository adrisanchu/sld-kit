/**
 * Demo fixture for the grid-level "box" view. Entirely FICTIONAL — invented
 * substation names and integer bus ids; no real network data belongs in this
 * repo. (The reference images are Baleares; nothing here is.)
 *
 * Each box is a real child diagram: a minimal SLD whose external feeders carry
 * stable ids, so the composite's box-lines anchor to them and stay live when a
 * box moves. Zoomed out the child renders as a voltage-coloured box; the
 * box/detail toggle (or an explorer fly-in) reveals the SLD underneath.
 *
 * Most subs are single bus. CHARLIE is a **double bus with a coupler**: feeders
 * hang above BB1 or below BB2 (each on one fixed bar) and a coupler position
 * sits between the bars. Each bar carries its own integer bus id in `data`;
 * switching state is the core's first-class `Position.state` (absent = closed).
 * The coupler starts open, so the bars are two electrical nodes (see
 * `topology.ts`) and the box view shows two boxes (`39770`, `39771`) joined by a
 * muted tie; closed, they'd merge into one box labelled `39770 / 39771`.
 */
import {
  CompositeDocument,
  CompositeLine,
  DiagramInstance,
  MapResolver,
  Serializer,
  buildDocument,
  type CompositeLineKind,
  type ExternalDirection,
  type LineVertexJson,
  type BaySpec,
  type PositionType,
  type SldDocument
} from '@sld-kit/core';

interface Feeder {
  id: string;
  label: string;
  direction: ExternalDirection;
  /** Position type of the bay (default `line`). */
  type?: PositionType;
  /** Which bar a double-bus bay hangs off (1 = above BB1, 2 = below BB2). Ignored on single bus. */
  bar?: 1 | 2;
}

interface Sub {
  id: string;
  name: string;
  /** One bus id per bar: one entry = single bus, two = double bus with a coupler. */
  buses: number[];
  kv: number;
  x: number;
  y: number;
  feeders: Feeder[];
}

/** Stable position id for the bay feeding `feederId` (feeder ids are unique in the fixture). */
export const bayId = (feederId: string) => `pos-${feederId}`;

/** Stable id of a double-bus sub's coupler position. */
export const COUPLER_ID = 'coupler';

/**
 * A substation whose feeders are the box's connection terminals. Single bus:
 * one bar (row 0) with a bay per feeder below it. Double bus: BB1 (row 1) and
 * BB2 (row 3) with the coupler between them (row 2); bar-1 bays sit above BB1
 * (row 0), bar-2 bays below BB2 (row 4), so each bay wires to exactly one bar.
 */
function buildSub(sub: Sub): SldDocument {
  const meta = { id: sub.id, name: sub.name, substation: sub.name, voltageKv: sub.kv };
  const bay = (f: Feeder, col: number, row: number): BaySpec => ({
    col,
    positions: [
      {
        id: bayId(f.id),
        type: f.type ?? 'line',
        label: f.label,
        row,
        feeder: { asset: f.type === 'demand' ? 'demand' : 'line', label: f.label, direction: f.direction, id: f.id }
      }
    ]
  });

  if (sub.buses.length === 1) {
    return buildDocument({
      meta,
      busbars: [{ id: 'bb', label: 'BB', row: 0, data: { busId: sub.buses[0] } }],
      bays: sub.feeders.map((f, i) => bay(f, i, 1))
    });
  }

  const top = sub.feeders.filter((f) => (f.bar ?? 1) === 1);
  const bottom = sub.feeders.filter((f) => f.bar === 2);
  return buildDocument({
    meta,
    busbars: [
      { id: 'bb-1', label: 'BB1', row: 1, data: { busId: sub.buses[0] } },
      { id: 'bb-2', label: 'BB2', row: 3, data: { busId: sub.buses[1] } }
    ],
    bays: [
      ...top.map((f, i) => bay(f, i, 0)),
      // The coupler starts OPEN: the bars run split, so CHARLIE shows as two boxes
      // (39770 tied to ALPHA, 39771 to DELTA + the demand) joined by a muted tie.
      { col: top.length, positions: [{ id: COUPLER_ID, type: 'central', label: 'BC', row: 2, state: 'open' }] },
      ...bottom.map((f, i) => bay(f, top.length + 1 + i, 4))
    ]
  });
}

// ── The six fictional substations ────────────────────────────────────────────
const SUBS: Sub[] = [
  {
    id: 'lib-alpha', name: 'ALPHA', buses: [29925], kv: 400, x: 0, y: 0,
    feeders: [
      { id: 'alpha-bravo', label: 'L1', direction: 'right' },
      { id: 'alpha-charlie', label: 'T1', direction: 'down' }
    ]
  },
  {
    id: 'lib-bravo', name: 'BRAVO', buses: [29915], kv: 400, x: 560, y: 0,
    feeders: [{ id: 'bravo-alpha', label: 'L1', direction: 'left' }]
  },
  {
    // Double bus: T1 (to ALPHA) on BB1; L2 (to DELTA) and a demand on BB2.
    id: 'lib-charlie', name: 'CHARLIE', buses: [39770, 39771], kv: 220, x: 0, y: 430,
    feeders: [
      { id: 'charlie-alpha', label: 'T1', direction: 'up', bar: 1 },
      { id: 'charlie-delta', label: 'L2', direction: 'right', bar: 2 },
      { id: 'charlie-dem', label: 'D2', direction: 'down', type: 'demand', bar: 2 }
    ]
  },
  {
    id: 'lib-delta', name: 'DELTA', buses: [39910], kv: 220, x: 800, y: 430,
    feeders: [
      { id: 'delta-charlie', label: 'L2', direction: 'left' },
      { id: 'delta-echo', label: 'C1', direction: 'right' }
    ]
  },
  {
    id: 'lib-echo', name: 'ECHO', buses: [39775], kv: 220, x: 1360, y: 430,
    feeders: [
      { id: 'echo-delta', label: 'C1', direction: 'left' },
      { id: 'echo-foxtrot', label: 'L3', direction: 'down' }
    ]
  },
  {
    id: 'lib-foxtrot', name: 'FOXTROT', buses: [39831], kv: 220, x: 1360, y: 860,
    feeders: [
      { id: 'foxtrot-echo', label: 'L3', direction: 'up' },
      { id: 'foxtrot-dem', label: 'D1', direction: 'down', type: 'demand' }
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

// ── Line ratings (numeric labels) ────────────────────────────────────────────
/**
 * A rating reading for one composite line, mimicking a feed from the consumer's
 * electrical model (like the power-flow example's `POWER_FLOW_READINGS`). All
 * values FICTIONAL. Transformers carry an `mva` rating instead of a capacity.
 * Lines with no reading show no label — "exceptions are the norm".
 */
export interface LineRating {
  /** The `CompositeLine` id the reading addresses. */
  id: string;
  /**
   * Seasonal capacity (MW): always four slots in season order, any of which may
   * be empty. In practice either 2 values (winter + summer) or all 4.
   */
  capacity?: SeasonalCapacity;
  mva?: number;
}

/**
 * Four ordered seasonal slots. An empty slot is `undefined` (or `null` once the
 * document has been through JSON, which can't hold `undefined` in arrays).
 */
export type SeasonalCapacity = [
  winter: number | null | undefined,
  spring: number | null | undefined,
  summer: number | null | undefined,
  autumn: number | null | undefined
];

/** Shape folded into `CompositeLine.data` (core never reads it). */
export interface LineRatingData {
  ratings: Omit<LineRating, 'id'>;
}

export const LINE_RATINGS: LineRating[] = [
  { id: 'l-alpha-bravo', capacity: [1500, 1200, 1100, 1300] },
  { id: 'l-alpha-charlie', mva: 600 },
  { id: 'l-charlie-delta', capacity: [575, 510, 370, 455] },
  { id: 'l-delta-echo', capacity: [150, undefined, 100, undefined] } // winter/summer only
  // l-echo-foxtrot and the demand: deliberately unlabelled.
];

/** A line's `data` from its rating reading, if it has one (folded in when the line is built). */
export function ratingData(lineId: string, readings: LineRating[] = LINE_RATINGS): LineRatingData | undefined {
  const reading = readings.find((r) => r.id === lineId);
  if (!reading) return undefined;
  return { ratings: { capacity: reading.capacity, mva: reading.mva } };
}

/**
 * Format a seasonal capacity as label rows, like the reference drawings: all
 * four seasons give two rows, `winter/spring` over `summer/autumn`; winter +
 * summer only give one row, `winter/summer`. Empty slots are skipped.
 */
export function formatCapacity([winter, spring, summer, autumn]: SeasonalCapacity): string[] {
  const join = (...vals: (number | null | undefined)[]) => vals.filter((v) => v != null).join('/');
  const seasonal = spring != null || autumn != null;
  const rows = seasonal ? [join(winter, spring), join(summer, autumn)] : [join(winter, summer)];
  return rows.filter((r) => r.length > 0);
}

/**
 * The layout's `lineLabels` resolver: format a line's ratings into label rows
 * (`1200/1500`, `600 MVA`). This is where the consumer decides what a label says.
 */
export function ratingLabels(line: CompositeLine): string[] | null {
  const r = (line.data as LineRatingData | undefined)?.ratings;
  if (!r) return null;
  if (r.mva != null) return [`${r.mva} MVA`];
  return r.capacity ? formatCapacity(r.capacity) : null;
}

/** Build the box composite: the six boxes plus lines of every kind between them. */
export function buildBoxComposite(): CompositeDocument {
  const resolver = new MapResolver(new Map(SUBS.map((s) => [s.id, Serializer.toJSON(buildSub(s))])));

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
  // Stable ids so the rating readings can address each line.
  // Each line carries its rating reading (if any) in `data`, set at construction.
  const addLine = (id: string, vertices: LineVertexJson[], kind: CompositeLineKind) =>
    composite.addLine(new CompositeLine(id, vertices, kind, undefined, ratingData(id)));
  addLine('l-alpha-bravo', [anchor('lib-alpha', 'alpha-bravo'), anchor('lib-bravo', 'bravo-alpha')], 'line');
  addLine('l-alpha-charlie', [anchor('lib-alpha', 'alpha-charlie'), anchor('lib-charlie', 'charlie-alpha')], 'transformer');
  addLine('l-charlie-delta', [anchor('lib-charlie', 'charlie-delta'), anchor('lib-delta', 'delta-charlie')], 'line');
  addLine('l-delta-echo', [anchor('lib-delta', 'delta-echo'), anchor('lib-echo', 'echo-delta')], 'cable');
  addLine('l-echo-foxtrot', [anchor('lib-echo', 'echo-foxtrot'), anchor('lib-foxtrot', 'foxtrot-echo')], 'line');

  // Demands hang off a 'down' feeder as a node-relative lead — the router keeps
  // them attached and vertical in both views (no alignment pass, no absolute point).
  addLine('l-foxtrot-dem', demandLead('lib-foxtrot', 'foxtrot-dem'), 'demand');
  addLine('l-charlie-dem', demandLead('lib-charlie', 'charlie-dem'), 'demand');

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
