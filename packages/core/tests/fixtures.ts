/**
 * Test fixtures — a self-contained, fictional grid with two substations,
 * **South** (a 400 kV level + a 220 kV level) and **West** (a 400 kV level),
 * plus composites linking them. The data is invented; it exists only to
 * exercise the full model surface.
 *
 * Two authoring styles live side by side on purpose (see issue #21):
 *  - **Explicit** — `buildSouth400` / `buildSouth220` hand-place every element
 *    and hand-wire every connection. Full control, maximum verbosity.
 *  - **Declarative** — `buildWest400` uses `buildDocument`: describe the bars and
 *    columns of bays, hang a feeder off each outer position, and the grid,
 *    series-wiring, auto-naming and validation follow. The cross-substation
 *    tie-lines get their shared ids straight from each feeder's `id`.
 *
 * South 400 kV and West 400 kV are tied together through two feeders that share
 * the connection ids `south-west-1` / `south-west-2`, so a composite auto-links
 * them (the same mechanism the South levels use via `SHARED_LINK_ID`).
 *
 * Kept in `tests/` (not shipped) because this is demo content, not library
 * code. Uses only the public `@sld-kit/core` surface via `../src`.
 */
import {
  SldDocument,
  BusBar,
  Position,
  Connection,
  CompositeDocument,
  CompositeLine,
  DiagramInstance,
  buildDocument,
  element,
  external,
  newId,
  type ExternalAssetKind,
  type ExternalDirection
} from '../src';

export const SOUTH_400_ID = 'south-400';
export const SOUTH_220_ID = 'south-220';
export const WEST_400_ID = 'west-400';
export const SOUTH_COMPOSITE_ID = 'south-composite';

/** Shared external id tying the South 400 kV and 220 kV levels (transformer). */
export const SHARED_LINK_ID = 'cn-shared-transformer';

/** Shared external ids tying South 400 kV to West 400 kV (two feeders). */
export const SOUTH_WEST_1 = 'south-west-1';
export const SOUTH_WEST_2 = 'south-west-2';

// Thin aliases over the public endpoint helpers, kept for terse call sites below.
const el = element;
const ext = (asset: ExternalAssetKind, label: string, direction: ExternalDirection, side?: 'left' | 'right') =>
  external({ asset, label, direction, side });

/**
 * South 400 kV (explicit authoring): two bars, 3+4+3 positions, two empty slots.
 * Two of its feeders are the tie-lines to West 400 kV — they carry the shared
 * ids `south-west-1` / `south-west-2` and the labels "WEST 1" / "WEST 2".
 */
