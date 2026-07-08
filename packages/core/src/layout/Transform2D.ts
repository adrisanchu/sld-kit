import type { Point, Rect } from './geometry';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rigid-body transform used to place a whole diagram inside a composite:
 * rotate `angleDeg` about `pivot` (the child's local rotation center), then
 * translate by (x, y). It maps a child's local coordinates into the composite
 * canvas, and back for hit testing.
 *
 * The SVG string produced by `toSvgTransform()` is the single source of truth
 * for both the live `<g transform>` and the SVG export, so a child renders
 * identically in both — the same guarantee the single-diagram editor gets from
 * sharing `LayoutEngine`.
 */
export class Transform2D {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly angleDeg: number,
    /** Child-local rotation center, typically the layout size / 2. */
    public readonly pivot: Point
  ) {}

  /** Child-local point → composite coordinates. */
  apply(p: Point): Point {
    const a = (this.angleDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const dx = p.x - this.pivot.x;
    const dy = p.y - this.pivot.y;
    return {
      x: this.pivot.x + dx * cos - dy * sin + this.x,
      y: this.pivot.y + dx * sin + dy * cos + this.y
    };
  }

  /** Composite point → child-local coordinates (inverse of `apply`). */
  invert(p: Point): Point {
    const a = (-this.angleDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const dx = p.x - this.x - this.pivot.x;
    const dy = p.y - this.y - this.pivot.y;
    return {
      x: this.pivot.x + dx * cos - dy * sin,
      y: this.pivot.y + dx * sin + dy * cos
    };
  }

  /** The 4 transformed corners of a rect, clockwise from top-left. */
  applyRect(r: Rect): Point[] {
    return [
      this.apply({ x: r.x, y: r.y }),
      this.apply({ x: r.x + r.width, y: r.y }),
      this.apply({ x: r.x + r.width, y: r.y + r.height }),
      this.apply({ x: r.x, y: r.y + r.height })
    ];
  }

  /** Axis-aligned bounding box of the rotated rect. */
  boundsOf(r: Rect): Rect {
    const pts = this.applyRect(r);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
  }

  /** SVG transform string shared by the live view and the export. */
  toSvgTransform(): string {
    return `translate(${round2(this.x)} ${round2(this.y)}) rotate(${round2(this.angleDeg)} ${round2(
      this.pivot.x
    )} ${round2(this.pivot.y)})`;
  }
}
