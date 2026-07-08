/**
 * Test fixtures — a self-contained, fictional example substation ("Example")
 * at two voltage levels plus a composite of the two. The data is invented; it
 * exists only to exercise the full model surface: two bounding bus bars, series
 * bays, empty slots, double busbar taps, external assets with derived and
 * explicit tap/side, and a shared external id that the composite auto-links.
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
  DiagramInstance,
  newId,
  type Endpoint,
  type ExternalAssetKind,
  type ExternalDirection
} from '../src';

export const EXAMPLE_HV_ID = 'example-hv';
export const EXAMPLE_MV_ID = 'example-mv';
export const EXAMPLE_COMPOSITE_ID = 'example-composite';

/** Shared external connection id — the composite auto-links the levels here. */
export const SHARED_LINK_ID = 'cn-shared-transformer';

function el(id: string, tap?: 'above' | 'below'): Endpoint {
  return tap ? { kind: 'element', id, tap } : { kind: 'element', id };
}

function ext(asset: ExternalAssetKind, label: string, direction: ExternalDirection, side?: 'left' | 'right'): Endpoint {
  return side ? { kind: 'external', asset, label, direction, side } : { kind: 'external', asset, label, direction };
}

/** HV level: two bars, 3+4+3 positions, two empty slots. */
export function buildExampleHv(): SldDocument {
  const doc = new SldDocument(
    { id: EXAMPLE_HV_ID, name: 'Example 400 kV', substation: 'Example', voltageKv: 400 },
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
  doc.addElement(new Connection('cn-c1t-ext', '', el('pos-c1t', 'below'), ext('line', 'FEEDER A', 'up', 'right')));
  doc.addElement(new Connection('cn-c2t-ext', '', el('pos-c2t'), ext('line', 'FEEDER B', 'up')));
  doc.addElement(new Connection('cn-c1b-ext', '', el('pos-c1b'), ext('line', 'FEEDER C', 'down')));
  // Shared id with the MV level — the composite auto-links the two levels here.
  doc.addElement(new Connection(SHARED_LINK_ID, '', el('pos-c2b'), ext('transformer', 'TIE 220 kV', 'down')));
  doc.addElement(new Connection('cn-c3b-ext', '', el('pos-c3b', 'above'), ext('line', 'FEEDER D', 'down')));

  return doc;
}

/** MV level: double busbar, bays fanning upward + one transformer bay down. */
export function buildExampleMv(): SldDocument {
  const doc = new SldDocument(
    { id: EXAMPLE_MV_ID, name: 'Example 220 kV', substation: 'Example', voltageKv: 220 },
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

  // Transformer bay dropping to the HV level.
  doc.addElement(new Position('pos-tr', 'T1', 'transformer', 3, 3));
  doc.addElement(new Connection('cn-tr-b1', '', el('pos-tr'), el('bb-1')));
  doc.addElement(new Connection('cn-tr-b2', '', el('pos-tr'), el('bb-2')));
  // Shared id with the HV level's transformer external → composite link.
  doc.addElement(new Connection(SHARED_LINK_ID, '', el('pos-tr', 'below'), ext('transformer', 'TIE 400 kV', 'down')));

  return doc;
}

/** Composite of the two voltage levels, both rotated 90°. */
export function buildExampleComposite(): CompositeDocument {
  const doc = new CompositeDocument({ id: EXAMPLE_COMPOSITE_ID, name: 'Example — overview' });
  doc.addChild(new DiagramInstance(newId(), EXAMPLE_HV_ID, 0, 0, 90));
  doc.addChild(new DiagramInstance(newId(), EXAMPLE_MV_ID, 400, 60, 90));
  return doc;
}
