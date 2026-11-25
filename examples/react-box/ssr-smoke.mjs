/**
 * Headless smoke test for the box view: render the built @sld-kit/react
 * CompositeCanvas in box mode to a string and assert it paints boxes (name +
 * sub-label, voltage class), a cable dash, and a transformer glyph. Also checks
 * the office-safe SVG export, and numeric line labels (data + `lineLabels`
 * resolver) on screen and in the export. Also exercises the app's real fixture +
 * bus-section topology (imported as TypeScript — Node ≥ 22.18 strips types):
 * the fixture's double bus starts with its coupler open, so the box view draws
 * two section boxes joined by a muted tie; closing the coupler merges them into
 * one box labelled with both bus ids. A named line (`CompositeLine.name`) draws
 * its always-on name on screen and in the export. Run with: node ssr-smoke.mjs
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSerializer,
  CompositeSvgExporter,
  DiagramInstance,
  LayoutEngine,
  SLD_LAYOUT,
  ChildDocumentCommand,
  CommandStack,
  UpdateElementCommand,
  MapResolver,
  Serializer,
  buildDocument,
  newId,
  sectionWorldCorners
} from '@sld-kit/core';
import { CompositeCanvas } from '@sld-kit/react';
import { buildBoxComposite, bayId, COUPLER_ID } from './src/fixture.ts';
import { barBusIdLabel, boxSplit, busTopology, openFeeders, sectionLabel } from './src/topology.ts';
import { sampleBatch } from './src/samples/sampleBatch.ts';
import { readBatch, boxSizes, placeDiagrams, appendCommand, appendOrigin } from './src/importBatch.ts';

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
composite.addLine(
  new CompositeLine(newId(), [{ kind: 'anchor', instanceId: 'a', connectionId: 'a-b' }, { kind: 'anchor', instanceId: 'b', connectionId: 'b-a' }], 'cable', undefined, {
    capacity: [1500, 1200, 1100, 1300] // winter, spring, summer, autumn
  })
);
composite.addLine(new CompositeLine(newId(), [{ kind: 'anchor', instanceId: 'a', connectionId: 'a-c' }, { kind: 'anchor', instanceId: 'c', connectionId: 'c-a' }], 'transformer'));
composite.resolveChildren(resolver);

// Consumer-side label resolver: format `line.data` into rows (core never reads it).
// Seasonal capacity [winter, spring, summer, autumn]: 4 values → `w/sp` over
// `su/au`; winter + summer only → one `w/su` row (mirrors the app's formatCapacity).
const formatCapacity = ([w, sp, su, au]) => {
  const join = (...v) => v.filter((x) => x != null).join('/');
  const rows = sp != null || au != null ? [join(w, sp), join(su, au)] : [join(w, su)];
  return rows.filter((r) => r.length > 0);
};
const lineLabels = (line) => (line.data?.capacity ? formatCapacity(line.data.capacity) : null);
const engine = new CompositeLayoutEngine(undefined, undefined, undefined, { lineLabels });
const layout = engine.layout(composite);
const html = renderToStaticMarkup(
  h(CompositeCanvas, {
    layout,
    boxMode: true,
    boxSubLabel: (child) => String(child.instance.resolved?.meta.data?.busId ?? ''),
    childColorClass: (child) => (child.instance.resolved?.meta.voltageKv >= 400 ? 'sld-volt-400' : 'sld-volt-220')
  })
);

// The selection frame carries the selected child's colour class, so app CSS can
// tint it (`.sld-selection { --sld-selection-stroke: var(--sld-pos) }`).
const selectedHtml = renderToStaticMarkup(
  h(CompositeCanvas, {
    layout,
    boxMode: true,
    selectedId: 'a',
    childColorClass: (child) => (child.instance.resolved?.meta.voltageKv >= 400 ? 'sld-volt-400' : 'sld-volt-220')
  })
);

const svg = new CompositeSvgExporter(engine).export(composite, {
  boxMode: true,
  boxFill: () => '#dcfce7',
  boxSubLabel: (child) => String(child.instance.resolved?.meta.data?.busId ?? '')
});

// Line names: an auto-link materialized as a named line (id = the shared feeder
// id), its vertical name reading bottom→top both on screen and in the export.
const namedDoc = new CompositeDocument({ id: 'nm', name: 'nm', boxMode: true, defaultRouting: 'orthogonal' });
namedDoc.addChild(DiagramInstance.of({ id: 'a', libraryId: 'a', x: 0, y: 0 }));
namedDoc.addChild(DiagramInstance.of({ id: 'c', libraryId: 'c', x: 0, y: 700 }));
namedDoc.addLine(
  new CompositeLine('t-ac', [{ kind: 'anchor', instanceId: 'a', connectionId: 'a-c' }, { kind: 'anchor', instanceId: 'c', connectionId: 'c-a' }], 'line', undefined, undefined, 'TR Alpha-Gamma', {
    along: 'middle',
    side: 'above',
    orientation: 'parallel'
  })
);
namedDoc.resolveChildren(resolver);
const namedLayout = new CompositeLayoutEngine().layout(namedDoc);
const namedHtml = renderToStaticMarkup(h(CompositeCanvas, { layout: namedLayout, boxMode: true }));
const namedSvg = new CompositeSvgExporter().export(namedDoc, { boxMode: true });

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

// Bus-section topology on the real fixture (CHARLIE = double bus + coupler,
// which starts OPEN). The engine splits boxes via the app's `boxSplit`.
const fixture = buildBoxComposite();
const charlie = fixture.getChild('lib-charlie').resolved;
const splitEngine = new CompositeLayoutEngine(undefined, undefined, undefined, { boxSections: boxSplit });
const boxSubLabel = (child, section) => sectionLabel(child.instance.resolved, section);
const renderFixture = () =>
  renderToStaticMarkup(h(CompositeCanvas, { layout: splitEngine.layout(fixture), boxMode: true, boxSubLabel }));
const charlieBoxes = () => splitEngine.layout(fixture).children.find((c) => c.instance.id === 'lib-charlie');
const openSections = busTopology(charlie).sections;
const splitChild = charlieBoxes();
const splitHtml = renderFixture();
const sectionHoverHtml = renderToStaticMarkup(
  h(CompositeCanvas, {
    layout: splitEngine.layout(fixture),
    boxMode: true,
    hoverFrame: true,
    hoveredChild: { id: 'lib-charlie', section: splitChild.boxes[1].key }
  })
);
const splitSvg = new CompositeSvgExporter(splitEngine).export(fixture, { boxSubLabel });
// Detail view with the app's child engine: bars labelled by bus id, left of the bar.
const detailFixture = buildBoxComposite();
detailFixture.updateMeta({ boxMode: false });
const detailEngine = new CompositeLayoutEngine(new LayoutEngine({ ...SLD_LAYOUT, busBarLabelAnchor: 'center-left' }, { busBarLabel: barBusIdLabel }));
const detailHtml = renderToStaticMarkup(h(CompositeCanvas, { layout: detailEngine.layout(detailFixture) }));
const detailSvg = new CompositeSvgExporter(detailEngine).export(detailFixture);
// Detail spread (as the app runs it): the fixture's detail drawings never
// overlap, while its box view keeps the stored, compact positions.
const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const anyOverlap = (children) =>
  children.some((a, i) => children.some((b, j) => j > i && overlaps(a.worldBounds, b.worldBounds)));
const spreadEngine = new CompositeLayoutEngine(undefined, undefined, undefined, { detailSpread: {} });
const spreadDetail = spreadEngine.layout(detailFixture);
const spreadBox = spreadEngine.layout(fixture);
const plainBox = new CompositeLayoutEngine().layout(fixture);
// Bulk import: the fictional sample batch, geo-placed and appended to the demo
// fixture as ONE undoable step, with lines from the feeder ids the diagrams share.
const importTarget = buildBoxComposite();
const importStack = new CommandStack();
const importEngine = new CompositeLayoutEngine(undefined, undefined, undefined, { detailSpread: {} });
const batch = readBatch(sampleBatch());
const batchPositions = placeDiagrams(batch.diagrams, boxSizes(importEngine, batch.diagrams), { mode: 'geo', compaction: 0.6 });
const childrenBefore = importTarget.allChildren().length;
const linesBefore = importTarget.allLines().length;
importStack.execute(
  appendCommand(importTarget, batch.diagrams, batchPositions, appendOrigin(importEngine.layout(importTarget).bounds)),
  importTarget
);
const importedBox = importEngine.layout(importTarget);
importTarget.updateMeta({ boxMode: false });
const importedDetail = importEngine.layout(importTarget);
importTarget.updateMeta({ boxMode: true });
const importedLines = importTarget.allLines().length - linesBefore;
importStack.undo(importTarget);
// A batch holding a composite opens it, its children resolved from the batch
// (relinked to the diagrams' fresh ids) and given the box view's defaults.
const someDiagrams = sampleBatch().slice(0, 4);
const plainComposite = new CompositeDocument({ id: 'sample-composite', name: 'Sample composite' });
someDiagrams.forEach((f, i) => {
  const id = JSON.parse(f.text).meta.id;
  plainComposite.addChild(DiagramInstance.of({ id: `i-${id}`, libraryId: id, x: i * 360, y: 0 }));
});
const opened = readBatch([
  ...someDiagrams,
  { path: 'sample-composite.json', text: JSON.stringify(CompositeSerializer.toJSON(plainComposite)) }
]).composite;
// `curved` takes the same route as `orthogonal` and rounds its bends, on screen
// and in the (office-safe) export. BRAVO drops 200px so the ALPHA–BRAVO tie
// bends. Obstacle avoidance is covered by the core tests.
const bentFixture = (routing) => {
  const d = buildBoxComposite();
  d.getChild('lib-bravo').y = 200;
  d.updateMeta({ defaultRouting: routing });
  return d;
};
const tieOf = (layout) => layout.lines.find((l) => l.line.id === 'l-alpha-bravo').points;
const orthoBent = splitEngine.layout(bentFixture('orthogonal'));
const curvedFixture = bentFixture('curved');
const curvedLayout = splitEngine.layout(curvedFixture);
const curvedHtml = renderToStaticMarkup(h(CompositeCanvas, { layout: curvedLayout, boxMode: true, boxSubLabel }));
const orthoBentHtml = renderToStaticMarkup(h(CompositeCanvas, { layout: orthoBent, boxMode: true, boxSubLabel }));
const curvedSvg = new CompositeSvgExporter(splitEngine).export(curvedFixture, { boxSubLabel });
const sameRoute = tieOf(orthoBent).length > 2 && JSON.stringify(tieOf(curvedLayout)) === JSON.stringify(tieOf(orthoBent));
// Switching state is core's first-class `Position.state` (a test may poke it directly).
const setState = (id, state) => {
  charlie.getElement(id).state = state;
};
setState(bayId('charlie-delta'), 'open');
const openBaySections = busTopology(charlie).sections;
const openBayFeeders = openFeeders(charlie);
setState(bayId('charlie-delta'), 'closed');
setState(COUPLER_ID, 'closed');
const closedSections = busTopology(charlie).sections;
const mergedChild = charlieBoxes();
const mergedHtml = renderFixture();
const count = (str, needle) => str.split(needle).length - 1;
const sectionFeeders = (sections) => sections.map((s) => [...s.connectionIds].sort().join(',')).join(' | ');

// Phase 5 operate loop on the real fixture: toggle the coupler from a composite
// command stack (as the detail view's click does) and watch the box view merge,
// then undo to split again.
const operated = buildBoxComposite();
const opStack = new CommandStack();
const opBoxes = () => splitEngine.layout(operated).children.find((c) => c.instance.id === 'lib-charlie').boxes?.length;
const toggleCoupler = (state) => {
  const before = operated.getChild('lib-charlie').resolved.getElement(COUPLER_ID).toJSON();
  opStack.execute(new ChildDocumentCommand('lib-charlie', new UpdateElementCommand(before, { ...before, state })), operated);
};
let opNotified = 0;
operated.subscribe(() => opNotified++);
const opSplit = opBoxes();
toggleCoupler('closed');
const opMerged = opBoxes();
opStack.undo(operated);
const opUndone = opBoxes();

// Operate in box view: CHARLIE expanded in place (detail drawing, centred on its
// box) while every other substation stays a box.
const expandedLayout = splitEngine.layout(fixture, { expanded: ['lib-charlie'] });
const expandedHtml = renderToStaticMarkup(
  h(CompositeCanvas, { layout: expandedLayout, boxMode: true, boxSubLabel, explore: true, focusedId: 'lib-charlie' })
);
const expChild = expandedLayout.children.find((c) => c.instance.id === 'lib-charlie');

const checks = [
  ['renders an <svg>', /<svg/.test(html)],
  ['renders box names', html.includes('ALPHA') && html.includes('BETA') && html.includes('GAMMA')],
  ['renders box sub-labels (bus id)', html.includes('>100<') && html.includes('>200<')],
  ['tints boxes by voltage class', html.includes('sld-volt-400') && html.includes('sld-volt-220')],
  ['draws a dashed cable', html.includes('stroke-dasharray="6 4"')],
  ['draws a transformer glyph backing', html.includes('fill-background')],
  ['export is office-safe (no class/style/marker)', !svg.includes('class=') && !svg.includes('<style') && !svg.includes('<marker')],
  ['export renders boxes', svg.includes('ALPHA') && svg.includes('#dcfce7')],
  ['draws stacked line labels', html.includes('>1500/1200<') && html.includes('>1100/1300<')],
  ['formats a winter/summer-only capacity as one row', formatCapacity([150, undefined, 100, undefined]).join('|') === '150/100'],
  ['exports stacked line labels', svg.includes('>1500/1200<') && svg.includes('>1100/1300<')],
  ['draws a named line\'s name, readable bottom→top', namedHtml.includes('class="sld-line-name') && namedHtml.includes('>TR Alpha-Gamma<') && namedLayout.lines[0].nameLabel?.rotation === -90],
  ['exports the line name as office-safe rotated text', namedSvg.includes('>TR Alpha-Gamma</text>') && /rotate\(-90 /.test(namedSvg) && !namedSvg.includes('class=')],
  ['an unnamed line draws no name', !html.includes('sld-line-name')],
  [
    'open coupler: two sections, feeders on their own bar',
    openSections.length === 2 && sectionFeeders(openSections) === 'charlie-alpha | charlie-delta,charlie-dem,charlie-dem3'
  ],
  ['open coupler: CHARLIE lays out as two boxes joined by a tie', splitChild.boxes?.length === 2 && splitChild.ties?.length === 1],
  ['open coupler: each box shows its own bus id', splitHtml.includes('>39770<') && splitHtml.includes('>39771<') && !splitHtml.includes('39770 / 39771')],
  ['open coupler: the export draws both boxes and a muted tie', splitSvg.includes('>39770<') && splitSvg.includes('>39771<') && splitSvg.includes('stroke-opacity="0.45"')],
  ['closed coupler: one section with both bus ids', closedSections.length === 1 && sectionLabel(charlie) === '39770 / 39771'],
  ['closed coupler: merges back into one box, "39770 / 39771"', mergedChild.boxes?.length === 1 && !mergedChild.ties?.length && mergedHtml.includes('>39770 / 39771<')],
  [
    'open bay: feeder stays on its bar, flagged de-energised',
    sectionFeeders(openBaySections) === 'charlie-alpha | charlie-delta,charlie-dem,charlie-dem3' &&
      openBaySections[1].openConnectionIds.join() === 'charlie-delta'
  ],
  ['open bay: its feeder is reported de-energised (greys its line)', openBayFeeders.has('charlie-delta') && openBayFeeders.size === 1],
  ['detail bars show their bus id, left-anchored', /text-anchor="end"[^>]*>39771</.test(detailHtml) && !detailHtml.includes('>BB1<')],
  ['detail export draws the open coupler with core\'s default open look', detailSvg.includes('stroke-dasharray="4 3"') && detailSvg.includes('fill-opacity="0.3"')],
  ['detail export greys + dashes the open coupler\'s stems to both bars', (detailSvg.match(/<path[^>]*stroke="#94a3b8"[^>]*stroke-dasharray="4 3"/g) ?? []).length >= 2],
  ['detail canvas greys the open coupler\'s stems too', detailHtml.includes('stroke="#94a3b8"')],
  ['detail export shows bar bus ids', /text-anchor="end"[^>]*>39770</.test(detailSvg)],
  [
    'operate: closing the coupler via a composite command merges CHARLIE; undo splits it again',
    opSplit === 2 && opMerged === 1 && opUndone === 2 && opNotified === 2
  ],
  [
    'operate (box view): the opened substation expands in place, the rest stay boxes',
    expChild.expanded === true &&
      expChild.frame.width > 200 &&
      expandedHtml.includes('>BC<') && // CHARLIE's coupler position is drawn
      expandedHtml.includes('>DELTA<') && // neighbours still render as boxes
      !expandedHtml.includes('sld-morph-ghost') // no animation on first render / SSR
  ],
  ['curved: same route as orthogonal, bends drawn as arcs on screen', sameRoute && / A 12 12 0 0 [01] /.test(curvedHtml) && !/ A 12 12 0 0 [01] /.test(orthoBentHtml)],
  [
    'curved: the export draws arcs and stays office-safe',
    / A 12 12 0 0 [01] /.test(curvedSvg) && !curvedSvg.includes('<style') && !curvedSvg.includes('class=') && !curvedSvg.includes('currentColor')
  ],
  ['auto-facing derives the exit side from live positions', facingRight === 'right' && facingLeft === 'left'],
  [
    'split box view: one hover hit rect per section box',
    // every child's whole-frame rect, plus one per section box of the split CHARLIE
    count(splitHtml, 'class="cursor-move"') === fixture.allChildren().length + splitChild.boxes.length
  ],
  [
    'split box view: a hovered section gets a frame through its own (world) corners',
    sectionHoverHtml.includes(`points="${sectionWorldCorners(splitChild, splitChild.boxes[1].key).map((p) => `${p.x},${p.y}`).join(' ')}"`) &&
      sectionHoverHtml.includes(`data-section="${splitChild.boxes[1].key}"`)
  ],
  ['detail spread: no detail drawings overlap', !anyOverlap(spreadDetail.children)],
  [
    'detail spread: the box view is untouched',
    JSON.stringify(spreadBox.children.map((c) => c.worldBounds)) === JSON.stringify(plainBox.children.map((c) => c.worldBounds))
  ],
  ['import: every sample file is valid', batch.results.length === batch.diagrams.length && batch.results.every((r) => r.status === 'imported')],
  ['import: every diagram lands on the canvas', importedBox.children.length === childrenBefore + batch.diagrams.length],
  ['import: shared feeder ids become lines', importedLines > 0 && importedBox.lines.length >= importedLines],
  ['import: no boxes overlap', !anyOverlap(importedBox.children)],
  ['import: no detail drawings overlap', !anyOverlap(importedDetail.children)],
  [
    'import: one undo removes the whole batch',
    importTarget.allChildren().length === childrenBefore && importTarget.allLines().length === linesBefore
  ],
  [
    'import: a composite in the batch opens, every child resolved, as a box view',
    opened?.allChildren().length === 4 &&
      opened.allChildren().every((c) => c.resolved) &&
      opened.meta.boxMode === true &&
      opened.meta.defaultRouting === 'orthogonal'
  ],
  ['selection frame carries the child\'s colour class', selectedHtml.includes('class="sld-selection text-primary pointer-events-none sld-volt-400" data-state="selected"')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}`);
  if (!ok) failed++;
}
console.log(`\n${layout.children.length} boxes, ${layout.lines.length} lines; ${html.length} bytes of canvas markup`);
process.exit(failed === 0 ? 0 : 1);
