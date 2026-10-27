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
  CompositeToolbar,
  resolveViewStyle
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
  ['composite draws the selection frame', cc.includes('stroke-dasharray:var(--sld-selection-dash, 6 4)')]
);

// Styleable selection chrome (#69): class hooks, data-state and CSS-variable
// paint whose fallbacks are today's numbers; `style.composite.selection` tunes them.
const count = (s, needle) => s.split(needle).length - 1;
const firstChild = clayout.children[0];
const styled = renderToStaticMarkup(
  h(CompositeCanvas, {
    layout: clayout,
    selectedId: firstChild.instance.id,
    style: resolveViewStyle({ composite: { selection: { strokeWidth: 3, padding: 10, cornerRadius: 5 } } })
  })
);
const unselected = renderToStaticMarkup(h(CompositeCanvas, { layout: clayout }));
// Adapter-tracked hover (#69, phase 2). Pointer tracking can't run in SSR, so
// these drive the same frames through the controlled `hoveredChild` prop.
function hoverChecks() {
  const [a, b] = clayout.children.map((c) => c.instance.id);
  const render = (props) => renderToStaticMarkup(h(CompositeCanvas, { layout: clayout, selectedId: a, ...props }));
  const off = render({ hoveredChild: { id: b } });
  const other = render({ hoverFrame: true, hoveredChild: { id: b } });
  const same = render({ hoverFrame: true, hoveredChild: { id: a, section: 's1' } });
  const onlyHover = renderToStaticMarkup(h(CompositeCanvas, { layout: clayout, hoverFrame: true, hoveredChild: { id: b } }));
  return [
    ['hover: no frame unless `hoverFrame` is on', count(off, 'class="sld-selection ') === 1 && !off.includes('data-state="hover"')],
    [
      'hover: an unselected child gets a faded hover frame without a rotate handle',
      count(other, 'class="sld-selection ') === 2 &&
        other.includes('data-state="hover" data-hover="true" opacity="0.55"') &&
        count(other, 'sld-selection-rotate') === 1
    ],
    [
      'hover: over the selected child it marks that frame instead of stacking one',
      count(same, 'class="sld-selection ') === 1 && same.includes('data-state="selected" data-hover="true" data-section="s1"')
    ],
    ['hover: works without a selection', count(onlyHover, 'class="sld-selection ') === 1 && !onlyHover.includes('sld-selection-rotate')]
  ];
}
const tl = firstChild.worldCorners[0];
checks.push(
  ['selection frame: root hook + state', cc.includes('class="sld-selection text-primary pointer-events-none" data-state="selected"')],
  [
    'selection frame: part hooks (outline, 4 corners, rotate handle)',
    count(cc, 'sld-selection-outline') === 1 && count(cc, 'sld-selection-corner') === 4 && count(cc, 'sld-selection-rotate') === 1
  ],
  [
    'selection frame: CSS variables fall back to the default numbers',
    cc.includes('stroke:var(--sld-selection-stroke, currentColor)') && cc.includes('stroke-width:var(--sld-selection-width, 1.5)')
  ],
  ['selection frame: default corner dots + handle sizes', cc.includes('r="3.5"') && cc.includes('r="6"')],
  ['selection frame: `style.composite.selection` overrides width + corner size', styled.includes('--sld-selection-width, 3') && styled.includes('r="5"')],
  ['selection frame: padding pushes the corners out along the edges', styled.includes(`cx="${tl.x - 10}" cy="${tl.y - 10}"`)],
  ['selection frame: none without a selection', !unselected.includes('sld-selection')],
  ['selection frame: no hover markup by default', !cc.includes('data-hover') && count(cc, 'class="sld-selection ') === 1],
  ...hoverChecks(),
  ['resolveViewStyle keeps unspecified selection numbers', resolveViewStyle({ composite: { selection: { padding: 2 } } }).composite.selection.dashArray === '6 4']
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
