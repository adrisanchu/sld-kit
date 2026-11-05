/**
 * Tunable geometry for the floating-connector box router, plus the shared line
 * presentation constants. Every magic number the box router leans on lives here,
 * so the box view can be re-proportioned in one place (mirroring how the
 * single-diagram engine keeps its layout knobs in `SLD_LAYOUT`).
 */

/** How far a line leaves a port perpendicular to its edge before it may turn. */
export const STUB_LENGTH = 24;

/**
 * Facing ports whose perpendicular offset is within this many px are treated as
 * aligned and drawn as a single straight trunk (the far end is nudged along its
 * box edge to match). Absorbs the few-px centre mismatch between adjacent boxes
 * of slightly different widths, so a grid column reads as a clean vertical.
 */
export const ALIGN_TOLERANCE = 8;

/**
 * How far the obstacle-avoiding router keeps a line off every child box. Kept
 * below {@link STUB_LENGTH} so a port's exit stub always ends outside its own
 * (inflated) box — the box then stays an obstacle and a route never doubles
 * back through it.
 */
export const OBSTACLE_CLEARANCE = 12;

/**
 * Cost of one extra bend in the obstacle-avoiding search, in px of route length.
 * High enough that the router prefers a slightly longer run to an extra jog.
 */
export const BEND_PENALTY = 48;

/** Corner radius of a `curved` line's rounded bends (`cornerRadius` engine option). */
export const CURVE_RADIUS = 12;

/**
 * Jogs shorter than this (a small sideways step between two parallel runs) are
 * straightened away by the auto router when the run beside them can slide onto
 * the other run's line without touching a box. Two corner radii: below it a
 * `curved` jog can't fit two full arcs.
 */
export const MIN_JOG = 2 * CURVE_RADIUS;

/**
 * Uniform box-view frame. Every box in box mode gets this size regardless of how
 * many feeders its child has, so grid-aligned boxes produce exactly straight
 * ties (matching the reference drawings). Pass `boxSize: null` to the
 * `CompositeLayoutEngine` to fall back to the content-derived compact frame.
 */
export const BOX_SIZE = { width: 200, height: 72 } as const;

/** How far a demand's dangling lead hangs off its feeder, node-relative. */
export const DEMAND_LEAD_LENGTH = 64;

/**
 * External assets that **end at** a diagram (a generator, a storage, a load, a
 * reactor, a synchronous machine) rather than tie it to another node. In box
 * view each one a child carries is drawn leaving its box (a lead, the asset's
 * glyph and the feeder label) unless a line or an auto-link already takes it.
 * Lines and transformers are ties between nodes: they connect boxes instead.
 */
export const HANGING_ASSETS: readonly string[] = ['renewable', 'storage', 'demand', 'reactor', 'machine'];

/** Gap between a hanging tie's glyph and its label, world units. */
export const HANGING_LABEL_GAP = 4;

/** Dashed stroke for `cable` lines — shared by the exporter and both routers. */
export const CABLE_DASH_ARRAY = '6 4';

/** `SymbolRegistry` keys the line adornments render through. */
export const TRANSFORMER_SYMBOL = 'external:transformer';
export const TRANSFORMER3W_SYMBOL = 'external:transformer3w';
export const DEMAND_SYMBOL = 'external:demand';

/** Numeric line labels (`lineLabels` resolver): font size and row pitch, world units. */
export const LINE_LABEL_FONT_SIZE = 16;
export const LINE_LABEL_LINE_HEIGHT = 19;

/** Gap between a line and the edge of its label block. */
export const LINE_LABEL_OFFSET = 8;

/** Extra gap on `transformer` lines so the label clears the two-circle glyph. */
export const LINE_LABEL_GLYPH_CLEARANCE = 14;

/** Padding of the label's backing box around its text. */
export const LINE_LABEL_PAD = 3;
