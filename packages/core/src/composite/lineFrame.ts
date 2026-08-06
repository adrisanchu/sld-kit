import type { Point } from '../layout/geometry';

/**
 * A free bend's coordinates against a line's anchor chord `a → b`:
 * a fraction `t` along the chord plus a fixed world-space offset `(ox, oy)`.
 */
export interface RelCoord {
  /** Fraction along the chord `a → b` (0 at `a`, 1 at `b`); may fall outside [0,1]. */
  t: number;
  /** World-space x offset from the chord point at `t` — frozen, never rotated. */
  ox: number;
  /** World-space y offset from the chord point at `t` — frozen, never rotated. */
  oy: number;
}

/**
 * A frame spanned by a line's two anchor tips `a → b`, used to store free bends
 * relative to those endpoints so they follow the endpoints instead of being
 * restated in absolute pixels.
 *
 * A bend is `chordPoint(t) + (ox, oy)` where `chordPoint(t) = a + t·(b - a)`.
 * The offset is kept in **world space**, deliberately *not* rotated or scaled
 * with the chord. That makes resolution a pure translation blend:
 *
 *   bend_new = bend_old + (1 - t)·Δa + t·Δb
 *
 * so when one endpoint moves the bend translates by a `t`-weighted share of that
 * motion — it never swings around the chord the way a similarity (rotate+scale)
 * mapping would. Moving both endpoints by the same delta translates the whole
 * line rigidly; the along-chord `t` still lets bends spread as the gap grows.
 */
export interface ChordFrame {
  toRel(p: Point): RelCoord;
  toWorld(c: RelCoord): Point;
}

/**
 * Build the chord frame for `a → b`, or `null` when the endpoints coincide
 * (`|d| ≈ 0`) and no stable frame exists — callers fall back to absolute bends.
 */
export function chordFrame(a: Point, b: Point): ChordFrame | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return null;
  return {
    toRel(p: Point): RelCoord {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      return { t, ox: p.x - (a.x + t * dx), oy: p.y - (a.y + t * dy) };
    },
    toWorld(c: RelCoord): Point {
      return { x: a.x + c.t * dx + c.ox, y: a.y + c.t * dy + c.oy };
    }
  };
}