export function buildSouth400(): SldDocument {
  const doc = new SldDocument(
    { id: SOUTH_400_ID, name: 'South 400 kV', substation: 'South', voltageKv: 400 },
    { rows: 5, cols: 4 }
  );

  doc.addElement(BusBar.of({ id: 'bb-1', label: 'BB1', row: 0 }));
  doc.addElement(BusBar.of({ id: 'bb-2', label: 'BB2', row: 4 }));

  doc.addElement(Position.of({ id: 'pos-c0t', label: 'R1', type: 'renewable', row: 1, col: 0 }));
  doc.addElement(Position.of({ id: 'pos-c1t', label: 'L1', type: 'line', row: 1, col: 1 }));
  doc.addElement(Position.of({ id: 'pos-c2t', label: 'L2', type: 'line', row: 1, col: 2 }));

  doc.addElement(Position.of({ id: 'pos-c0m', label: 'C1', type: 'central', row: 2, col: 0 }));
  doc.addElement(Position.of({ id: 'pos-c1m', label: 'C2', type: 'central', row: 2, col: 1 }));
  doc.addElement(Position.of({ id: 'pos-c2m', label: 'C3', type: 'central', row: 2, col: 2 }));
  doc.addElement(Position.of({ id: 'pos-c3m', label: 'C4', type: 'central', row: 2, col: 3 }));

  doc.addElement(Position.of({ id: 'pos-c1b', label: 'L3', type: 'line', row: 3, col: 1 }));
  doc.addElement(Position.of({ id: 'pos-c2b', label: 'T1', type: 'transformer', row: 3, col: 2 }));
  doc.addElement(Position.of({ id: 'pos-c3b', label: 'L4', type: 'line', row: 3, col: 3 }));

  const bays = [
    { top: 'pos-c0t', mid: 'pos-c0m', bottom: null },
    { top: 'pos-c1t', mid: 'pos-c1m', bottom: 'pos-c1b' },
    { top: 'pos-c2t', mid: 'pos-c2m', bottom: 'pos-c2b' },
    { top: null, mid: 'pos-c3m', bottom: 'pos-c3b' }
  ];
  for (const bay of bays) {
    if (bay.top) {
      doc.addElement(Connection.of({ id: `cn-${bay.top}-bar`, from: el(bay.top), to: el('bb-1') }));
      doc.addElement(Connection.of({ id: `cn-${bay.mid}-top`, from: el(bay.mid), to: el(bay.top) }));
    } else {
      doc.addElement(Connection.of({ id: `cn-${bay.mid}-up`, from: el(bay.mid), to: el('bb-1') }));
    }
    if (bay.bottom) {
      doc.addElement(Connection.of({ id: `cn-${bay.bottom}-bar`, from: el(bay.bottom), to: el('bb-2') }));
      doc.addElement(Connection.of({ id: `cn-${bay.mid}-bot`, from: el(bay.mid), to: el(bay.bottom) }));
    } else {
      doc.addElement(Connection.of({ id: `cn-${bay.mid}-down`, from: el(bay.mid), to: el('bb-2') }));
    }
  }

  doc.addElement(Connection.of({ id: 'cn-c0t-ext', from: el('pos-c0t'), to: ext('renewable', 'SOLAR PARK 1', 'up') }));
  // Tie-line to West 400 kV — shared id `south-west-1`.
  doc.addElement(Connection.of({ id: SOUTH_WEST_1, from: el('pos-c1t', 'below'), to: ext('line', 'WEST 1', 'up', 'right') }));
  doc.addElement(Connection.of({ id: 'cn-c2t-ext', from: el('pos-c2t'), to: ext('line', 'FEEDER B', 'up') }));
  doc.addElement(Connection.of({ id: 'cn-c1b-ext', from: el('pos-c1b'), to: ext('line', 'FEEDER C', 'down') }));
  // Shared id with the 220 kV level — the composite auto-links the two levels here.
  doc.addElement(Connection.of({ id: SHARED_LINK_ID, from: el('pos-c2b'), to: ext('transformer', 'TIE 220 kV', 'down') }));
  // Tie-line to West 400 kV — shared id `south-west-2`.
  doc.addElement(Connection.of({ id: SOUTH_WEST_2, from: el('pos-c3b', 'above'), to: ext('line', 'WEST 2', 'down') }));

  return doc;
}

