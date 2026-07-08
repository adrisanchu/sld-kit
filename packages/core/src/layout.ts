/**
 * Fixed spacing constants used by the LayoutEngine to map matrix slots to
 * pixels. The persisted document never stores pixel coordinates — tweaking
 * these values restyles every diagram, exactly like Mermaid decouples
 * content from layout. All values in SVG user units (px at scale 1).
 *
 * This is framework-agnostic geometry, injectable everywhere: `LayoutEngine`
 * and the exporters take a `SldLayoutConfig` defaulting to `SLD_LAYOUT`.
 */
export const SLD_LAYOUT = {
  /**
   * Outer padding — must cover everything an external connection draws
   * beyond a position box on the outer rows: stem (52) + arrowhead (10)
   * + label line (~16), minus the box's inset inside its cell (15).
   */
  margin: 90,
  /** Slot dimensions. Positions are centered inside their slot. */
  cellWidth: 120,
  cellHeight: 90,
  /** Gaps between adjacent slots. */
  cellGapX: 24,
  cellGapY: 44,
  /** Rows occupied by a bus bar are shorter than position rows. */
  busBarRowHeight: 28,
  busBarThickness: 6,
  /** Bus bars extend past the outer columns by this much on each side. */
  busBarOverhang: 30,
  /** Position box drawn centered inside its slot. */
  positionBoxWidth: 96,
  positionBoxHeight: 60,
  positionCornerRadius: 6,
  /** External connections: stem length beyond the position edge + arrowhead. */
  externalStemLength: 52,
  arrowSize: 10,
  /** Radius of the junction dot marking a virtual node (3-way tap). */
  nodeDotRadius: 3.5,
  /**
   * Double-busbar taps: when a bay wires to more than one bar, the nearest bar
   * keeps the straight trunk and each farther bar branches off a junction node
   * (like an external arrow) into its own lane. Horizontal step per extra bar.
   */
  barTapOffset: 16,
  /** Square box size for external asset glyphs (transformer, renewable…). */
  symbolSize: 22,
  fontFamily: 'Arial, Helvetica, sans-serif',
  labelFontSize: 12,
  busLabelFontSize: 13
} as const;

/**
 * The injectable layout config. `SLD_LAYOUT` is declared `as const` so its
 * default values are self-documenting, but the config type is *widened* (each
 * numeric field to `number`, the font stack to `string`) so consumers can pass
 * a tweaked config — `{ ...SLD_LAYOUT, cellWidth: 160 }` — without type casts.
 */
export type SldLayoutConfig = {
  -readonly [K in keyof typeof SLD_LAYOUT]: (typeof SLD_LAYOUT)[K] extends number ? number : string;
};
