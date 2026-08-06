import { describe, it, expect } from 'vitest';
import { chordFrame } from '../src';

describe('chordFrame', () => {
  it('round-trips world → rel → world', () => {
    const frame = chordFrame({ x: 10, y: 20 }, { x: 110, y: 20 })!; // horizontal chord, length 100
    const p = { x: 60, y: 70 };
    const rel = frame.toRel(p);
    expect(rel.t).toBeCloseTo(0.5, 9); // halfway along the chord
    expect(rel.ox).toBeCloseTo(0, 9); // no along-chord residual at the midpoint
    expect(rel.oy).toBeCloseTo(50, 9); // frozen world offset, in pixels (not scaled)
    const back = frame.toWorld(rel);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('translates (never rotates) a bend when one endpoint moves', () => {
    // bend (30,40) on chord (0,0)→(100,0): t=0.3, offset (0,40).
    const rel = chordFrame({ x: 0, y: 0 }, { x: 100, y: 0 })!.toRel({ x: 30, y: 40 });
    expect(rel.t).toBeCloseTo(0.3, 9);
    // Move B up to (100,100): the bend shifts by t·ΔB = (0,30) → (30,70), no swing.
    const moved = chordFrame({ x: 0, y: 0 }, { x: 100, y: 100 })!.toWorld(rel);
    expect(moved.x).toBeCloseTo(30, 9);
    expect(moved.y).toBeCloseTo(70, 9);
  });

  it('translates the whole line rigidly when both endpoints share a delta', () => {
    const rel = chordFrame({ x: 0, y: 0 }, { x: 100, y: 0 })!.toRel({ x: 30, y: 40 });
    // Shift both endpoints by (25,-10): the bend must shift by exactly the same.
    const moved = chordFrame({ x: 25, y: -10 }, { x: 125, y: -10 })!.toWorld(rel);
    expect(moved.x).toBeCloseTo(55, 9);
    expect(moved.y).toBeCloseTo(30, 9);
  });

  it('returns null for a degenerate (zero-length) chord', () => {
    expect(chordFrame({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });
});
