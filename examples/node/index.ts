// Quickstart: build a substation and export an office-safe SVG — no browser, no framework.
import { writeFileSync } from 'node:fs';
import { buildDocument, SvgExporter } from '@sld-kit/core';

// A document is a matrix of rows × cols bounded by bus bars. Describe it
// declaratively — buildDocument auto-names, auto-sizes, wires and validates.
const doc = buildDocument({
  meta: { name: 'My substation' },
  busbars: [
    { label: 'BB1', row: 0 },
    { label: 'BB2', row: 2 }
  ],
  bays: [
    {
      col: 0,
      positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: 'FEEDER A' } }]
    }
  ]
});

// One LayoutEngine backs both the live view and the exporter, so this SVG is
// exactly what an editor would render. Presentation attributes only → paste into PowerPoint.
const svg = new SvgExporter().export(doc);

writeFileSync('substation.svg', svg);
console.log('Wrote substation.svg');
