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
 * Spacing between the mid-line jogs of parallel orthogonal routes that join the
 * same two box sides (a bundle): each takes its own lane, centred on the
 * midpoint, instead of all bending on one shared line.
 */
export const PARALLEL_LANE_SPACING = 16;

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

/**
 * Staggered hanging ties: when labels on a crowded box side would collide, the
 * collision pass lengthens leads by this much per row (a label's height plus
 * a little air), up to this many rows, so neighbouring labels sit at different
 * heights.
 */
export const HANGING_STAGGER_STEP = 18;
export const HANGING_STAGGER_ROWS = 4;

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

/** A line's own name (`CompositeLine.name`): font size, world units — a peer of the feeder labels. */
export const LINE_NAME_FONT_SIZE = 12;

/** Gap between a line's stroke and the nearest edge of its name. */
export const LINE_NAME_OFFSET = 6;

/** Where `start` / `middle` / `end` sit along a line, as a fraction of its arc length in reading order. */
export const LINE_NAME_ALONG_FRACTION = { start: 0.2, middle: 0.5, end: 0.8 } as const;

/** A line name is never wider than this share of its longest straight run (bends ignored). */
export const LINE_NAME_MAX_LINE_FRACTION = 0.9;

/**
 * Floor of the fit-to-line shrink, as a share of the normal size: below it a
 * name on a very short line stops shrinking and overhangs its line instead of
 * becoming unreadable.
 */
export const LINE_NAME_MIN_SCALE = 0.5;

/**
 * A callout's leader (a line text set away from its line, see `TextLeader`):
 * a thin, muted stroke, with a small dot on the line it belongs to.
 */
export const LEADER_STROKE_WIDTH = 0.75;
export const LEADER_OPACITY = 0.6;
export const LEADER_DOT_RADIUS = 1.75;
