import { describe, it, expect } from 'vitest';
import {
  CompositeDocument,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSvgExporter,
  DEMAND_LEAD_LENGTH,
  DiagramInstance,
  HANGING_STAGGER_STEP,
  SLD_LAYOUT,
  MapResolver,
  Serializer,
  buildDocument,
  lineNameLayout,
  placeLineLabel,
  type CompositeLayout,
  type CompositeLineLayout,
  type Point,
  type Rect,
  type TextLeader
} from '../src';
import { CALLOUT_STEP, candidateSlots, polylineHitsRect, rectsOverlap } from '../src/composite/labelCollisions';

/**
 * CHARLIE and DELTA side by side, `n` lines between them (c-i ↔ d-i), each
 * carrying the given rating rows and name. `dy` drops DELTA so the lines bend
 * (a bundle of Z's); 0 keeps them straight and parallel, ~14 px apart.
 */
function pair(
  lines: { rows?: string[]; name?: string }[],
  opts: { dy?: number; link?: boolean } = {}
): { doc: CompositeDocument; engine: CompositeLayoutEngine } {
  const stacked = (id: string, feeders: string[], direction: 'left' | 'right') =>
    buildDocument({
      meta: { id, name: id.toUpperCase(), substation: id, voltageKv: 220 },
      busbars: [{ label: 'BB', row: 0 }],
      bays: [
        {
          col: 0,
          positions: feeders.map((f, i) => ({
            type: 'line' as const,
            row: i + 1,
            feeder: { asset: 'line' as const, label: f, direction, id: f }
          }))
        }
      ]
    });
  const cs = lines.map((_, i) => `c-${i}`);
  const ds = lines.map((_, i) => `d-${i}`);
  if (opts.link) {
    cs.push('tie');
    ds.push('tie');
  }
  const res = new MapResolver(
    new Map([
      ['c', Serializer.toJSON(stacked('c', cs, 'right'))],
      ['d', Serializer.toJSON(stacked('d', ds, 'left'))]
    ])
  );
  const doc = new CompositeDocument({ id: 'x', name: 'x', boxMode: true, defaultRouting: 'orthogonal' });
  doc.addChild(DiagramInstance.of({ id: 'c', libraryId: 'c', x: 0, y: 0 }));
  doc.addChild(DiagramInstance.of({ id: 'd', libraryId: 'd', x: 560, y: opts.dy ?? 0 }));
  lines.forEach((l, i) =>
    doc.addLine(
      new CompositeLine(
        `l${i}`,
        [
          { kind: 'anchor', instanceId: 'c', connectionId: `c-${i}` },
          { kind: 'anchor', instanceId: 'd', connectionId: `d-${i}` }
        ],
        'line',
        undefined,
        l.rows ? { rows: l.rows } : undefined,
        l.name
      )
    )
  );
  doc.resolveChildren(res);
  const rowsOf = (line: CompositeLine) => (line.data as { rows?: string[] } | undefined)?.rows;
  return { doc, engine: new CompositeLayoutEngine(undefined, undefined, undefined, { lineLabels: rowsOf }) };
}

/** Every text box of a layout (ratings and names), with what it belongs to. */
const texts = (layout: CompositeLayout): { id: string; box: Rect }[] =>
  layout.lines.flatMap((l) => [
    ...(l.label ? [{ id: `${l.line.id}:label`, box: l.label.box }] : []),
    ...(l.nameLabel ? [{ id: `${l.line.id}:name`, box: l.nameLabel.box }] : [])
  ]);

const shrink = (r: Rect, d = 1): Rect => ({ x: r.x + d, y: r.y + d, width: r.width - 2 * d, height: r.height - 2 * d });

function overlappingTexts(layout: CompositeLayout): string[] {
  const all = texts(layout);
  const out: string[] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      if (rectsOverlap(shrink(all[i].box), all[j].box)) out.push(`${all[i].id} × ${all[j].id}`);
  return out;
}

