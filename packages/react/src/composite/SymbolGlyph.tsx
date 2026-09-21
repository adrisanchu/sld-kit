import type { Rect } from '@sld-kit/core';
import { createDefaultSymbolRegistry } from '@sld-kit/core';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

/** Shared: the registry is stateless and tiny, so one instance serves every view. */
const symbols = createDefaultSymbolRegistry();

export interface SymbolGlyphProps {
  /** `SymbolRegistry` key, e.g. `external:transformer` / `external:demand`. */
  symbolKey: string;
  /** Target box; the glyph is scaled to fit and centred within it. */
  box: Rect;
  /** Numeric presentation config (symbol stroke width). */
  style?: SldViewStyle;
  /**
   * Paint an opaque backing rect (`fill-background`) under the glyph so it masks
   * whatever line passes beneath. On by default; turn off for glyphs over an
   * already-clear area.
   */
  backing?: boolean;
}

/**
 * Draws a `SymbolRegistry` glyph scaled into `box`, over an optional opaque
 * backing rect. Strokes with `currentColor`, so the parent `<g>` sets the colour
 * (voltage class or the neutral connection colour). Shared by `ConnectionView`
 * (external asset glyphs) and the composite line adornments (transformer circles,
 * demand triangle) so both render through one code path.
 */
export function SymbolGlyph({ symbolKey, box, style = DEFAULT_VIEW_STYLE, backing = true }: SymbolGlyphProps) {
  const def = symbols.get(symbolKey);
  if (!def) return null;
  const scale = Math.min(box.width / def.size[0], box.height / def.size[1]);
  return (
    <>
      {backing && (
        <rect x={box.x} y={box.y} width={box.width} height={box.height} className="fill-background" />
      )}
      <g transform={`translate(${box.x} ${box.y}) scale(${scale})`} stroke="currentColor" fill="none">
        {def.shapes.map((shape, i) =>
          shape.type === 'path' ? (
            <path
              key={i}
              d={shape.d}
              fill={shape.fill === 'token' ? 'currentColor' : 'none'}
              strokeWidth={shape.strokeWidth ?? style.symbol.strokeWidth}
            />
          ) : shape.type === 'circle' ? (
            <circle
              key={i}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              fill={shape.fill === 'token' ? 'currentColor' : 'none'}
              strokeWidth={shape.strokeWidth ?? style.symbol.strokeWidth}
            />
          ) : (
            <line
              key={i}
              x1={shape.x1}
              y1={shape.y1}
              x2={shape.x2}
              y2={shape.y2}
              strokeWidth={shape.strokeWidth ?? style.symbol.strokeWidth}
            />
          )
        )}
      </g>
    </>
  );
}
