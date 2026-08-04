/**
 * Presentation theme for SVG export. The core is headless: no colors are
 * baked into layout or geometry. The exporters resolve every fill/stroke
 * against a `SldTheme`, and `DEFAULT_THEME` reproduces the original palette
 * so an export with no `theme` option is byte-for-byte the historical output.
 *
 * Colors are literal presentation attributes (no CSS variables, classes or
 * `currentColor`) because Office/PowerPoint importers only understand plain
 * attributes. Live-view theming (dark mode, CSS custom properties) is a
 * consumer concern and lives outside this package.
 */

import type { SldElement } from './elements/Element';

export interface PositionTypeColors {
  fill: string;
  stroke: string;
  text: string;
}

/**
 * A generic, domain-agnostic formatting overlay applied *on top of* an element's
 * per-type fill. Every field is optional and every field is an office-safe
 * presentation attribute (`stroke-width`, `stroke-dasharray`, `fill-opacity`,
 * `fill`), so it composes without breaking SVG export. Absent fields leave the
 * existing value untouched.
 *
 * The core never decides *when* to apply one — a consumer supplies a
 * `resolveElementFormat` that inspects whatever it wants (an element's `data`,
 * e.g. a commissioning date/category) and returns this. That keeps the styling
 * policy in the consuming package and the core free of domain concepts.
 */
export interface ElementFormat {
  strokeWidth?: number;
  fillOpacity?: number;
  fill?: string;
  /** `stroke-dasharray` value (e.g. `'6 3'`) for the border/line. Absent → solid. */
  dashArray?: string;
}

export interface SldTheme {
  /**
   * Colors keyed by (open) `PositionType` string. A position whose type has
   * no entry here falls back to `fallbackPositionType`.
   */
  positionTypes: Record<string, PositionTypeColors>;
  /** Used when a position's type has no entry in `positionTypes`. */
  fallbackPositionType: PositionTypeColors;
  /** Structural colors: bars, connection stems, labels, canvas background. */
  structure: {
    busbar: string;
    connection: string;
    label: string;
    background: string;
    /** Base stroke width of a position box (before any per-element overlay). */
    positionStrokeWidth: number;
    /** Base stroke width of a connection / manual composite line. */
    connectionStrokeWidth: number;
  };
  /**
   * The single, property-agnostic styling seam (ADR 0001 D1): style any element
   * by anything the consumer wants — a `data` field, a CIM class, a commissioning
   * date — by returning an `ElementFormat`. The core never reads `data` itself.
   * Absent (as in `DEFAULT_THEME`) → no overlay, output unchanged.
   */
  resolveElementFormat?: (el: SldElement) => ElementFormat | undefined;
}

/**
 * The default light theme. Values are exactly the historical `EXPORT_COLORS`
 * + `EXPORT_STRUCTURE_COLORS`, so default exports match legacy output. The
 * fallback palette is the neutral `reserve` slate — an unknown position type
 * renders legibly instead of crashing.
 */
export const DEFAULT_THEME: SldTheme = {
  positionTypes: {
    line: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e3a8a' },
    transformer: { fill: '#fef3c7', stroke: '#f59e0b', text: '#78350f' },
    central: { fill: '#ede9fe', stroke: '#8b5cf6', text: '#4c1d95' },
    renewable: { fill: '#dcfce7', stroke: '#22c55e', text: '#14532d' },
    reserve: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' },
    // Storage (battery): teal — distinct from renewable green.
    storage: { fill: '#ccfbf1', stroke: '#14b8a6', text: '#134e4a' },
    // Demand (consumer/load): red.
    demand: { fill: '#fee2e2', stroke: '#ef4444', text: '#7f1d1d' }
  },
  fallbackPositionType: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' },
  structure: {
    busbar: '#0f172a',
    connection: '#334155',
    label: '#0f172a',
    background: '#ffffff',
    positionStrokeWidth: 1.5,
    connectionStrokeWidth: 2
  }
};

/**
 * Resolve the colors for a position `type` against a theme, falling back to
 * the theme's `fallbackPositionType` when the type is unknown.
 */
export function positionColors(theme: SldTheme, type: string): PositionTypeColors {
  return theme.positionTypes[type] ?? theme.fallbackPositionType;
}

/**
 * Resolve an element's formatting overlay against a theme — simply the theme's
 * `resolveElementFormat` applied to the element (or `undefined` when the theme
 * defines none, leaving the element's default attributes untouched).
 */
export function elementFormat(theme: SldTheme, el: SldElement): ElementFormat | undefined {
  return theme.resolveElementFormat?.(el);
}

/**
 * The first `ElementFormat` a resolver produces across `elements`, or `undefined`.
 * Used for composite tie-lines, which are backed by more than one underlying
 * connection (both ends share the id): styling the tie-line = the first backing
 * connection the consumer's resolver formats, so tagging *either* diagram is
 * enough — with zero domain knowledge in the core.
 */
export function firstFormat(
  elements: SldElement[],
  resolve?: (el: SldElement) => ElementFormat | null | undefined
): ElementFormat | undefined {
  if (!resolve) return undefined;
  for (const el of elements) {
    const fmt = resolve(el);
    if (fmt) return fmt;
  }
  return undefined;
}

/**
 * Deep-merge a partial theme over `DEFAULT_THEME`. `positionTypes` entries are
 * merged by key (a partial override of one type keeps the default's other
 * types); `structure` and `fallbackPositionType` are shallow-merged.
 */
export function resolveTheme(theme?: Partial<SldTheme>): SldTheme {
  if (!theme) return DEFAULT_THEME;
  return {
    positionTypes: { ...DEFAULT_THEME.positionTypes, ...theme.positionTypes },
    fallbackPositionType: { ...DEFAULT_THEME.fallbackPositionType, ...theme.fallbackPositionType },
    structure: { ...DEFAULT_THEME.structure, ...theme.structure },
    ...(theme.resolveElementFormat !== undefined ? { resolveElementFormat: theme.resolveElementFormat } : {})
  };
}
