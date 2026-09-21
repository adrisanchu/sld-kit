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

/** How far a demand's dangling lead hangs off its feeder, node-relative. */
export const DEMAND_LEAD_LENGTH = 64;

/** Dashed stroke for `cable` lines — shared by the exporter and both routers. */
export const CABLE_DASH_ARRAY = '6 4';

/** `SymbolRegistry` keys the line adornments render through. */
export const TRANSFORMER_SYMBOL = 'external:transformer';
export const DEMAND_SYMBOL = 'external:demand';
