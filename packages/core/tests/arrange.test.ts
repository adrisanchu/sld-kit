import { describe, it, expect } from 'vitest';
import { removeOverlaps, projectLocations, arrangeByAnchors, type ArrangeItem, type Rect } from '../src';

const BOX = { width: 200, height: 72 };

/** True when two rects are closer than `gap` on both axes (i.e. they collide). */
const collide = (a: Rect, b: Rect, gap = 0) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + gap > 1e-6 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + gap > 1e-6;

const anyCollision = (rects: Rect[], gap = 0) =>
  rects.some((a, i) => rects.some((b, j) => j > i && collide(a, b, gap)));

/** Deterministic pseudo-random numbers (mulberry32), so the tests are stable. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const moved = (rect: Rect, d: { x: number; y: number } | undefined): Rect => ({
  ...rect,
  x: rect.x + (d?.x ?? 0),
  y: rect.y + (d?.y ?? 0)
});

describe('removeOverlaps', () => {
  it('leaves separated frames untouched', () => {
    const items = [
      { id: 'a', rect: { x: 0, y: 0, ...BOX } },
      { id: 'b', rect: { x: 300, y: 0, ...BOX } }
    ];
    const out = removeOverlaps(items, { gap: 40 });
    expect(out.get('a')).toEqual({ x: 0, y: 0 });
    expect(out.get('b')).toEqual({ x: 0, y: 0 });
  });

  it('separates a pair along its least-penetrated axis, keeping its order', () => {
    // 50 px of horizontal overlap, 72 px vertical: they part horizontally.
    const items = [
      { id: 'a', rect: { x: 0, y: 0, ...BOX } },
      { id: 'b', rect: { x: 150, y: 0, ...BOX } }
    ];
    const out = removeOverlaps(items, { gap: 10 });
    const a = moved(items[0].rect, out.get('a'));
    const b = moved(items[1].rect, out.get('b'));
    expect(out.get('a')!.y).toBe(0);
    expect(out.get('b')!.y).toBe(0);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x - (a.x + a.width)).toBeCloseTo(10);
    // Shared equally.
    expect(out.get('a')!.x).toBeCloseTo(-30);
    expect(out.get('b')!.x).toBeCloseTo(30);
  });

  it('never moves a fixed frame', () => {
    const items = [
      { id: 'a', rect: { x: 0, y: 0, ...BOX } },
      { id: 'b', rect: { x: 20, y: 30, ...BOX } },
      { id: 'c', rect: { x: 40, y: -20, ...BOX } }
    ];
    const out = removeOverlaps(items, { gap: 20, fixed: ['a'] });
    expect(out.get('a')).toEqual({ x: 0, y: 0 });
    const rects = items.map((it) => moved(it.rect, out.get(it.id)));
    expect(anyCollision(rects, 20)).toBe(false);
  });

  it('keeps a fixed frame put inside a dense pile', () => {
    const r = rng(11);
    const items = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, rect: { x: r() * 400, y: r() * 200, ...BOX } }));
    const out = removeOverlaps(items, { gap: 16, fixed: ['n5'] });
    expect(out.get('n5')).toEqual({ x: 0, y: 0 });
    expect(
      anyCollision(
        items.map((it) => moved(it.rect, out.get(it.id))),
        16
      )
    ).toBe(false);
  });

  it('clears a dense random pile, deterministically', () => {
    const r = rng(7);
    const items = Array.from({ length: 80 }, (_, i) => ({
      id: `n${i}`,
      rect: { x: r() * 1200, y: r() * 600, ...BOX }
    }));
    const out = removeOverlaps(items, { gap: 24 });
    const rects = items.map((it) => moved(it.rect, out.get(it.id)));
    expect(anyCollision(rects, 24)).toBe(false);
    expect(removeOverlaps(items, { gap: 24 })).toEqual(out);
  });

  it('parts identical frames by input order', () => {
    const items = [
      { id: 'first', rect: { x: 0, y: 0, ...BOX } },
      { id: 'second', rect: { x: 0, y: 0, ...BOX } }
    ];
    const out = removeOverlaps(items);
    // The cheaper axis for a 200×72 box is vertical; the first one goes up.
    expect(out.get('first')!.y).toBeLessThan(out.get('second')!.y);
  });
});

describe('projectLocations', () => {
  it('puts north up and east right', () => {
    const [sw, ne] = projectLocations([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 }
    ]);
    expect(ne.x).toBeGreaterThan(sw.x);
    expect(ne.y).toBeLessThan(sw.y);
  });

  it('shrinks longitude by the cosine of the mean latitude', () => {
    const [a, b] = projectLocations([
      { lat: 60, lng: 0 },
      { lat: 60, lng: 2 }
    ]);
    expect(b.x - a.x).toBeCloseTo(1); // cos 60° = 0.5
  });

  it('handles an empty list', () => {
    expect(projectLocations([])).toEqual([]);
  });
});

describe('arrangeByAnchors', () => {
  const item = (id: string, x: number, y: number): ArrangeItem => ({ id, anchor: { x, y }, size: BOX });
  const rectsOf = (items: ArrangeItem[], out: Map<string, { x: number; y: number }>) =>
    items.map((it) => ({ ...out.get(it.id)!, ...it.size }));
  const centre = (p: { x: number; y: number }) => ({ x: p.x + BOX.width / 2, y: p.y + BOX.height / 2 });

  it('places every item without overlaps, starting at the origin', () => {
    const r = rng(42);
    const items = Array.from({ length: 60 }, (_, i) => item(`n${i}`, r() * 3, r() * 2));
    const out = arrangeByAnchors(items, { gap: 40 });
    expect(out.size).toBe(60);
    const rects = rectsOf(items, out);
    expect(anyCollision(rects, 40)).toBe(false);
    expect(Math.min(...rects.map((r) => r.x))).toBeCloseTo(0);
    expect(Math.min(...rects.map((r) => r.y))).toBeCloseTo(0);
  });

  it('keeps who is west / north of whom on a sparse grid', () => {
    // A 4×3 lattice with uneven spacing: nothing collides, so only scale + caps act.
    const xs = [0, 1, 1.5, 6];
    const ys = [0, 2, 2.4];
    const items = xs.flatMap((x, i) => ys.map((y, j) => item(`${i}-${j}`, x, y)));
    const out = arrangeByAnchors(items);
    for (const a of items) {
      for (const b of items) {
        const ca = centre(out.get(a.id)!);
        const cb = centre(out.get(b.id)!);
        if (a.anchor.x < b.anchor.x) expect(ca.x).toBeLessThan(cb.x);
        if (a.anchor.y < b.anchor.y) expect(ca.y).toBeLessThan(cb.y);
      }
    }
  });

  it('pulls a far outlier in (compaction caps the empty stretch)', () => {
    const items = [item('a', 0, 0), item('b', 1, 0), item('c', 2, 0), item('far', 100, 0)];
    const spread = (c: number) => {
      const out = arrangeByAnchors(items, { compaction: c });
      return out.get('far')!.x - out.get('c')!.x;
    };
    const geographic = spread(0);
    const compact = spread(1);
    expect(compact).toBeLessThan(geographic / 10);
    // Fully compact: the outlier sits one cell (box + gap) past its neighbour.
    expect(compact).toBeCloseTo(BOX.width + 40);
    // In between, monotone.
    expect(spread(0.5)).toBeLessThan(geographic);
    expect(spread(0.5)).toBeGreaterThan(compact);
  });

  it('lays out items sharing an anchor side by side, in input order', () => {
    const items = [item('hv', 5, 5), item('mv', 5, 5), item('other', 6, 7)];
    const out = arrangeByAnchors(items, { gap: 40 });
    const hv = out.get('hv')!;
    const mv = out.get('mv')!;
    expect(mv.y).toBeCloseTo(hv.y);
    expect(mv.x - hv.x).toBeCloseTo(BOX.width + 40);
    expect(anyCollision(rectsOf(items, out), 40)).toBe(false);
  });

  it('is deterministic', () => {
    const r = rng(3);
    const items = Array.from({ length: 30 }, (_, i) => item(`n${i}`, r(), r()));
    expect(arrangeByAnchors(items)).toEqual(arrangeByAnchors(items));
  });

  it('handles one item and none', () => {
    expect(arrangeByAnchors([])).toEqual(new Map());
    expect(arrangeByAnchors([item('solo', 12, 34)])).toEqual(new Map([['solo', { x: 0, y: 0 }]]));
  });
});
