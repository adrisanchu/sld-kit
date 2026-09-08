/**
 * Demo fixture for the React example: a self-contained, entirely FICTIONAL
 * 400 kV substation. The data is invented — no real network data belongs in
 * this repo.
 *
 * Built with the declarative `buildDocument` API: describe the bars and the
 * columns of bays, hang a feeder off the outer position of each, and the grid,
 * series wiring, auto-naming and validation follow.
 */
import { buildDocument, type SldDocument } from '@sld-kit/core';

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
