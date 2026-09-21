/**
 * Headless smoke test for the box view: render the built @sld-kit/react
 * CompositeCanvas in box mode to a string and assert it paints boxes (name +
 * sub-label, voltage class), a cable dash, and a transformer glyph. Also checks
 * the office-safe SVG export. Run with: node ssr-smoke.mjs
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSvgExporter,
  DiagramInstance,
  MapResolver,
  Serializer,
  buildDocument,
  newId
} from '@sld-kit/core';
import { CompositeCanvas } from '@sld-kit/react';

const sub = (id, name, busId, kv, feeders) =>
  buildDocument({
    meta: { id, name, substation: name, voltageKv: kv, data: { busId } },
    busbars: [{ label: 'BB', row: 0 }],
    bays: feeders.map((f, i) => ({
      col: i,
      positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: f.label, direction: f.dir, id: f.id } }]
    }))
  });

const a = sub('a', 'ALPHA', 100, 400, [
  { id: 'a-b', label: 'L1', dir: 'right' },
  { id: 'a-c', label: 'T1', dir: 'down' }
]);
const b = sub('b', 'BETA', 200, 220, [{ id: 'b-a', label: 'L1', dir: 'left' }]);
const c = sub('c', 'GAMMA', 300, 220, [{ id: 'c-a', label: 'T1', dir: 'up' }]);

const resolver = new MapResolver(
  new Map([
    ['a', Serializer.toJSON(a)],
    ['b', Serializer.toJSON(b)],
    ['c', Serializer.toJSON(c)]
  ])
);
const composite = new CompositeDocument({ id: 'ov', name: 'Box smoke', boxMode: true });
composite.addChild(DiagramInstance.of({ id: 'a', libraryId: 'a', x: 0, y: 0 }));
composite.addChild(DiagramInstance.of({ id: 'b', libraryId: 'b', x: 900, y: 0 }));
composite.addChild(DiagramInstance.of({ id: 'c', libraryId: 'c', x: 0, y: 700 }));
composite.addLine(new CompositeLine(newId(), [{ kind: 'anchor', instanceId: 'a', connectionId: 'a-b' }, { kind: 'anchor', instanceId: 'b', connectionId: 'b-a' }], 'cable'));
composite.addLine(new CompositeLine(newId(), [{ kind: 'anchor', instanceId: 'a', connectionId: 'a-c' }, { kind: 'anchor', instanceId: 'c', connectionId: 'c-a' }], 'transformer'));
composite.resolveChildren(resolver);

const layout = new CompositeLayoutEngine().layout(composite);
const html = renderToStaticMarkup(
  h(CompositeCanvas, {
    layout,
    boxMode: true,
    boxSubLabel: (child) => String(child.instance.resolved?.meta.data?.busId ?? ''),
    childColorClass: (child) => (child.instance.resolved?.meta.voltageKv >= 400 ? 'sld-volt-400' : 'sld-volt-220')
  })
);

const svg = new CompositeSvgExporter().export(composite, {
  boxMode: true,
  boxFill: () => '#dcfce7',
  boxSubLabel: (child) => String(child.instance.resolved?.meta.data?.busId ?? '')
});

// Auto-facing: with the policy on, a feeder derives its exit side from live box
// positions, so moving a peer across a box flips which edge the tie leaves from.
const alphaSideWithBetaAt = (betaX) => {
  const doc = new CompositeDocument({ id: 'af', name: 'af', boxMode: true, defaultRouting: 'orthogonal', autoFacing: true });
  doc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'a', x: 0, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'b', libraryId: 'b', x: betaX, y: 0 }));
  doc.addLine(new CompositeLine(newId(), [{ kind: 'anchor', instanceId: 'a', connectionId: 'a-b' }, { kind: 'anchor', instanceId: 'b', connectionId: 'b-a' }], 'line'));
  doc.resolveChildren(resolver);
  const l = new CompositeLayoutEngine().layout(doc);
  const al = l.children.find((c) => c.instance.id === 'a');
  const cx = al.worldBounds.x + al.worldBounds.width / 2;
  return l.lines[0].points[0].x >= cx ? 'right' : 'left';
};
const facingRight = alphaSideWithBetaAt(900);
const facingLeft = alphaSideWithBetaAt(-900);

const checks = [
  ['renders an <svg>', /<svg/.test(html)],
  ['renders box names', html.includes('ALPHA') && html.includes('BETA') && html.includes('GAMMA')],
  ['renders box sub-labels (bus id)', html.includes('>100<') && html.includes('>200<')],
  ['tints boxes by voltage class', html.includes('sld-volt-400') && html.includes('sld-volt-220')],
  ['draws a dashed cable', html.includes('stroke-dasharray="6 4"')],
  ['draws a transformer glyph backing', html.includes('fill-background')],
  ['export is office-safe (no class/style/marker)', !svg.includes('class=') && !svg.includes('<style') && !svg.includes('<marker')],
  ['export renders boxes', svg.includes('ALPHA') && svg.includes('#dcfce7')],
  ['auto-facing derives the exit side from live positions', facingRight === 'right' && facingLeft === 'left']
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}`);
  if (!ok) failed++;
}
console.log(`\n${layout.children.length} boxes, ${layout.lines.length} lines; ${html.length} bytes of canvas markup`);
process.exit(failed === 0 ? 0 : 1);
