/**
 * Test fixtures — a self-contained, fictional grid with two substations,
 * **South** (a 400 kV level + a 220 kV level) and **West** (a 400 kV level),
 * plus composites linking them. The data is invented; it exists only to
 * exercise the full model surface.
 *
 * Two authoring styles live side by side on purpose (see issue #21):
 *  - **Explicit** — `buildSouth400` / `buildSouth220` hand-place every element
 *    and hand-wire every connection. Full control, maximum verbosity.
 *  - **High-level** — `buildWest400` uses `CommandStack` + `AddPositionCommand`,
 *    which auto-wires each bay to its column neighbours and spawns its outgoing
 *    feeder; only the cross-substation tie-lines are then relinked by hand.
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
  CommandStack,
  AddPositionCommand,
  RenameElementCommand,
  UpdateElementCommand,
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

  doc.addElement(new BusBar('bb-1', 'BB1', 0));
  doc.addElement(new BusBar('bb-2', 'BB2', 4));

  doc.addElement(new Position('pos-c0t', 'R1', 'renewable', 1, 0));
  doc.addElement(new Position('pos-c1t', 'L1', 'line', 1, 1));
  doc.addElement(new Position('pos-c2t', 'L2', 'line', 1, 2));

  doc.addElement(new Position('pos-c0m', 'C1', 'central', 2, 0));
  doc.addElement(new Position('pos-c1m', 'C2', 'central', 2, 1));
  doc.addElement(new Position('pos-c2m', 'C3', 'central', 2, 2));
  doc.addElement(new Position('pos-c3m', 'C4', 'central', 2, 3));

  doc.addElement(new Position('pos-c1b', 'L3', 'line', 3, 1));
  doc.addElement(new Position('pos-c2b', 'T1', 'transformer', 3, 2));
  doc.addElement(new Position('pos-c3b', 'L4', 'line', 3, 3));

  const bays = [
    { top: 'pos-c0t', mid: 'pos-c0m', bottom: null },
    { top: 'pos-c1t', mid: 'pos-c1m', bottom: 'pos-c1b' },
    { top: 'pos-c2t', mid: 'pos-c2m', bottom: 'pos-c2b' },
    { top: null, mid: 'pos-c3m', bottom: 'pos-c3b' }
  ];
  for (const bay of bays) {
    if (bay.top) {
      doc.addElement(new Connection(`cn-${bay.top}-bar`, '', el(bay.top), el('bb-1')));
      doc.addElement(new Connection(`cn-${bay.mid}-top`, '', el(bay.mid), el(bay.top)));
    } else {
      doc.addElement(new Connection(`cn-${bay.mid}-up`, '', el(bay.mid), el('bb-1')));
    }
    if (bay.bottom) {
      doc.addElement(new Connection(`cn-${bay.bottom}-bar`, '', el(bay.bottom), el('bb-2')));
      doc.addElement(new Connection(`cn-${bay.mid}-bot`, '', el(bay.mid), el(bay.bottom)));
    } else {
      doc.addElement(new Connection(`cn-${bay.mid}-down`, '', el(bay.mid), el('bb-2')));
    }
  }

  doc.addElement(new Connection('cn-c0t-ext', '', el('pos-c0t'), ext('renewable', 'SOLAR PARK 1', 'up')));
  // Tie-line to West 400 kV — shared id `south-west-1`.
  doc.addElement(new Connection(SOUTH_WEST_1, '', el('pos-c1t', 'below'), ext('line', 'WEST 1', 'up', 'right')));
  doc.addElement(new Connection('cn-c2t-ext', '', el('pos-c2t'), ext('line', 'FEEDER B', 'up')));
  doc.addElement(new Connection('cn-c1b-ext', '', el('pos-c1b'), ext('line', 'FEEDER C', 'down')));
  // Shared id with the 220 kV level — the composite auto-links the two levels here.
  doc.addElement(new Connection(SHARED_LINK_ID, '', el('pos-c2b'), ext('transformer', 'TIE 220 kV', 'down')));
  // Tie-line to West 400 kV — shared id `south-west-2`.
  doc.addElement(new Connection(SOUTH_WEST_2, '', el('pos-c3b', 'above'), ext('line', 'WEST 2', 'down')));

  return doc;
}

/** South 220 kV (explicit): double busbar, bays fanning upward + one transformer bay down. */
export function buildSouth220(): SldDocument {
  const doc = new SldDocument(
    { id: SOUTH_220_ID, name: 'South 220 kV', substation: 'South', voltageKv: 220 },
    { rows: 4, cols: 8 }
  );

  doc.addElement(new BusBar('bb-1', 'BB1', 1));
  doc.addElement(new BusBar('bb-2', 'BB2', 2));

  doc.addElement(new Position('pos-b0', 'L1', 'line', 0, 0));
  doc.addElement(new Connection('cn-b0-b1', '', el('pos-b0'), el('bb-1')));
  doc.addElement(new Connection('cn-b0-b2', '', el('pos-b0'), el('bb-2')));
  doc.addElement(new Connection('cn-b0-ext', '', el('pos-b0', 'above'), ext('line', 'FEEDER E', 'up')));

  doc.addElement(new Position('pos-b1', 'L2', 'line', 0, 1));
  doc.addElement(new Connection('cn-b1-b1', '', el('pos-b1'), el('bb-1')));
  doc.addElement(new Connection('cn-b1-b2', '', el('pos-b1'), el('bb-2')));
  doc.addElement(new Connection('cn-b1-ext', '', el('pos-b1', 'above'), ext('line', 'FEEDER F', 'up')));

  // Coupling bay: wired to both bars, no outgoing line.
  doc.addElement(new Position('pos-b2', 'C1', 'central', 0, 2));
  doc.addElement(new Connection('cn-b2-b1', '', el('pos-b2'), el('bb-1')));
  doc.addElement(new Connection('cn-b2-b2', '', el('pos-b2'), el('bb-2')));

  doc.addElement(new Position('pos-b3', 'R1', 'renewable', 0, 4));
  doc.addElement(new Connection('cn-b3-b1', '', el('pos-b3'), el('bb-1')));
  doc.addElement(new Connection('cn-b3-b2', '', el('pos-b3'), el('bb-2')));
  doc.addElement(new Connection('cn-b3-ext', '', el('pos-b3', 'above'), ext('renewable', 'SOLAR PARK 2', 'up')));

  doc.addElement(new Position('pos-b4', 'L3', 'line', 0, 6));
  doc.addElement(new Connection('cn-b4-b1', '', el('pos-b4'), el('bb-1')));
  doc.addElement(new Connection('cn-b4-b2', '', el('pos-b4'), el('bb-2')));
  doc.addElement(new Connection('cn-b4-ext', '', el('pos-b4', 'above'), ext('line', 'FEEDER G', 'up')));

  doc.addElement(new Position('pos-b5', 'L4', 'line', 0, 7));
  doc.addElement(new Connection('cn-b5-b1', '', el('pos-b5'), el('bb-1')));
  doc.addElement(new Connection('cn-b5-b2', '', el('pos-b5'), el('bb-2')));
  doc.addElement(new Connection('cn-b5-ext', '', el('pos-b5', 'above'), ext('line', 'FEEDER H', 'up')));

  // Transformer bay dropping to the 400 kV level.
  doc.addElement(new Position('pos-tr', 'T1', 'transformer', 3, 3));
  doc.addElement(new Connection('cn-tr-b1', '', el('pos-tr'), el('bb-1')));
  doc.addElement(new Connection('cn-tr-b2', '', el('pos-tr'), el('bb-2')));
  // Shared id with the 400 kV level's transformer external → composite link.
  doc.addElement(new Connection(SHARED_LINK_ID, '', el('pos-tr', 'below'), ext('transformer', 'TIE 400 kV', 'down')));

  return doc;
}

