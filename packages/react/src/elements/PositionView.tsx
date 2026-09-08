import { useMemo, useState } from 'react';
import type { Position, PositionGeometry, ElementFormat } from '@sld-kit/core';
import { SLD_LAYOUT } from '@sld-kit/core';
import { DEFAULT_POSITION_TOKENS, type PositionTokens } from '../labels';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

export interface PositionViewProps {
  pos: Position;
  geo: PositionGeometry;
  selected?: boolean;
  interactive?: boolean;
  /** Dimmed while being dragged (the ghost shows the target slot). */
  dragging?: boolean;
  /**
   * Local flip (deg) applied to the label about the box center. 0 in the single
   * editor; the composite passes 0 or 180 so a rotated diagram's names stay
   * aligned with the boxes yet never read upside-down (see CompositeLayoutEngine).
   */
  labelAngleDeg?: number;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  tokens?: PositionTokens;
  /**
   * Overrides the type token with a caller-supplied color class (e.g. a
   * voltage bucket). The class must set `--sld-pos`; the view stays agnostic
   * about what it means.
   */
  colorClass?: string | null;
  /** Hide the position's inside-box label (e.g. to compact the diagram). */
  showLabel?: boolean;
  /**
   * Orthogonal per-element overlay (e.g. new vs. existing assets): returns an
   * `ElementFormat` (stroke width + fill opacity) layered on top of the
   * type/voltage color. `null` (the default) leaves the box unchanged.
   */
  formatResolver?: FormatResolver | null;
  /** Numeric presentation config (stroke widths, opacities, selection halo). */
  style?: SldViewStyle;
  onSelect?: (detail: { id: string; shiftKey: boolean }) => void;
  onDragStart?: (detail: { id: string; event: React.PointerEvent }) => void;
  onEditLabel?: (detail: { id: string }) => void;
}

/**
 * Draws one `Position` as a rounded, type-colored box with a centred label and
 * an optional dashed selection halo. Emits `onSelect` + `onDragStart` together
 * on pointerdown, and `onEditLabel` on double-click.
 */
export function PositionView({
  pos,
  geo,
  selected = false,
  interactive = true,
  dragging = false,
  labelAngleDeg = 0,
  tokens = DEFAULT_POSITION_TOKENS,
  colorClass = null,
  showLabel = true,
  formatResolver = null,
  style = DEFAULT_VIEW_STYLE,
  onSelect,
  onDragStart,
  onEditLabel
}: PositionViewProps) {
  const [hovered, setHovered] = useState(false);

  const token = colorClass ?? tokens[pos.type];
  const fmt = useMemo<ElementFormat | null>(() => formatResolver?.(pos) ?? null, [formatResolver, pos]);

  const baseAlpha = hovered && interactive ? style.position.hoverFillOpacity : style.position.fillOpacity;
  const fillAlpha = fmt?.fillOpacity != null ? baseAlpha * fmt.fillOpacity : baseAlpha;
  const strokeW = fmt?.strokeWidth ?? style.position.strokeWidth;
  const fontSize = pos.label.length > 13 ? SLD_LAYOUT.labelFontSize - 2 : SLD_LAYOUT.labelFontSize;
  const sel = style.selection;

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.({ id: pos.id, shiftKey: e.shiftKey });
    onDragStart?.({ id: pos.id, event: e });
  }

  return (
    <g
      className={`sld-position ${token ?? ''} transition-transform duration-150 ease-out${
        interactive ? ' cursor-pointer' : ''
      }`}
      opacity={dragging ? style.position.draggingOpacity : 1}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={() => interactive && onEditLabel?.({ id: pos.id })}
    >
      {selected && (
        <rect
          x={geo.rect.x - sel.padding}
          y={geo.rect.y - sel.padding}
          width={geo.rect.width + sel.padding * 2}
          height={geo.rect.height + sel.padding * 2}
          rx={SLD_LAYOUT.positionCornerRadius + 2}
          fill="none"
          className="stroke-primary"
          strokeWidth={sel.strokeWidth}
          strokeDasharray={sel.dashArray}
        />
      )}
      {/* `--sld-pos` holds a complete color here (Tailwind v4 / shadcn tokens),
          so alpha rides on fill-opacity rather than an hsl() alpha slot. */}
      <rect
        x={geo.rect.x}
        y={geo.rect.y}
        width={geo.rect.width}
        height={geo.rect.height}
        rx={SLD_LAYOUT.positionCornerRadius}
        fill="var(--sld-pos)"
        fillOpacity={fillAlpha}
        stroke="var(--sld-pos)"
        strokeWidth={strokeW}
        strokeDasharray={fmt?.dashArray ?? undefined}
      />
      {showLabel && pos.label && (
        <g
          transform={
            labelAngleDeg
              ? `rotate(${labelAngleDeg} ${geo.rect.x + geo.rect.width / 2} ${geo.rect.y + geo.rect.height / 2})`
              : undefined
          }
        >
          <text
            x={geo.rect.x + geo.rect.width / 2}
            y={geo.rect.y + geo.rect.height / 2 + fontSize * 0.35}
            textAnchor="middle"
            fontSize={fontSize}
            fill="var(--sld-pos)"
            className="select-none font-medium"
          >
            {pos.label}
          </text>
        </g>
      )}
    </g>
  );
}
