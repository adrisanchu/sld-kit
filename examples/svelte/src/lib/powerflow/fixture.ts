/**
 * Example 03 fixture — an entirely FICTIONAL little grid used only to demo the
 * power-flow visualization. Deliberately separate from the asset-based
 * `demoFixture.ts`: it is never seeded into the editor library or localStorage.
 *
 * A chain of small substations, each a single busbar with a few line bays. Bays
 * are wired to the bus and out to a feeder; some feeders share an id across two
 * neighbouring stations, so the composite auto-links them into inter-diagram
 * tie-lines. Every bay carries seeded `data.flow` (a random nominal MW, a
 * capacity and a direction) — random today, meant to be tweaked into real
 * numbers. The live magnitudes/directions come from the toy model at runtime.
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
import type { FlowData } from './flow-data';

/** Small deterministic PRNG so the "random" seeds are stable across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const withFlow = (d: FlowData) => ({ flow: d });

interface BayDef {
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
 * 220 kV geometry. Each bay gets a seeded, closed, operable switch.
 */
function buildStation(id: string, name: string, kv: number, bays: BayDef[], rand: () => number): SldDocument {
  const doc = new SldDocument(
    { id, name, substation: name, voltageKv: kv },
    { rows: 2, cols: Math.max(1, bays.length) }
  );
  doc.addElement(BusBar.of({ id: 'bb', label: 'BB', row: 1 }));

  bays.forEach((bay, i) => {
    const posId = `pos-${i}`;
    const capacity = 200 + Math.floor(rand() * 600);
    const mw = Math.floor(rand() * capacity);
    const direction: 1 | -1 = rand() > 0.5 ? 1 : -1;
    doc.addElement(
      Position.of({
        id: posId,
        label: bay.label,
        type: bay.type ?? 'line',
        row: 0,
        col: i,
        data: withFlow({ operable: true, state: 'closed', mw, capacity, direction })
      })
    );
    doc.addElement(Connection.of({ id: `cn-${i}-bus`, from: element(posId), to: element('bb') }));
    // Non-tie feeders MUST get a station-unique external id: a bare `cn-${i}-ext`
    // repeats across stations and the composite would auto-link the collisions
    // into spurious tie-lines. Only `sharedId` is meant to be shared (and only
    // between the two stations that own each end of a real tie). The `asset` kind
    // gives generators/loads their glyph (solar, wind, battery, consumer).
    doc.addElement(
      Connection.of({
        id: bay.sharedId ?? `${id}-ext-${i}`,
        from: element(posId, 'above'),
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
 * are resolved by the caller (`instance.resolve(resolver)`) at mount, exactly
 * like the editor does.
 */
export function buildPowerFlowDemo(): { composite: CompositeDocument; resolver: MapResolver } {
  const rand = mulberry32(0xc0ffee);

  const stations: SldDocument[] = [
    buildStation('pf-a', 'Alpha 400 kV', 400, [
      { label: 'PV1', feederLabel: 'SOLAR PARK', type: 'renewable', asset: 'renewable' },
      { label: 'L2', feederLabel: 'TIE AB', sharedId: 'tie-ab' },
      { label: 'LD1', feederLabel: 'LOAD A', type: 'demand', asset: 'demand' }
    ], rand),
    buildStation('pf-b', 'Bravo 400 kV', 400, [
      { label: 'L1', feederLabel: 'TIE AB', sharedId: 'tie-ab' },
      { label: 'L2', feederLabel: 'TIE BC', sharedId: 'tie-bc' },
      { label: 'LD2', feederLabel: 'LOAD B', type: 'demand', asset: 'demand' }
    ], rand),
    buildStation('pf-c', 'Charlie 220 kV', 220, [
      { label: 'L1', feederLabel: 'TIE BC', sharedId: 'tie-bc' },
      { label: 'L2', feederLabel: 'TIE CD', sharedId: 'tie-cd' },
      { label: 'WT1', feederLabel: 'WIND FARM', type: 'renewable', asset: 'renewable' }
    ], rand),
    buildStation('pf-d', 'Delta 220 kV', 220, [
      { label: 'L1', feederLabel: 'TIE CD', sharedId: 'tie-cd' },
      { label: 'BT1', feederLabel: 'STORAGE D', type: 'storage', asset: 'storage' },
      { label: 'LD3', feederLabel: 'LOAD D', type: 'demand', asset: 'demand' }
    ], rand)
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
