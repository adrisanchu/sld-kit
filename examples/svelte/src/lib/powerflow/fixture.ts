/**
 * Example 03 fixture — an entirely FICTIONAL little grid used only to demo the
 * power-flow visualization. Deliberately separate from the asset-based
 * `demoFixture.ts`: it is never seeded into the editor library or localStorage.
 *
 * This builds only the **topology** — a chain of small substations, each a single
 * busbar with a few line bays wired to the bus and out to a feeder; some feeders
 * share an id across two neighbouring stations, so the composite auto-links them
 * into inter-diagram tie-lines. It carries **no flow values**: those arrive
 * separately as an explicit list of readings (see `readings.ts`) and are folded
 * into `data.flow` by `applyPowerFlow`, mimicking a third-party power-flow feed.
 *
 * Each bay gets a stable, globally-unique `id` (e.g. `A-SOLAR`) so a reading can
 * address it directly.
 */
import {
  SldDocument,
  BusBar,
  Position,
  Connection,
  CompositeDocument,
  DiagramInstance,
  MapResolver,
  Serializer,
  element,
  external,
  type SldDocumentJson,
  type PositionType,
  type ExternalAssetKind
} from '@sld-kit/core';

interface BayDef {
  /** Globally-unique asset id — the key a power-flow reading addresses. */
  id: string;
  label: string;
  feederLabel: string;
  /** Position type — drives the box token; defaults to `'line'`. */
  type?: PositionType;
  /**
   * External feeder asset kind — drives the end glyph (solar/battery/load icon
   * vs. a plain line arrow). Defaults to `'line'`.
   */
  asset?: ExternalAssetKind;
  /** When two stations share this id, the composite auto-links their bays. */
  sharedId?: string;
}

/**
 * One substation: a busbar (row 1) with `bays.length` line positions above it
 * (row 0), each wired pos→bus and pos→feeder-up. Mirrors the known-good South
 * 220 kV geometry. Topology only — flow values come from the readings.
 */
function buildStation(id: string, name: string, kv: number, bays: BayDef[]): SldDocument {
  const doc = new SldDocument(
    { id, name, substation: name, voltageKv: kv },
    { rows: 2, cols: Math.max(1, bays.length) }
  );
  doc.addElement(BusBar.of({ id: 'bb', label: 'BB', row: 1 }));

  bays.forEach((bay, i) => {
    doc.addElement(Position.of({ id: bay.id, label: bay.label, type: bay.type ?? 'line', row: 0, col: i }));
    doc.addElement(Connection.of({ id: `${bay.id}-bus`, from: element(bay.id), to: element('bb') }));
    // Only `sharedId` is meant to be shared (between the two stations owning each
    // end of a real tie); everything else is keyed off the unique bay id so the
    // composite never auto-links id collisions into spurious tie-lines. The
    // `asset` kind gives generators/loads their glyph (solar, wind, battery, load).
    doc.addElement(
      Connection.of({
        id: bay.sharedId ?? `${bay.id}-ext`,
        from: element(bay.id, 'above'),
        to: external({ asset: bay.asset ?? 'line', label: bay.feederLabel, direction: 'up' })
      })
    );
  });

  return doc;
}

/** Stable library + instance ids so switch state keys survive reloads. */
export const PF_COMPOSITE_ID = 'pf-composite';

/**
 * Build the demo composite plus a resolver over its child library JSON. Children
 * are resolved by the caller (`instance.resolve(resolver)`) at mount, and the
 * caller then folds the readings in via `applyPowerFlow`.
 */
export function buildPowerFlowDemo(): { composite: CompositeDocument; resolver: MapResolver } {
  const stations: SldDocument[] = [
    buildStation('pf-a', 'Alpha 400 kV', 400, [
      { id: 'A-SOLAR', label: 'PV1', feederLabel: 'SOLAR PARK', type: 'renewable', asset: 'renewable' },
      { id: 'A-TIE-AB', label: 'L2', feederLabel: 'TIE AB', sharedId: 'tie-ab' },
      { id: 'A-LOAD', label: 'LD1', feederLabel: 'LOAD A', type: 'demand', asset: 'demand' }
    ]),
    buildStation('pf-b', 'Bravo 400 kV', 400, [
      { id: 'B-TIE-AB', label: 'L1', feederLabel: 'TIE AB', sharedId: 'tie-ab' },
      { id: 'B-TIE-BC', label: 'L2', feederLabel: 'TIE BC', sharedId: 'tie-bc' },
      { id: 'B-LOAD', label: 'LD2', feederLabel: 'LOAD B', type: 'demand', asset: 'demand' }
    ]),
    buildStation('pf-c', 'Charlie 220 kV', 220, [
      { id: 'C-TIE-BC', label: 'L1', feederLabel: 'TIE BC', sharedId: 'tie-bc' },
      { id: 'C-TIE-CD', label: 'L2', feederLabel: 'TIE CD', sharedId: 'tie-cd' },
      { id: 'C-WIND', label: 'WT1', feederLabel: 'WIND FARM', type: 'renewable', asset: 'renewable' }
    ]),
    buildStation('pf-d', 'Delta 220 kV', 220, [
      { id: 'D-TIE-CD', label: 'L1', feederLabel: 'TIE CD', sharedId: 'tie-cd' },
      { id: 'D-STORAGE', label: 'BT1', feederLabel: 'STORAGE D', type: 'storage', asset: 'storage' },
      { id: 'D-LOAD', label: 'LD3', feederLabel: 'LOAD D', type: 'demand', asset: 'demand' }
    ])
  ];

  const libraryJson = new Map<string, SldDocumentJson>();
  for (const s of stations) libraryJson.set(s.meta.id, Serializer.toJSON(s));
  const resolver = new MapResolver(libraryJson);

  // Each child is placed *and* its name label positioned in one pass via
  // `DiagramInstance.of` — anchor + direction chosen so the name stays readable
  // at each station's rotation, no follow-up SetChildLabelCommand needed.
  const composite = new CompositeDocument({ id: PF_COMPOSITE_ID, name: 'Power Flow — demo grid' });
  composite.addChild(
    DiagramInstance.of({ id: 'inst-a', libraryId: 'pf-a', x: 0, y: 0, angleDeg: 90, label: { anchor: 'center-left', direction: 90 } })
  );
  composite.addChild(
    DiagramInstance.of({ id: 'inst-b', libraryId: 'pf-b', x: 800, y: 500, angleDeg: 0, label: { anchor: 'bottom-center', direction: 0 } })
  );
  composite.addChild(
    DiagramInstance.of({ id: 'inst-c', libraryId: 'pf-c', x: 1400, y: -300, angleDeg: 270, label: { anchor: 'center-left', direction: 90 } })
  );
  composite.addChild(
    DiagramInstance.of({ id: 'inst-d', libraryId: 'pf-d', x: 500, y: -600, angleDeg: 180, label: { anchor: 'bottom-center', direction: 0 } })
  );

  return { composite, resolver };
}
