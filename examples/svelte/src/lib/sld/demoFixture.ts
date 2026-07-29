/**
 * Demo fixtures for the example editor: a self-contained, entirely FICTIONAL
 * grid with two substations — **South** (a 400 kV level + a 220 kV level) and
 * **West** (a 400 kV level) — plus composites linking them. The data is
 * invented; it only exists to exercise the full model surface.
 *
 * Two authoring styles live side by side on purpose (see issue #21):
 *  - **Explicit** — `buildSouth400` / `buildSouth220` hand-place and hand-wire
 *    every element (full control, maximum verbosity).
 *  - **High-level** — `buildWest400` uses `CommandStack` + `AddPositionCommand`,
 *    which auto-wires each bay to its bars and spawns its outgoing feeder; only
 *    the cross-substation tie-lines are relinked by hand.
 *
 * South 400 kV and West 400 kV are tied together through two feeders that share
 * the ids `south-west-1` / `south-west-2`, so a composite auto-links them.
 *
 * Mirrors `packages/core/tests/fixtures.ts` — keep the two in sync.
 * These seed the localStorage library on first visit (see the routes).
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
} from '@sld-kit/core';

/** Stable ids for the seeded demos in the localStorage library. */
export const SOUTH_400_ID = 'south-400';
export const SOUTH_220_ID = 'south-220';
export const WEST_400_ID = 'west-400';
export const SOUTH_COMPOSITE_ID = 'south-composite';
export const SOUTH_WEST_COMPOSITE_ID = 'south-west-composite';

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
 * Two feeders are the tie-lines to West 400 kV — they carry the shared ids
 * `south-west-1` / `south-west-2` and the labels "WEST 1" / "WEST 2".
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
 * Repoint a bay's auto-generated external feeder onto a shared connection id and
 * give it a human label — using only high-level commands. `AddPositionCommand`
 * mints a random id and an auto-name for the feeder it spawns; a cross-substation
 * tie needs a specific, shared id (so the composite links it) and a real label,
 * which `RenameElementCommand` + `UpdateElementCommand` supply.
 */
function relinkFeeder(doc: SldDocument, stack: CommandStack, positionId: string, sharedId: string, label: string): void {
  const feeder = doc.connectionsOf(positionId).find((c) => c.from.kind === 'external' || c.to.kind === 'external');
  if (!feeder) throw new Error(`no external feeder on ${positionId}`);
  stack.execute(new RenameElementCommand(feeder.id, sharedId), doc);
  const before = (doc.getElement(sharedId) as Connection).toJSON();
  const after = {
    ...before,
    from: before.from.kind === 'external' ? { ...before.from, label } : before.from,
    to: before.to.kind === 'external' ? { ...before.to, label } : before.to
  };
  stack.execute(new UpdateElementCommand(before, after), doc);
}

/**
 * West 400 kV (high-level authoring): two bars and three bays. Each bay is added
 * with `AddPositionCommand`, which auto-wires it to both bars and spawns its
 * outgoing feeder. The two line bays are then relinked as the tie-lines back to
 * South 400 kV via the shared ids.
 */
export function buildWest400(): SldDocument {
  const doc = new SldDocument(
    { id: WEST_400_ID, name: 'West 400 kV', substation: 'West', voltageKv: 400 },
    { rows: 3, cols: 3 }
  );

  // Bounding bars are structural — placed directly.
  doc.addElement(new BusBar('bb-1', 'BB1', 0));
  doc.addElement(new BusBar('bb-2', 'BB2', 2));

  // Bays via the high-level command: auto-wire to the bars + auto-spawn feeders.
  const stack = new CommandStack();
  stack.execute(new AddPositionCommand(new Position('w-l1', 'L1', 'line', 1, 0)), doc);
  stack.execute(new AddPositionCommand(new Position('w-t1', 'T1', 'transformer', 1, 1)), doc);
  stack.execute(new AddPositionCommand(new Position('w-l2', 'L2', 'line', 1, 2)), doc);

  // Turn the two line feeders into the shared tie-lines back to South 400 kV.
  relinkFeeder(doc, stack, 'w-l1', SOUTH_WEST_1, 'SOUTH 1');
  relinkFeeder(doc, stack, 'w-l2', SOUTH_WEST_2, 'SOUTH 2');

  return doc;
}

/**
 * Composite of the two South voltage levels, both rotated a bit to showcase that
 * it's possible. The shared transformer tie is drawn as a manual line (anchored
 * to both levels with one free bend) instead of the default straight dashed
 * auto-link — showing off the manual/automatic line ends.
 */
export function buildSouthComposite(): CompositeDocument {
  const hvInstanceId = newId();
  const mvInstanceId = newId();
  const doc = new CompositeDocument({ id: SOUTH_COMPOSITE_ID, name: 'South — overview' });
  doc.addChild(new DiagramInstance(hvInstanceId, SOUTH_400_ID, 250, 230, 222));
  doc.addChild(new DiagramInstance(mvInstanceId, SOUTH_220_ID, 400, -300, 40));
  doc.addLine(
    new CompositeLine(newId(), [
      { kind: 'anchor', instanceId: hvInstanceId, connectionId: SHARED_LINK_ID },
      { kind: 'point', x: 520, y: 60 },
      { kind: 'anchor', instanceId: mvInstanceId, connectionId: SHARED_LINK_ID }
    ])
  );
  return doc;
}

/**
 * Composite tying South 400 kV to West 400 kV, side by side. The two children
 * share the `south-west-1` / `south-west-2` feeder ids, so the composite draws
 * the default dashed auto-links between them — no manual lines needed.
 */
export function buildSouthWestComposite(): CompositeDocument {
  const doc = new CompositeDocument({ id: SOUTH_WEST_COMPOSITE_ID, name: 'South ⇄ West 400 kV' });
  doc.addChild(new DiagramInstance(newId(), SOUTH_400_ID, 0, 0, 0));
  doc.addChild(new DiagramInstance(newId(), WEST_400_ID, 520, 0, 0));
  return doc;
}

/** Registry of seedable demos, keyed by their stable library id. */
export const SLD_DEMOS: { id: string; build: () => SldDocument }[] = [
  { id: SOUTH_400_ID, build: buildSouth400 },
  { id: SOUTH_220_ID, build: buildSouth220 },
  { id: WEST_400_ID, build: buildWest400 }
];

/** Registry of seedable composite demos, keyed by their stable library id. */
export const SLD_COMPOSITE_DEMOS: { id: string; build: () => CompositeDocument }[] = [
  { id: SOUTH_COMPOSITE_ID, build: buildSouthComposite },
  { id: SOUTH_WEST_COMPOSITE_ID, build: buildSouthWestComposite }
];

/** Build a demo by its stable id, stamping that id onto the document. */
export function buildDemoById(id: string): SldDocument | null {
  const entry = SLD_DEMOS.find((d) => d.id === id);
  if (!entry) return null;
  const doc = entry.build();
  doc.meta.id = id;
  return doc;
}
