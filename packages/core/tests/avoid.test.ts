import { describe, it, expect } from 'vitest';
import { orthogonalPath, polylineHitsAny } from '../src/composite/avoid';
import type { Point, Rect } from '../src';

const start: Point = { x: 0, y: 0 };
const end: Point = { x: 1000, y: 0 };
const route = (obstacles: Rect[]) => {
  const corners = orthogonalPath(start, 0, end, 0, obstacles);
  return corners ? [start, ...corners, end] : null;
};

/** Thirty boxes far from the line (well outside its search window). */
const farAway: Rect[] = Array.from({ length: 30 }, (_, i) => ({
  x: -6000 + (i % 6) * 2000,
  y: 5000 + Math.floor(i / 6) * 600,
  width: 200,
  height: 72
}));

describe('orthogonalPath at scale', () => {
  it('routes around a local blocker exactly as if the far boxes were not there', () => {
    const blocker: Rect = { x: 450, y: -100, width: 100, height: 200 };
    const local = route([blocker]);
    const crowded = route([blocker, ...farAway]);
    expect(local).not.toBeNull();
    expect(crowded).toEqual(local);
    expect(polylineHitsAny(crowded!, [blocker, ...farAway])).toBe(false);
  });

  it('falls back to the whole grid when the way round lies outside the window', () => {
    // A wall of small boxes across the line, with its only gap far below.
    const wall: Rect[] = [];
    for (let y = -4000; y < 5000; y += 200) {
      if (y >= 2800 && y < 3200) continue; // the gap
      wall.push({ x: 480, y, width: 40, height: 210 }); // overlapping: no seams to slip through
    }
    const path = route(wall);
    expect(path).not.toBeNull();
    expect(polylineHitsAny(path!, wall)).toBe(false);
    // It goes through the gap.
    expect(path!.some((p) => p.y >= 2800 && p.y <= 3200)).toBe(true);
  });
});
