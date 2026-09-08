/**
 * Headless smoke test: render the built @sld-kit/react components to strings and
 * assert they actually paint the fixture's geometry and the chrome. Covers the
 * canvas + element views, plus the Phase-2 chrome (toolbar, and the two
 * components tied to larger flows the example doesn't drive: LaneActionChip and
 * ExternalAssetPopover). Run with: node ssr-smoke.mjs
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayoutEngine, buildDocument } from '@sld-kit/core';
import { SldCanvas, SldToolbar, LaneActionChip, ExternalAssetPopover } from '@sld-kit/react';

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

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}`);
  if (!ok) failed++;
}
console.log(
  `\n${doc.positions().length} positions, ${doc.busBars().length} bus bars, ${doc.connections().length} connections; ${html.length} bytes of canvas markup`
);
process.exit(failed === 0 ? 0 : 1);
