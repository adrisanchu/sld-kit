/**
 * Demo fixtures for the React example: a self-contained, entirely FICTIONAL
 * grid. The data is invented — no real network data belongs in this repo.
 *
 * Built with the declarative `buildDocument` API: describe the bars and the
 * columns of bays, hang a feeder off the outer position of each, and the grid,
 * series wiring, auto-naming and validation follow.
 */
import {
  CompositeDocument,
  DiagramInstance,
  MapResolver,
  Serializer,
  buildDocument,
  type SldDocument
} from '@sld-kit/core';

/** Shared external id tying the 400 kV and 220 kV levels — the composite
 *  auto-links two diagrams whose external endpoints carry the same id. */
const TIE_ID = 'tie-1';

export function buildExample400(): SldDocument {
  return buildDocument({
    meta: { id: 'example-400', name: 'Example 400 kV', substation: 'Example', voltageKv: 400 },
    busbars: [
      { label: 'BB1', row: 0 },
      { label: 'BB2', row: 4 }
    ],
    bays: [
      {
        col: 0,
        positions: [
          { type: 'line', row: 1, feeder: { asset: 'line', label: 'NORTH 1', direction: 'up' } },
          { type: 'line', row: 3 }
        ]
      },
      {
        col: 1,
        positions: [
          { type: 'transformer', row: 1, feeder: { asset: 'transformer', label: 'TR1', direction: 'up' } },
          { type: 'transformer', row: 3 }
        ]
      },
      {
        col: 2,
        positions: [
          { type: 'renewable', row: 1, feeder: { asset: 'renewable', label: 'WIND 1', direction: 'up' } },
          { type: 'renewable', row: 3 }
        ]
      },
      {
        col: 3,
        positions: [
          { type: 'storage', row: 1, feeder: { asset: 'storage', label: 'BESS 1', direction: 'up' } },
          { type: 'storage', row: 3 }
        ]
      },
      {
        col: 4,
        positions: [
          { type: 'demand', row: 1, feeder: { asset: 'demand', label: 'LOAD 1', direction: 'up' } },
          { type: 'demand', row: 3 }
        ]
      }
    ]
  });
}

/** Compact 400 kV level for the composite overview; its col-0 feeder is the tie. */
function buildTie400(): SldDocument {
  return buildDocument({
    meta: { id: 'lib-400', name: '400 kV', substation: 'Example', voltageKv: 400 },
    busbars: [
      { label: 'BB1', row: 0 },
      { label: 'BB2', row: 3 }
    ],
    bays: [
      {
        col: 0,
        positions: [
          {
            type: 'transformer',
            row: 1,
            feeder: { asset: 'transformer', label: 'TIE', direction: 'down', id: TIE_ID }
          },
          { type: 'transformer', row: 2 }
        ]
      },
      {
        col: 1,
        positions: [
          { type: 'line', row: 1, feeder: { asset: 'line', label: 'NORTH', direction: 'up' } },
          { type: 'line', row: 2 }
        ]
      },
      {
        col: 2,
        positions: [
          { type: 'renewable', row: 1, feeder: { asset: 'renewable', label: 'WIND', direction: 'up' } },
          { type: 'renewable', row: 2 }
        ]
      }
    ]
  });
}

/** Compact 220 kV level; its col-0 feeder shares the tie id, so the composite
 *  auto-links the two levels with a dashed edge. */
function buildTie220(): SldDocument {
  return buildDocument({
    meta: { id: 'lib-220', name: '220 kV', substation: 'Example', voltageKv: 220 },
    busbars: [
      { label: 'BB1', row: 0 },
      { label: 'BB2', row: 3 }
    ],
    bays: [
      {
        col: 0,
        positions: [
          { type: 'transformer', row: 1, feeder: { asset: 'transformer', label: 'TIE', direction: 'up', id: TIE_ID } },
          { type: 'transformer', row: 2 }
        ]
      },
      {
        col: 1,
        positions: [
          { type: 'demand', row: 1, feeder: { asset: 'demand', label: 'CITY', direction: 'down' } },
          { type: 'demand', row: 2 }
        ]
      }
    ]
  });
}

/**
 * A "diagram of diagrams": the 400 kV level above the 220 kV level, resolved
 * through a `MapResolver` and auto-linked by their shared TIE feeder id.
 */
export function buildExampleComposite(): CompositeDocument {
  const resolver = new MapResolver(
    new Map([
      ['lib-400', Serializer.toJSON(buildTie400())],
      ['lib-220', Serializer.toJSON(buildTie220())]
    ])
  );
  const composite = new CompositeDocument({ id: 'example-overview', name: 'Example — overview' });
  composite.addChild(DiagramInstance.of({ libraryId: 'lib-400', x: 0, y: 0 }));
  composite.addChild(DiagramInstance.of({ libraryId: 'lib-220', x: 120, y: 620 }));
  composite.resolveChildren(resolver);
  return composite;
}
