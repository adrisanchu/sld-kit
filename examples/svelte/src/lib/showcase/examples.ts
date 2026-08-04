/**
 * Curated set of runnable snippets for the API showcase (`/showcase`).
 *
 * Each entry pairs a short description with a self-contained `@sld-kit/core`
 * snippet that `export`s a `doc` (and optionally `exportOptions`). The snippets
 * are seeded into the editor and executed live by `runExample`, so they double as
 * copy-pasteable documentation of the public API. They mirror the demo fixtures
 * (South 400 / West 400) but are trimmed to read well on their own.
 */
export interface ShowcaseExample {
  id: string;
  label: string;
  description: string;
  code: string;
}

const declarative = `import { buildDocument } from '@sld-kit/core';

// Describe a substation declaratively: bounding bus bars + columns of bays.
// The grid size, series-wiring, auto-naming and validation all follow.
export const doc = buildDocument({
  meta: { name: 'West 400 kV', substation: 'West', voltageKv: 400 },
  busbars: [
    { label: 'BB1', row: 0 },
    { label: 'BB2', row: 4 }
  ],
  bays: [
    {
      col: 0,
      positions: [
        { type: 'line', label: 'L1', row: 1, feeder: { asset: 'line', label: 'SOUTH 1' } },
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
        { type: 'line', label: 'L3', row: 3, feeder: { asset: 'line', label: 'SOUTH 2' } }
      ]
    }
  ]
});
`;

const explicit = `import { SldDocument, BusBar, Position, autoWire } from '@sld-kit/core';

// Full control: place the bus bars and positions by hand on the row/col grid.
// Factories (.of) mint ids for you and take readable named options.
const doc = new SldDocument({ name: 'My substation', substation: 'North', voltageKv: 220 });

doc.addElement(BusBar.of({ label: 'BB1', row: 0 }));
doc.addElement(BusBar.of({ label: 'BB2', row: 2 }));

doc.addElement(Position.of({ type: 'line', label: 'L1', row: 1, col: 0 }));
doc.addElement(Position.of({ type: 'transformer', label: 'T1', row: 1, col: 1 }));
doc.addElement(Position.of({ type: 'renewable', label: 'R1', row: 1, col: 2 }));

// autoWire sizes the grid to fit, then series-wires every bay to its column.
autoWire(doc);

export { doc };
`;

const theming = `import { buildDocument } from '@sld-kit/core';

export const doc = buildDocument({
  meta: { name: 'Themed 400 kV', voltageKv: 400 },
  busbars: [
    { label: 'BB1', row: 0 },
    { label: 'BB2', row: 2 }
  ],
  bays: [
    {
      col: 0,
      positions: [{ type: 'line', label: 'L1', row: 1, feeder: { asset: 'line', label: 'FEEDER A' } }]
    },
    {
      col: 1,
      positions: [{ type: 'renewable', label: 'R1', row: 1, feeder: { asset: 'renewable', label: 'SOLAR' } }]
    }
  ]
});

// Restyling is a config change at export time — not a data migration.
// Anything you don't override keeps DEFAULT_THEME's colours.
export const exportOptions = {
  theme: {
    positionTypes: {
      line: { fill: '#e0f2fe', stroke: '#0284c7', text: '#0c4a6e' },
      renewable: { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d' }
    },
    structure: { busbar: '#111827' }
  }
};
`;

export const SHOWCASE_EXAMPLES: ShowcaseExample[] = [
  {
    id: 'declarative',
    label: 'Declarative builder',
    description:
      'Describe bus bars and columns of bays; `buildDocument` handles the grid, series-wiring, auto-naming and validation.',
    code: declarative
  },
  {
    id: 'explicit',
    label: 'Explicit + autoWire',
    description:
      'Place every element by hand with the `.of` factories, then let `autoWire` size the grid and wire each bay to its column.',
    code: explicit
  },
  {
    id: 'theming',
    label: 'Theming',
    description:
      'The persisted model carries no colours. Pass a partial `theme` at export time to restyle any position type or structural stroke.',
    code: theming
  }
];
