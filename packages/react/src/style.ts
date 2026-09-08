/**
 * Numeric presentation config for the live React views — the stroke widths,
 * opacities, selection-halo geometry and composite handle sizes that were
 * previously hardcoded inline in each element view. Colors stay in CSS
 * (`--sld-pos`, Tailwind classes) as before; this config is only the numbers.
 *
 * It is the live-view sibling of core's `SldTheme` (which governs SVG export):
 * inject a partial via each canvas's `style` prop and it deep-merges over
 * `DEFAULT_VIEW_STYLE`, so the defaults reproduce today's look byte-for-byte
 * until a consumer overrides something.
 *
 * Base render widths intentionally match core `SldTheme.structure`
 * (`positionStrokeWidth` 1.5, `connectionStrokeWidth` 2) so screen and export
 * agree; override both together to keep them in sync.
 */
export interface SldViewStyle {
  /** Position box. */
  position: {
    /** Base border width (a commissioning `ElementFormat` may override per-element). */
    strokeWidth: number;
    /** Fill alpha at rest / on hover. */
    fillOpacity: number;
    hoverFillOpacity: number;
    /** Opacity of a box while it is being dragged (the ghost shows the target). */
    draggingOpacity: number;
  };
  /** Bus bar. */
  busBar: {
    opacity: number;
    hoverOpacity: number;
  };
  /** Connection stroke widths by state. */
  connection: {
    strokeWidth: number;
    hoverStrokeWidth: number;
    selectedStrokeWidth: number;
  };
  /** Registry glyph (breaker, transformer, …) stroke width. */
  symbol: {
    strokeWidth: number;
  };
  /** Selection halo drawn around a selected element. */
  selection: {
    /** Inset/outset of the halo from the element rect, in px. */
    padding: number;
    strokeWidth: number;
    dashArray: string;
  };
  /** Width of the invisible fat stroke that makes thin lines easy to click. */
  hitStrokeWidth: number;
  /** Composite ("diagram of diagrams") canvas chrome. */
  composite: {
    /** Inter-diagram auto-links (dashed). */
    linkStrokeWidth: number;
    linkDashArray: string;
    /** Manual lines, at rest / selected. */
    lineStrokeWidth: number;
    lineSelectedStrokeWidth: number;
    /** Draggable bend vertex + hollow "add bend" handles. */
    vertexHandleRadius: number;
    addHandleRadius: number;
    handleStrokeWidth: number;
    addHandleDashArray: string;
    /** Snap target markers shown while drawing. */
    snapHandleRadius: number;
    /** In-progress polyline while drawing. */
    draftStrokeWidth: number;
    draftDashArray: string;
    draftPointRadius: number;
  };
}

/** Today's inline constants, extracted verbatim. */
export const DEFAULT_VIEW_STYLE: SldViewStyle = {
  position: { strokeWidth: 1.5, fillOpacity: 0.15, hoverFillOpacity: 0.3, draggingOpacity: 0.4 },
  busBar: { opacity: 1, hoverOpacity: 0.75 },
  connection: { strokeWidth: 2, hoverStrokeWidth: 2.5, selectedStrokeWidth: 3 },
  symbol: { strokeWidth: 1.6 },
  selection: { padding: 4, strokeWidth: 1.5, dashArray: '5 3' },
  hitStrokeWidth: 12,
  composite: {
    linkStrokeWidth: 2,
    linkDashArray: '6 4',
    lineStrokeWidth: 2,
    lineSelectedStrokeWidth: 3,
    vertexHandleRadius: 5,
    addHandleRadius: 4,
    handleStrokeWidth: 1.5,
    addHandleDashArray: '2 2',
    snapHandleRadius: 5,
    draftStrokeWidth: 2,
    draftDashArray: '4 4',
    draftPointRadius: 4
  }
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Deep-merge a partial view style over `DEFAULT_VIEW_STYLE` (one group at a
 * time, like core's `resolveTheme`). Pass the result to a canvas's `style` prop.
 */
export function resolveViewStyle(style?: DeepPartial<SldViewStyle>): SldViewStyle {
  if (!style) return DEFAULT_VIEW_STYLE;
  return {
    position: { ...DEFAULT_VIEW_STYLE.position, ...style.position },
    busBar: { ...DEFAULT_VIEW_STYLE.busBar, ...style.busBar },
    connection: { ...DEFAULT_VIEW_STYLE.connection, ...style.connection },
    symbol: { ...DEFAULT_VIEW_STYLE.symbol, ...style.symbol },
    selection: { ...DEFAULT_VIEW_STYLE.selection, ...style.selection },
    hitStrokeWidth: style.hitStrokeWidth ?? DEFAULT_VIEW_STYLE.hitStrokeWidth,
    composite: { ...DEFAULT_VIEW_STYLE.composite, ...style.composite }
  };
}
