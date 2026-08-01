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
import { getCommissioning } from './data';

export interface PositionTypeColors {
  fill: string;
  stroke: string;
  text: string;
}

/**
 * An orthogonal formatting overlay applied *on top of* an element's per-type
 * fill — the "commissioning" axis (new vs. existing assets). Every field is
 * optional and every field is an office-safe presentation attribute
 * (`stroke-width`, `fill-opacity`, `fill`), so it composes without breaking
 * SVG export. Absent fields leave the existing value untouched.
 */
export interface ElementFormat {
  strokeWidth?: number;
  fillOpacity?: number;
  fill?: string;
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
  };
  /**
   * Optional commissioning overlay: maps an element's `data.sld.commissioning`
   * category to an `ElementFormat` (open-string keys + `fallback`, like
   * `positionTypes`). Absent (as in `DEFAULT_THEME`) → no overlay, output
   * unchanged.
   */
  commissioning?: {
    categories?: Record<string, ElementFormat>;
    fallback?: ElementFormat;
  };
  /**
   * Property-agnostic escape hatch (generalizes ADR 0001 D1 from color to full
   * formatting): style any element by anything — e.g. bucket by commissioning
   * *date* instead of category. When present it wins over `commissioning`.
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
    background: '#ffffff'
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
 * Resolve the commissioning formatting overlay for an element against a theme.
 * A custom `resolveElementFormat` wins; otherwise the element's
 * `data.sld.commissioning.category` is looked up in `theme.commissioning`
 * (falling back to `commissioning.fallback`). Returns `undefined` when nothing
 * applies — the caller then leaves the element's default attributes untouched.
 */
export function elementFormat(theme: SldTheme, el: SldElement): ElementFormat | undefined {
  if (theme.resolveElementFormat) return theme.resolveElementFormat(el);
  const category = getCommissioning(el)?.category;
  if (!category || !theme.commissioning) return undefined;
  return theme.commissioning.categories?.[category] ?? theme.commissioning.fallback;
}

/**
 * Build a `resolveElementFormat` from a category → format map, so the same
 * config drives both SVG export (as `theme.commissioning`) and the live Svelte
 * views (as a `formatResolver` prop). Reads `data.sld.commissioning.category`.
 */
export function makeCommissioningResolver(
  categories: Record<string, ElementFormat>,
  fallback?: ElementFormat
): (el: SldElement) => ElementFormat | undefined {
  return (el) => {
    const category = getCommissioning(el)?.category;
    if (!category) return undefined;
    return categories[category] ?? fallback;
  };
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
    ...(theme.commissioning !== undefined ? { commissioning: theme.commissioning } : {}),
    ...(theme.resolveElementFormat !== undefined ? { resolveElementFormat: theme.resolveElementFormat } : {})
  };
}