function textsOnLines(layout: CompositeLayout): string[] {
  const polylines: { id: string; points: Point[] }[] = [
    ...layout.lines.map((l) => ({ id: l.line.id, points: l.points })),
    ...layout.links.map((l) => ({ id: `link:${l.connectionId}`, points: l.points }))
  ];
  return texts(layout).flatMap((t) =>
    polylines.filter((p) => polylineHitsRect(p.points, shrink(t.box))).map((p) => `${t.id} on ${p.id}`)
  );
}

/** Distance from `p` to the nearest point of a polyline. */
function distanceToPolyline(p: Point, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** Every leader of a layout, with the line it belongs to. */
const leadersOf = (layout: CompositeLayout): { line: CompositeLineLayout; leader: TextLeader }[] =>
  layout.lines.flatMap((line) =>
    [line.label?.leader, line.nameLabel?.leader].flatMap((leader) => (leader ? [{ line, leader }] : []))
  );

/**
 * Each leader belongs to its own line unambiguously: its dot sits on its own
 * line and on no other one, and its far end touches no line at all.
 */
function strayLeaders(layout: CompositeLayout): string[] {
  const out: string[] = [];
  const all = [
    ...layout.lines.map((l) => ({ id: l.line.id, points: l.points })),
    ...layout.links.map((l) => ({ id: `link:${l.connectionId}`, points: l.points }))
  ];
  for (const { line, leader } of leadersOf(layout)) {
    if (distanceToPolyline(leader.dot, line.points) > 0.5) out.push(`${line.line.id}: dot off its line`);
    for (const other of all) {
      if (other.id !== line.line.id && distanceToPolyline(leader.dot, other.points) < 1)
        out.push(`${line.line.id}: dot on ${other.id}`);
      const end = leader.points[leader.points.length - 1];
      if (distanceToPolyline(end, other.points) < 1) out.push(`${line.line.id}: leader ends on ${other.id}`);
    }
  }
  return out;
}

describe('Line text collisions', () => {
  it('parallel ties with ratings: no two texts overlap and none sits on a line', () => {
    const { doc, engine } = pair([{ rows: ['575/510', '370/455'] }, { rows: ['100/100'] }, { rows: ['100/100'] }], {
      link: true
    });
    const layout = engine.layout(doc);
    expect(texts(layout)).toHaveLength(3);
    expect(overlappingTexts(layout)).toEqual([]);
    expect(textsOnLines(layout)).toEqual([]);
  });

  it('a line sandwiched between neighbours gets a callout whose leader ends on it', () => {
    const { doc, engine } = pair([{ rows: ['575/510', '370/455'] }, { rows: ['100/100'] }, { rows: ['100/100'] }], {
      link: true
    });
    const layout = engine.layout(doc);
    const middle = layout.lines.find((l) => l.line.id === 'l1')!;
    expect(middle.label?.leader).toBeDefined();
    expect(middle.labelSlot?.offset).toBeGreaterThan(0);
    expect(strayLeaders(layout)).toEqual([]);
  });

  it('callouts spread along the line rather than stacking at one spot', () => {
    const { doc, engine } = pair(
      [{ rows: ['100/100'] }, { rows: ['100/100'] }, { rows: ['100/100'] }, { rows: ['100/100'] }],
      { link: true }
    );
    const layout = engine.layout(doc);
    // Leaders heading the same way (up / down) never share a spot along the line.
    const spots = leadersOf(layout).map(({ leader }) => {
      const end = leader.points[leader.points.length - 1];
      return `${Math.round(leader.dot.x)}:${Math.sign(end.y - leader.dot.y)}`;
    });
    expect(spots.length).toBeGreaterThan(1);
    expect(new Set(spots).size).toBe(spots.length);
    expect(overlappingTexts(layout)).toEqual([]);
    expect(textsOnLines(layout)).toEqual([]);
    expect(strayLeaders(layout)).toEqual([]);
  });

  it('a text with a clear spot beside its line never becomes a callout', () => {
    // Two lines, well apart: both ratings fit beside their own line.
    const { doc, engine } = pair([{ rows: ['575/510'] }, { rows: ['100/100'] }]);
    const layout = engine.layout(doc);
    for (const l of layout.lines) expect(l.label?.leader).toBeUndefined();
  });

  it('a bundle of bent ties with ratings and names: no two texts overlap', () => {
    const { doc, engine } = pair(
      [
        { rows: ['575/510', '370/455'], name: 'L-220 Charlie-Delta 1' },
        { rows: ['100/100'] },
        { rows: ['100/100'], name: 'L-220 Charlie-Delta 3' }
      ],
      { dy: 160, link: true }
    );
    const layout = engine.layout(doc);
    expect(texts(layout)).toHaveLength(5);
    expect(overlappingTexts(layout)).toEqual([]);
    expect(textsOnLines(layout)).toEqual([]);
    expect(strayLeaders(layout)).toEqual([]);
  });

  it('a name and a rating on the same line keep apart', () => {
    const { doc, engine } = pair([{ rows: ['575/510'], name: 'L-220 Charlie-Delta' }]);
    const [line] = engine.layout(doc).lines;
    expect(line.label && line.nameLabel).toBeTruthy();
    expect(rectsOverlap(shrink(line.label!.box), line.nameLabel!.box)).toBe(false);
    // The rating kept its default slot (placed first); the name moved.
    expect(line.labelSlot).toBeUndefined();
    expect(line.nameSlot).toBeDefined();
  });

  it('a text whose default slot is clear stays exactly where it was', () => {
    const { doc, engine } = pair([{ rows: ['575/510', '370/455'] }]);
    const [line] = engine.layout(doc).lines;
    expect(line.labelSlot).toBeUndefined();
    expect(line.label).toEqual(placeLineLabel(line.points, ['575/510', '370/455']));
  });

  it('is deterministic', () => {
    const make = () => {
      const { doc, engine } = pair(
        [{ rows: ['575/510'], name: 'A' }, { rows: ['100/100'], name: 'B' }, { rows: ['100/100'] }],
        { dy: 160 }
      );
      return engine.layout(doc).lines.map((l) => [l.label, l.labelSlot, l.nameLabel, l.nameSlot]);
    };
    expect(make()).toEqual(make());
  });

  it('a zoom-aware re-placement (lineNameLayout) keeps the resolved slot', () => {
    const { doc, engine } = pair([{ rows: ['575/510'], name: 'L-220 Charlie-Delta' }]);
    const [line] = engine.layout(doc).lines;
    expect(line.nameSlot).toBeDefined();
    // Same size → exactly the resolved name.
    expect(lineNameLayout(line, line.nameLabel!.fontSize)).toEqual(line.nameLabel);
    // Bigger → still on the resolved side of the line, not back on the rating.
    const lineY = line.points[0].y;
    const big = lineNameLayout(line, line.nameLabel!.fontSize * 1.5)!;
    expect(Math.sign(big.box.y + big.box.height / 2 - lineY)).toBe(
      Math.sign(line.nameLabel!.box.y + line.nameLabel!.box.height / 2 - lineY)
    );
  });

  it('the export draws the resolved slots and every leader, Office-safe', () => {
    const { doc, engine } = pair(
      [{ rows: ['575/510'], name: 'L-220 Charlie-Delta' }, { rows: ['100/100'] }, { rows: ['100/100'] }],
      { link: true }
    );
    const layout = engine.layout(doc);
    const svg = new CompositeSvgExporter(engine).export(doc);
    // The exporter writes numbers rounded to 2 decimals.
    const n = (v: number) => String(Math.round(v * 100) / 100);
    for (const l of layout.lines) {
      for (const row of l.label?.rows ?? []) expect(svg).toContain(`x="${n(row.x)}" y="${n(row.y)}"`);
      if (l.nameLabel) expect(svg).toContain(`x="${n(l.nameLabel.x)}" y="${n(l.nameLabel.y)}"`);
    }
    const leaders = leadersOf(layout);
    expect(leaders.length).toBeGreaterThan(0);
    for (const { leader } of leaders) expect(svg).toContain(`cx="${n(leader.dot.x)}" cy="${n(leader.dot.y)}"`);
    expect(svg).not.toMatch(/<style|class=|<marker|currentColor/);
  });

  it('a callout name keeps its leader when a zoom-aware canvas resizes it', () => {
    const { doc, engine } = pair(
      [
        { rows: ['575/510', '370/455'], name: 'L-220 Charlie-Delta 1' },
        { rows: ['100/100'] },
        { name: 'L-220 Charlie-Delta 3' }
      ],
      { link: true }
    );
    const layout = engine.layout(doc);
    const callout = layout.lines.find((l) => l.nameLabel?.leader)!;
    expect(callout).toBeDefined();
    const small = callout.nameLabel!;
    const big = lineNameLayout(callout, small.fontSize * 1.5)!;
    // Still a callout, its dot still on its own line (a wider name may slide a
    // little along it to stay on a long enough run), on the same side.
    expect(big.leader).toBeDefined();
    expect(distanceToPolyline(big.leader!.dot, callout.points)).toBeLessThan(0.5);
    const side = (l: TextLeader) => Math.sign(l.points[l.points.length - 1].y - l.dot.y);
    expect(side(big.leader!)).toBe(side(small.leader!));
  });
});

describe('candidateSlots', () => {
  it('tries the default, its flip, then slides along the line, then callouts row by row', () => {
    const slots = candidateSlots({ fraction: 0.5, side: 1 });
    expect(slots.slice(0, 4)).toEqual([
      { fraction: 0.5, side: 1 },
      { fraction: 0.5, side: -1 },
      { fraction: 0.45, side: 1 },
      { fraction: 0.45, side: -1 }
    ]);
    // Never too close to the ends.
    for (const s of slots) expect(s.fraction).toBeGreaterThanOrEqual(0.08);
    for (const s of slots) expect(s.fraction).toBeLessThanOrEqual(0.92);
    // Callouts come last, nearest row first, spread along the line every 0.1
    // of its length (both sides at each spot).
    const callouts = slots.filter((s) => s.offset);
    expect(callouts[0]).toEqual({ fraction: 0.5, side: 1, offset: CALLOUT_STEP });
    expect(slots.indexOf(callouts[0])).toBe(slots.length - callouts.length);
    const firstRow = callouts.filter((s) => s.offset === CALLOUT_STEP);
    expect(firstRow.slice(0, 4).map(({ fraction, side }) => ({ fraction, side }))).toEqual([
      { fraction: 0.5, side: 1 },
      { fraction: 0.5, side: -1 },
      { fraction: 0.4, side: 1 },
      { fraction: 0.4, side: -1 }
    ]);
  });
});

describe('Hanging-tie labels (box view)', () => {
  /**
   * CHARLIE with a tie up to ALPHA plus `n` hanging ties (generator, demand,
   * storage) on the same top side: the box edge gives each ~50 px, narrower
   * than their labels.
   */
  function crowded(n: number) {
    const hanging = [
      { id: 'sol1', label: 'Sol 1 - 600 MW', asset: 'renewable' as const },
      { id: 'd3', label: 'D3 - 600 MW', asset: 'demand' as const },
      { id: 'bat', label: 'Battery 2 - 150 MW', asset: 'storage' as const }
    ].slice(0, n);
    const charlie = buildDocument({
      meta: { id: 'charlie', name: 'CHARLIE', substation: 'CHARLIE', voltageKv: 220 },
      busbars: [{ label: 'BB', row: 1 }],
      bays: [
        {
          col: 0,
          positions: [{ type: 'line', row: 0, feeder: { asset: 'line', label: 'T1', direction: 'up', id: 't1' } }]
        },
        ...hanging.map((f, i) => ({
          col: i + 1,
          positions: [
            { type: f.asset, row: 0, feeder: { asset: f.asset, label: f.label, direction: 'up' as const, id: f.id } }
          ]
        }))
      ]
    });
    const alpha = buildDocument({
      meta: { id: 'alpha', name: 'ALPHA', substation: 'ALPHA', voltageKv: 400 },
      busbars: [{ label: 'BB', row: 0 }],
      bays: [
        {
          col: 0,
          positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: 'T1', direction: 'down', id: 't1' } }]
        }
      ]
    });
    const doc = new CompositeDocument({ id: 'x', name: 'x', boxMode: true, defaultRouting: 'orthogonal' });
    doc.addChild(DiagramInstance.of({ id: 'charlie', libraryId: 'charlie', x: 0, y: 300 }));
    doc.addChild(DiagramInstance.of({ id: 'alpha', libraryId: 'alpha', x: -120, y: 0 }));
    doc.addLine(
      new CompositeLine('t', [
        { kind: 'anchor', instanceId: 'alpha', connectionId: 't1' },
        { kind: 'anchor', instanceId: 'charlie', connectionId: 't1' }
      ])
    );
    doc.resolveChildren(
      new MapResolver(
        new Map([
          ['charlie', Serializer.toJSON(charlie)],
          ['alpha', Serializer.toJSON(alpha)]
        ])
      )
    );
    return doc;
  }

  /** Estimated label box, as the layout sizes it (0.62 em per character). */
  const labelBox = (label: { text: string; at: Point; textAnchor: string }): Rect => {
    const fs = SLD_LAYOUT.labelFontSize;
    const width = label.text.length * fs * 0.62;
    const left =
      label.textAnchor === 'start'
        ? label.at.x
        : label.textAnchor === 'end'
          ? label.at.x - width
          : label.at.x - width / 2;
    return { x: left, y: label.at.y - fs, width, height: fs * 1.25 };
  };

  it('a hanging tie with room keeps its default lead', () => {
    const layout = new CompositeLayoutEngine().layout(crowded(1));
    expect(layout.hangers).toHaveLength(1);
    expect(layout.hangers[0].stagger).toBeUndefined();
  });

  for (const n of [2, 3]) {
    it(`${n} crowded hanging ties stagger their leads so no label overlaps another label, glyph or lead`, () => {
      const layout = new CompositeLayoutEngine().layout(crowded(n));
      const hangers = layout.hangers;
      expect(hangers).toHaveLength(n);
      expect(hangers.some((h) => h.stagger)).toBe(true);
      for (const h of hangers) {
        // The lead, its glyph and its label move together.
        const [start, end] = [h.points[0], h.points[h.points.length - 1]];
        expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(DEMAND_LEAD_LENGTH + (h.stagger ?? 0));
        expect(h.terminus.at).toEqual(end);
        if (h.stagger) expect(h.stagger % HANGING_STAGGER_STEP).toBe(0);
      }
      for (const a of hangers) {
        const box = shrink(labelBox(a.label!));
        for (const b of hangers) {
          if (a === b) continue;
          expect(rectsOverlap(box, labelBox(b.label!)), `${a.connectionId} × ${b.connectionId} label`).toBe(false);
          const g = b.terminus.at;
          expect(
            rectsOverlap(box, { x: g.x - 11, y: g.y - 11, width: 22, height: 22 }),
            `${a.connectionId} × ${b.connectionId} glyph`
          ).toBe(false);
          expect(polylineHitsRect(b.points, box), `${a.connectionId} on ${b.connectionId} lead`).toBe(false);
        }
      }
    });
  }

  it('the export draws the staggered leads and labels', () => {
    const doc = crowded(2);
    const layout = new CompositeLayoutEngine().layout(doc);
    const svg = new CompositeSvgExporter().export(doc);
    const n = (v: number) => String(Math.round(v * 100) / 100);
    for (const h of layout.hangers) expect(svg).toContain(`x="${n(h.label!.at.x)}" y="${n(h.label!.at.y)}"`);
  });

  it('is deterministic', () => {
    const run = () => new CompositeLayoutEngine().layout(crowded(3)).hangers.map((h) => [h.points, h.label, h.stagger]);
    expect(run()).toEqual(run());
  });
});