/**
 * Configure a bay's auto-generated external feeder using only high-level
 * commands: optionally repoint it onto a shared connection id (so a composite
 * links it) and/or give it a human label. `AddPositionCommand` spawns each
 * feeder with a random id and an auto-name (`line-1`, `trf-1`…); the tie-lines
 * we care about get a specific, shared id via `RenameElementCommand` and a real
 * label via `UpdateElementCommand`.
 */
function setFeeder(
  doc: SldDocument,
  stack: CommandStack,
  positionId: string,
  opts: { id?: string; label?: string }
): void {
  const feeder = doc.connectionsOf(positionId).find((c) => c.from.kind === 'external' || c.to.kind === 'external');
  if (!feeder) throw new Error(`no external feeder on ${positionId}`);
  if (opts.id && opts.id !== feeder.id) stack.execute(new RenameElementCommand(feeder.id, opts.id), doc);
  const id = opts.id ?? feeder.id;
  if (opts.label !== undefined) {
    const before = (doc.getElement(id) as Connection).toJSON();
    const after = {
      ...before,
      from: before.from.kind === 'external' ? { ...before.from, label: opts.label } : before.from,
      to: before.to.kind === 'external' ? { ...before.to, label: opts.label } : before.to
    };
    stack.execute(new UpdateElementCommand(before, after), doc);
  }
}

