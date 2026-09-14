/**
 * Headless smoke test: render the built @sld-kit/react components to strings and
 * assert they actually paint the fixture's geometry and the chrome. Covers the
 * canvas + element views, the Phase-2 chrome (toolbar, LaneActionChip,
 * ExternalAssetPopover), and the Phase-3 composite + flow surface (composite
 * canvas/explorer/toolbar, auto-links, flow dots, line labels).
 * Run with: node ssr-smoke.mjs
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CompositeDocument,
  CompositeLayoutEngine,
  DiagramInstance,
  LayoutEngine,
  MapResolver,
  Serializer,
  buildDocument
} from '@sld-kit/core';
import {
  SldCanvas,
  SldToolbar,
  LaneActionChip,
  ExternalAssetPopover,
  CompositeCanvas,
  CompositeExplorer,
  CompositeToolbar
} from '@sld-kit/react';

const doc = buildDocument({
  meta: { id: 'smoke', name: 'Smoke 400 kV' },
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
    }
  ]
});

const layout = new LayoutEngine().layout(doc);
const html = renderToStaticMarkup(h(SldCanvas, { doc, layout, version: 0 }));

const checks = [
  ['renders an <svg> with a viewBox', /<svg[^>]*viewBox=/.test(html)],
  ['renders position boxes', (html.match(/class="sld-position/g) ?? []).length === doc.positions().length],
  ['position boxes carry the type token', html.includes('sld-pos-line') && html.includes('sld-pos-transformer')],
  ['positions paint from --sld-pos', html.includes('fill="var(--sld-pos)"')],
  ['renders bus bar labels', html.includes('>BB1<') && html.includes('>BB2<')],
  ['renders connection paths', (html.match(/<path/g) ?? []).length > 0],
  ['renders the external feeder label', html.includes('NORTH 1')],
  ['renders the transformer symbol glyph', html.includes('fill-background')]
];

// ── Chrome ────────────────────────────────────────────────────────────────
const toolbar = renderToStaticMarkup(
  h(SldToolbar, { userRole: 'editor', editMode: true, tool: 'position', canUndo: true, positionType: 'renewable' })
);
checks.push(
  ['toolbar shows the view controls', toolbar.includes('Zoom in') && toolbar.includes('Export')],
  ['toolbar shows the edit cluster in edit mode', toolbar.includes('Add position') && toolbar.includes('Add bus bar')],
  ['toolbar tints the position glyph by type', toolbar.includes('--sld-pos-renewable')],
  ['toolbar shows the active-tool hint bar', toolbar.includes('Add position') && toolbar.includes('empty slot')]
);

const chip = renderToStaticMarkup(
  h(LaneActionChip, { x: 10, y: 20, lane: { kind: 'col', index: 2 }, occupants: ['a', 'b'], canDelete: true })
);
checks.push(
  ['lane chip titles the column (1-based)', chip.includes('Column 3')],
  ['lane chip summarises occupancy', chip.includes('2 positions')],
  ['lane chip offers delete', chip.includes('Delete')]
);

const popover = renderToStaticMarkup(h(ExternalAssetPopover, { x: 5, y: 5 }));
checks.push(
  ['external-asset popover lists asset kinds', popover.includes('Transformer') && popover.includes('Renewable')],
  ['external-asset popover has confirm/cancel', popover.includes('Add') && popover.includes('Cancel')]
);

// ── Composite + flow ────────────────────────────────────────────────────────
// Two levels tied by a shared feeder id, so the composite auto-links them.
const feeder = (label, direction, id) => ({ asset: 'transformer', label, direction, id });
const levelA = buildDocument({
  meta: { id: 'lib-a', name: 'Level A' },
  busbars: [{ label: 'BB1', row: 0 }],
  bays: [{ col: 0, positions: [{ type: 'transformer', row: 1, feeder: feeder('TIE', 'up', 'tie-1') }] }]
});
const levelB = buildDocument({
  meta: { id: 'lib-b', name: 'Level B' },
  busbars: [{ label: 'BB1', row: 0 }],
  bays: [{ col: 0, positions: [{ type: 'transformer', row: 1, feeder: feeder('TIE', 'down', 'tie-1') }] }]
});
const resolver = new MapResolver(
  new Map([
    ['lib-a', Serializer.toJSON(levelA)],
    ['lib-b', Serializer.toJSON(levelB)]
  ])
);
const composite = new CompositeDocument({ id: 'ov', name: 'Overview' });
composite.addChild(DiagramInstance.of({ libraryId: 'lib-a', x: 0, y: 0 }));
composite.addChild(DiagramInstance.of({ libraryId: 'lib-b', x: 0, y: 400 }));
composite.resolveChildren(resolver);
const clayout = new CompositeLayoutEngine(new LayoutEngine()).layout(composite);

const cc = renderToStaticMarkup(h(CompositeCanvas, { layout: clayout, selectedId: composite.allChildren()[0].id }));
checks.push(
  ['composite renders both child names', cc.includes('Level A') && cc.includes('Level B')],
  ['composite auto-links the shared tie', clayout.links.length === 1 && cc.includes('stroke-primary/70')],
  ['composite draws the selection frame', cc.includes('stroke-dasharray="6 4"')]
);

const explorer = renderToStaticMarkup(
  h(CompositeExplorer, {
    layout: clayout,
    resolveFlow: () => ({ active: true, direction: 1 }),
    resolveLineLabel: (k) => (k === 'link:tie-1' ? { text: '120 MW' } : null)
  })
);
checks.push(
  ['explorer animates flow dots', explorer.includes('sld-flow-dot')],
  ['explorer draws the line label', explorer.includes('120 MW')]
);

const ctoolbar = renderToStaticMarkup(h(CompositeToolbar, { userRole: 'editor', drawActive: true, canUndo: true }));
checks.push([
  'composite toolbar shows draw-line + import',
  ctoolbar.includes('Draw line') && ctoolbar.includes('Import diagram')
]);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}`);
  if (!ok) failed++;
}
console.log(
  `\n${doc.positions().length} positions, ${doc.busBars().length} bus bars, ${doc.connections().length} connections; ${html.length} bytes of canvas markup`
);
process.exit(failed === 0 ? 0 : 1);
