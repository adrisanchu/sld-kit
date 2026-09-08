import { useMemo, useState } from 'react';
import type { BusBar, BusBarGeometry, ElementFormat } from '@sld-kit/core';
import { SLD_LAYOUT } from '@sld-kit/core';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

export interface BusBarViewProps {
  bar: BusBar;
  geo: BusBarGeometry;
  selected?: boolean;
  interactive?: boolean;
  /** Counter-rotation (deg) applied to the label; see PositionView. */
  labelAngleDeg?: number;
  /**
   * Caller-supplied color class (e.g. a voltage bucket) that sets `--sld-pos`.
   * When set, the bar's `currentColor` fills resolve to that color; otherwise
   * it inherits the neutral foreground.
   */
  colorClass?: string | null;
  /** Hide the bar's label (e.g. to compact the diagram). */
  showLabel?: boolean;
  /** Per-element overlay (stroke width + fill opacity); see PositionView. */
  formatResolver?: FormatResolver | null;
  /** Numeric presentation config (opacities, selection halo). */
  style?: SldViewStyle;
  onSelect?: (detail: { id: string; shiftKey: boolean }) => void;
  onEditLabel?: (detail: { id: string }) => void;
}

/**
 * Draws one `BusBar` as a thick filled bar spanning its row, with a bold label
 * at the left overhang. Paints via `currentColor` so a `colorClass` can retint
 * the whole bar. No drag — bus bars occupy a whole row.
 */
export function BusBarView({
  bar,
  geo,
  selected = false,
  interactive = true,
  labelAngleDeg = 0,
  colorClass = null,
  showLabel = true,
  formatResolver = null,
  style = DEFAULT_VIEW_STYLE,
  onSelect,
  onEditLabel
}: BusBarViewProps) {
  const [hovered, setHovered] = useState(false);

  const fmt = useMemo<ElementFormat | null>(() => formatResolver?.(bar) ?? null, [formatResolver, bar]);

  const baseOpacity = hovered && interactive ? style.busBar.hoverOpacity : style.busBar.opacity;
  const barOpacity = fmt?.fillOpacity != null ? baseOpacity * fmt.fillOpacity : baseOpacity;
  const sel = style.selection;

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.({ id: bar.id, shiftKey: e.shiftKey });
  }

  return (
    <g
      className={`${colorClass ?? 'text-foreground'}${interactive ? ' cursor-pointer' : ''}`}
      style={colorClass ? { color: 'var(--sld-pos)' } : undefined}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={() => interactive && onEditLabel?.({ id: bar.id })}
    >
      {selected && (
        <rect
          x={geo.rect.x - sel.padding}
          y={geo.rect.y - sel.padding}
          width={geo.rect.width + sel.padding * 2}
          height={geo.rect.height + sel.padding * 2}
          fill="none"
          className="stroke-primary"
          strokeWidth={sel.strokeWidth}
          strokeDasharray={sel.dashArray}
        />
      )}
      <rect
        x={geo.rect.x}
        y={geo.rect.y}
        width={geo.rect.width}
        height={geo.rect.height}
        fill="currentColor"
        opacity={barOpacity}
        stroke={fmt?.strokeWidth != null || fmt?.dashArray != null ? 'currentColor' : undefined}
        strokeWidth={fmt?.strokeWidth}
        strokeDasharray={fmt?.dashArray ?? undefined}
      />
      {showLabel && bar.label && (
        <g transform={labelAngleDeg ? `rotate(${labelAngleDeg} ${geo.labelAt.x} ${geo.labelAt.y})` : undefined}>
          <text
            x={geo.labelAt.x}
            y={geo.labelAt.y}
            textAnchor="start"
            fontSize={SLD_LAYOUT.busLabelFontSize}
            fontWeight="600"
            fill="currentColor"
            className="select-none"
          >
            {bar.label}
          </text>
        </g>
      )}
    </g>
  );
}