/** South 220 kV (explicit): double busbar, bays fanning upward + one transformer bay down. */
export function buildSouth220(): SldDocument {
  const doc = new SldDocument(
    { id: SOUTH_220_ID, name: 'South 220 kV', substation: 'South', voltageKv: 220 },
    { rows: 4, cols: 8 }
  );

  doc.addElement(BusBar.of({ id: 'bb-1', label: 'BB1', row: 1 }));
  doc.addElement(BusBar.of({ id: 'bb-2', label: 'BB2', row: 2 }));

  doc.addElement(Position.of({ id: 'pos-b0', label: 'L1', type: 'line', row: 0, col: 0 }));
  doc.addElement(Connection.of({ id: 'cn-b0-b1', from: el('pos-b0'), to: el('bb-1') }));
  doc.addElement(Connection.of({ id: 'cn-b0-b2', from: el('pos-b0'), to: el('bb-2') }));
  doc.addElement(Connection.of({ id: 'cn-b0-ext', from: el('pos-b0', 'above'), to: ext('line', 'FEEDER E', 'up') }));

  doc.addElement(Position.of({ id: 'pos-b1', label: 'L2', type: 'line', row: 0, col: 1 }));
  doc.addElement(Connection.of({ id: 'cn-b1-b1', from: el('pos-b1'), to: el('bb-1') }));
  doc.addElement(Connection.of({ id: 'cn-b1-b2', from: el('pos-b1'), to: el('bb-2') }));
  doc.addElement(Connection.of({ id: 'cn-b1-ext', from: el('pos-b1', 'above'), to: ext('line', 'FEEDER F', 'up') }));

  // Coupling bay: wired to both bars, no outgoing line.
  doc.addElement(Position.of({ id: 'pos-b2', label: 'C1', type: 'central', row: 0, col: 2 }));
  doc.addElement(Connection.of({ id: 'cn-b2-b1', from: el('pos-b2'), to: el('bb-1') }));
  doc.addElement(Connection.of({ id: 'cn-b2-b2', from: el('pos-b2'), to: el('bb-2') }));

  doc.addElement(Position.of({ id: 'pos-b3', label: 'R1', type: 'renewable', row: 0, col: 4 }));
  doc.addElement(Connection.of({ id: 'cn-b3-b1', from: el('pos-b3'), to: el('bb-1') }));
  doc.addElement(Connection.of({ id: 'cn-b3-b2', from: el('pos-b3'), to: el('bb-2') }));
  doc.addElement(Connection.of({ id: 'cn-b3-ext', from: el('pos-b3', 'above'), to: ext('renewable', 'SOLAR PARK 2', 'up') }));

  doc.addElement(Position.of({ id: 'pos-b4', label: 'L3', type: 'line', row: 0, col: 6 }));
  doc.addElement(Connection.of({ id: 'cn-b4-b1', from: el('pos-b4'), to: el('bb-1') }));
  doc.addElement(Connection.of({ id: 'cn-b4-b2', from: el('pos-b4'), to: el('bb-2') }));
  doc.addElement(Connection.of({ id: 'cn-b4-ext', from: el('pos-b4', 'above'), to: ext('line', 'FEEDER G', 'up') }));

  doc.addElement(Position.of({ id: 'pos-b5', label: 'L4', type: 'line', row: 0, col: 7 }));
  doc.addElement(Connection.of({ id: 'cn-b5-b1', from: el('pos-b5'), to: el('bb-1') }));
  doc.addElement(Connection.of({ id: 'cn-b5-b2', from: el('pos-b5'), to: el('bb-2') }));
  doc.addElement(Connection.of({ id: 'cn-b5-ext', from: el('pos-b5', 'above'), to: ext('line', 'FEEDER H', 'up') }));

  // Transformer bay dropping to the 400 kV level.
  doc.addElement(Position.of({ id: 'pos-tr', label: 'T1', type: 'transformer', row: 3, col: 3 }));
  doc.addElement(Connection.of({ id: 'cn-tr-b1', from: el('pos-tr'), to: el('bb-1') }));
  doc.addElement(Connection.of({ id: 'cn-tr-b2', from: el('pos-tr'), to: el('bb-2') }));
  // Shared id with the 400 kV level's transformer external → composite link.
  doc.addElement(Connection.of({ id: SHARED_LINK_ID, from: el('pos-tr', 'below'), to: ext('transformer', 'TIE 400 kV', 'down') }));

  return doc;
}

/**
 * West 400 kV (declarative authoring): a breaker-and-a-half layout mirroring
 * South 400 kV — feeder bays on the outer rows with a `central` position in
 * between, so each column forms a BB1—top—central—bottom—BB2 chain. It also
 * shows off the `storage` (battery) and `demand` (consumer/load) position types.
 *
 * Built with `buildDocument`: describe the bars and the columns of bays, hang a
 * feeder off each outer position, and the grid, series-wiring and validation
 * follow. The two tie-lines back to South 400 kV get the shared ids
 * `south-west-1` / `south-west-2` via each feeder's `id`, so a composite
 * auto-links them (SOUTH 1 leaves a top position toward BB1, SOUTH 2 the
 * bottom-right one toward BB2, matching WEST 1 / WEST 2 on South).
 */
export function buildWest400(): SldDocument {
  return buildDocument({
    meta: { id: WEST_400_ID, name: 'West 400 kV', substation: 'West', voltageKv: 400 },
    busbars: [
      { label: 'BB1', row: 0 },
      { label: 'BB2', row: 4 }
    ],
    bays: [
      {
        col: 0,
        positions: [
          { type: 'line', label: 'L1', row: 1, feeder: { asset: 'line', label: 'SOUTH 1', id: SOUTH_WEST_1 } },
          { type: 'central', label: 'C1', row: 2 }
        ]
      },
      {
        col: 1,
        positions: [
          { type: 'storage', label: 'S1', row: 1, feeder: { asset: 'storage', label: 'STORAGE W1' } },
          { type: 'central', label: 'C2', row: 2 },
          { type: 'demand', label: 'D1', row: 3, feeder: { asset: 'demand', label: 'CONSUMER W1' } }
        ]
      },
      {
        col: 2,
        positions: [
          { type: 'central', label: 'C3', row: 2 },
          { type: 'line', label: 'L3', row: 3, feeder: { asset: 'line', label: 'SOUTH 2', id: SOUTH_WEST_2 } }
        ]
      }
    ]
  });
}

