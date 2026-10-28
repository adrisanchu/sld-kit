import { useMemo, useState } from 'react';
import type { BusBar, BusBarGeometry, ElementFormat } from '@sld-kit/core';
import { SLD_LAYOUT } from '@sld-kit/core';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
import { Halo } from './Halo';
import type { FrameCorners } from '../composite/frameGeometry';

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
  /**
   * Also draw the halo while hovered (`data-state="hover"`, faded). Default
   * `false`: hover only changes the opacity / stroke width, as before.
   */
  hoverHalo?: boolean;
  /** Corner brackets on the halo (`brackets`); `none` (default) draws plain dashes. */
  haloCorners?: FrameCorners;
  /** The pointer entered / left this element (`SldCanvas` turns it into `onElementHover`). */
  onHover?: (detail: { id: string; hovered: boolean }) => void;
  /**
   * Widen the bar's hit area by this many px on every side (an invisible rect):
   * bars are thin, so a little slop makes them easier to hover and pick. Default 0.
   */
  hitSlop?: number;
  onSelect?: (detail: { id: string; shiftKey: boolean }) => void;
  onEditLabel?: (detail: { id: string }) => void;
}

/**
 * Draws one `BusBar` as a thick filled bar spanning its row, with a bold label
 * at the left overhang. Paints via `currentColor` so a `colorClass` can retint
 * the whole bar. No drag — bus bars occupy a whole row.
 *
 * Styling hooks: root class `sld-busbar` with `data-hover` / `data-selected`
 * (`"true"` when set), and the halo's `sld-halo` (see `Halo`).
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
  hoverHalo = false,
  haloCorners = 'none',
  hitSlop = 0,
  onHover,
  onSelect,
  onEditLabel
}: BusBarViewProps) {
  const [hovered, setHovered] = useState(false);

  const fmt = useMemo<ElementFormat | null>(() => formatResolver?.(bar) ?? null, [formatResolver, bar]);

  const baseOpacity = hovered && interactive ? style.busBar.hoverOpacity : style.busBar.opacity;
  const barOpacity = fmt?.fillOpacity != null ? baseOpacity * fmt.fillOpacity : baseOpacity;

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.({ id: bar.id, shiftKey: e.shiftKey });
  }

  return (
    <g
      className={`sld-busbar ${colorClass ?? 'text-foreground'}${interactive ? ' cursor-pointer' : ''}`}
      style={colorClass ? { color: 'var(--sld-pos)' } : undefined}
      data-hover={hovered && interactive ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => {
        setHovered(true);
        onHover?.({ id: bar.id, hovered: true });
      }}
      onPointerLeave={() => {
        setHovered(false);
        onHover?.({ id: bar.id, hovered: false });
      }}
      onDoubleClick={() => interactive && onEditLabel?.({ id: bar.id })}
    >
      {hitSlop > 0 && (
        <rect
          x={geo.rect.x - hitSlop}
          y={geo.rect.y - hitSlop}
          width={geo.rect.width + hitSlop * 2}
          height={geo.rect.height + hitSlop * 2}
          fill="transparent"
        />
      )}
      {(selected || (hoverHalo && hovered && interactive)) && (
        <Halo rect={geo.rect} state={selected ? 'selected' : 'hover'} corners={haloCorners} style={style} />
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
      {showLabel && geo.label && (
        <g transform={labelAngleDeg ? `rotate(${labelAngleDeg} ${geo.labelAt.x} ${geo.labelAt.y})` : undefined}>
          <text
            x={geo.labelAt.x}
            y={geo.labelAt.y}
            textAnchor={geo.textAnchor}
            fontSize={SLD_LAYOUT.busLabelFontSize}
            fontWeight="600"
            fill="currentColor"
            className="select-none"
          >
            {geo.label}
          </text>
        </g>
      )}
    </g>
  );
}
