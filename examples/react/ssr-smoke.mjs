/**
 * Headless smoke test: render the built @sld-kit/react canvas to a string and
 * assert the element views actually paint the fixture's geometry.
 * Run with: node ssr-smoke.mjs
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayoutEngine, buildDocument } from '@sld-kit/core';
import { SldCanvas } from '@sld-kit/react';

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

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}`);
  if (!ok) failed++;
}
console.log(
  `\n${doc.positions().length} positions, ${doc.busBars().length} bus bars, ${doc.connections().length} connections; ${html.length} bytes of markup`
);
process.exit(failed === 0 ? 0 : 1);
