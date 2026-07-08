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

export interface PositionTypeColors {
  fill: string;
  stroke: string;
  text: string;
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
    reserve: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' }
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
 * Deep-merge a partial theme over `DEFAULT_THEME`. `positionTypes` entries are
 * merged by key (a partial override of one type keeps the default's other
 * types); `structure` and `fallbackPositionType` are shallow-merged.
 */
export function resolveTheme(theme?: Partial<SldTheme>): SldTheme {
  if (!theme) return DEFAULT_THEME;
  return {
    positionTypes: { ...DEFAULT_THEME.positionTypes, ...theme.positionTypes },
    fallbackPositionType: { ...DEFAULT_THEME.fallbackPositionType, ...theme.fallbackPositionType },
    structure: { ...DEFAULT_THEME.structure, ...theme.structure }
  };
}
