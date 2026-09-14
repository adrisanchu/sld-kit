import type { Rect, PositionType } from '@sld-kit/core';
import { SLD_LAYOUT } from '@sld-kit/core';
import { DEFAULT_POSITION_TOKENS, type PositionTokens } from '../labels';

export interface GhostPreviewProps {
  /** The *slot* rect the box would land in. */
  rect: Rect;
  valid?: boolean;
  type?: PositionType;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  tokens?: PositionTokens;
}

/**
 * Translucent snapped preview of the position being placed or dragged.
 * Green-tinted outline when the drop is valid, red when rejected.
 */
export function GhostPreview({
  rect,
  valid = true,
  type = 'line',
  tokens = DEFAULT_POSITION_TOKENS
}: GhostPreviewProps) {
  const token = tokens[type];
  // Box centered in the slot rect, same maths as LayoutEngine.
  const box = {
    x: rect.x + (rect.width - SLD_LAYOUT.positionBoxWidth) / 2,
    y: rect.y + (rect.height - SLD_LAYOUT.positionBoxHeight) / 2,
    width: SLD_LAYOUT.positionBoxWidth,
    height: SLD_LAYOUT.positionBoxHeight
  };

  return (
    <g className={`pointer-events-none ${token ?? ''}`} opacity="0.7">
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={SLD_LAYOUT.positionCornerRadius}
        fill="var(--sld-pos)"
        fillOpacity={0.2}
        stroke={valid ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)'}
        strokeWidth="2"
        strokeDasharray={valid ? undefined : '4 3'}
      />
    </g>
  );
}