/**
 * West 400 kV (high-level authoring): a breaker-and-a-half layout mirroring
 * South 400 kV — feeder bays on the outer rows with a `central` position in
 * between, so each bay forms a BB1—top—central—bottom—BB2 chain. It also shows
 * off the `storage` (battery) and `demand` (consumer/load) position types: like
 * line/transformer/renewable, they auto-spawn their matching external glyph.
 * Every bay is added with `AddPositionCommand`, which auto-wires it and spawns
 * its feeder; adding each column's central FIRST lets the outer positions split
 * the chain correctly as they land. Only the two tie-lines back to South 400 kV
 * are relinked to the shared ids — SOUTH 1 leaves a top position (toward BB1),
 * SOUTH 2 the bottom-right one (toward BB2), matching WEST 1 / WEST 2 on South.
 */
export function buildWest400(): SldDocument {
  const doc = new SldDocument(
    { id: WEST_400_ID, name: 'West 400 kV', substation: 'West', voltageKv: 400 },
    { rows: 5, cols: 3 }
  );

  // Bounding bars are structural — placed directly.
  doc.addElement(new BusBar('bb-1', 'BB1', 0));
  doc.addElement(new BusBar('bb-2', 'BB2', 4));

  // Centrals first (row 2), then the top feeders (row 1), then the bottom ones
  // (row 3): each AddPositionCommand auto-wires the bay and spawns its feeder.
  const stack = new CommandStack();
  stack.execute(new AddPositionCommand(new Position('w-c0', 'C1', 'central', 2, 0)), doc);
  stack.execute(new AddPositionCommand(new Position('w-c1', 'C2', 'central', 2, 1)), doc);
  stack.execute(new AddPositionCommand(new Position('w-c2', 'C3', 'central', 2, 2)), doc);
  stack.execute(new AddPositionCommand(new Position('w-l1', 'L1', 'line', 1, 0)), doc);      // top-left     → SOUTH 1
  stack.execute(new AddPositionCommand(new Position('w-sto1', 'S1', 'storage', 1, 1)), doc); // top-mid      → storage
  stack.execute(new AddPositionCommand(new Position('w-dem1', 'D1', 'demand', 3, 1)), doc);  // bottom-mid   → consumer
  stack.execute(new AddPositionCommand(new Position('w-l3', 'L3', 'line', 3, 2)), doc);      // bottom-right → SOUTH 2

  // Tie-lines back to South 400 kV get the shared ids + labels; the local
  // storage/demand feeders just get human labels (their wiring is already done).
  setFeeder(doc, stack, 'w-l1', { id: SOUTH_WEST_1, label: 'SOUTH 1' });
  setFeeder(doc, stack, 'w-l3', { id: SOUTH_WEST_2, label: 'SOUTH 2' });
  setFeeder(doc, stack, 'w-sto1', { label: 'STORAGE W1' });
  setFeeder(doc, stack, 'w-dem1', { label: 'CONSUMER W1' });

  return doc;
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