/** Composite of the two South voltage levels, both rotated an angle. */
export function buildSouthComposite(): CompositeDocument {
  const doc = new CompositeDocument({ id: SOUTH_COMPOSITE_ID, name: 'South — overview' });
  doc.addChild(new DiagramInstance(newId(), SOUTH_400_ID, 250, 230, 222));
  doc.addChild(new DiagramInstance(newId(), SOUTH_220_ID, 400, -300, 40));
  return doc;
}

/** Stable instance ids for the South ⇄ West composite — its manual lines anchor to them. */
const SW_SOUTH_INSTANCE_ID = 'inst-sw-south';
const SW_WEST_INSTANCE_ID = 'inst-sw-west';

/**
 * Composite tying South 400 kV to West 400 kV. The two feeders sharing
 * `south-west-1` / `south-west-2` are drawn as hand-routed manual lines — each
 * anchored to the matching feeder on both children with free bends between — so
 * they claim those ids and replace the default straight dashed auto-links.
 */
export function buildSouthWestComposite(): CompositeDocument {
  const doc = new CompositeDocument({ id: 'south-west-composite', name: 'South ⇄ West 400 kV' });
  doc.addChild(new DiagramInstance(SW_SOUTH_INSTANCE_ID, SOUTH_400_ID, -300, 60, 0));
  doc.addChild(new DiagramInstance(SW_WEST_INSTANCE_ID, WEST_400_ID, 1266, -802, 0));
  doc.addLine(
    new CompositeLine('sw-line-1', [
      { kind: 'anchor', instanceId: SW_SOUTH_INSTANCE_ID, connectionId: SOUTH_WEST_1 },
      { kind: 'point', x: 65, y: 33 },
      { kind: 'point', x: 475, y: 24 },
      { kind: 'point', x: 1236, y: -135 },
      { kind: 'point', x: 1234, y: -749 },
      { kind: 'anchor', instanceId: SW_WEST_INSTANCE_ID, connectionId: SOUTH_WEST_1 }
    ])
  );
  doc.addLine(
    new CompositeLine('sw-line-2', [
      { kind: 'anchor', instanceId: SW_SOUTH_INSTANCE_ID, connectionId: SOUTH_WEST_2 },
      { kind: 'point', x: 495, y: 686 },
      { kind: 'point', x: 494, y: 89 },
      { kind: 'point', x: 1242, y: -72 },
      { kind: 'point', x: 1777, y: -91 },
      { kind: 'anchor', instanceId: SW_WEST_INSTANCE_ID, connectionId: SOUTH_WEST_2 }
    ])
  );
  return doc;
}

/** Stable instance ids so line-anchor tests can reference the two children. */
export const HV_INSTANCE_ID = 'inst-hv';
export const MV_INSTANCE_ID = 'inst-mv';

/**
 * Same South composite but with a manual line whose two ends are anchored to the
 * shared transformer connection on each child, plus one free bend between them.
 * The line claims `SHARED_LINK_ID`, so it replaces the auto-link for that id.
 */
export function buildSouthCompositeWithLine(): CompositeDocument {
  const doc = new CompositeDocument({ id: SOUTH_COMPOSITE_ID, name: 'South — overview' });
  doc.addChild(new DiagramInstance(HV_INSTANCE_ID, SOUTH_400_ID, 0, 0, 90));
  doc.addChild(new DiagramInstance(MV_INSTANCE_ID, SOUTH_220_ID, 400, 60, 90));
  doc.addLine(
    new CompositeLine('line-1', [
      { kind: 'anchor', instanceId: HV_INSTANCE_ID, connectionId: SHARED_LINK_ID },
      { kind: 'point', x: 250, y: 400 },
      { kind: 'anchor', instanceId: MV_INSTANCE_ID, connectionId: SHARED_LINK_ID }
    ])
  );
  return doc;
}
