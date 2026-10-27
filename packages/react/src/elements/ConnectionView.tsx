import { useMemo, useState } from 'react';
import type { Connection, ConnectionGeometry, SldDocument } from '@sld-kit/core';
import { SLD_LAYOUT, arrowheadPath, connectionPath, resolveFormat } from '@sld-kit/core';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
import { SymbolGlyph } from '../composite/SymbolGlyph';

export interface ConnectionViewProps {
  conn: Connection;
  geo: ConnectionGeometry;
  selected?: boolean;
  interactive?: boolean;
  /** Counter-rotation (deg) applied to the label; see PositionView. */
  labelAngleDeg?: number;
  /**
   * Caller-supplied color class (e.g. a voltage bucket) that sets `--sld-pos`.
   * When set, the connection's `currentColor` strokes/arrowheads/dots resolve
   * to that color; otherwise it inherits the neutral slate color.
   */
  colorClass?: string | null;
  /** Hide the connection's (external endpoint) label. */
  showLabel?: boolean;
  /** Per-element overlay (stroke width); see PositionView. */
  formatResolver?: FormatResolver | null;
  /**
   * The document this connection belongs to. Lets core's default open look grey
   * and dash a connection that touches an open position (see `resolveFormat`).
   */
  doc?: SldDocument | null;
  /** Numeric presentation config (stroke widths, hit target, symbol). */
  style?: SldViewStyle;
  /** The pointer entered / left this connection (`SldCanvas` turns it into `onElementHover`). */
  onHover?: (detail: { id: string; hovered: boolean }) => void;
  onSelect?: (detail: { id: string; shiftKey: boolean }) => void;
  onEditLabel?: (detail: { id: string }) => void;
}

/**
 * Draws one `Connection`: the orthogonal path with hop arcs, plus an optional
 * arrowhead, junction dot, asset glyph and label. An invisible fat hit stroke
 * underneath keeps thin lines easy to click.
 *
 * Styling hooks: root class `sld-connection` with `data-hover` / `data-selected`
 * (`"true"` when set). No halo — selection is the heavier stroke.
 */
export function ConnectionView({
  conn,
  geo,
  selected = false,
  interactive = true,
  labelAngleDeg = 0,
  colorClass = null,
  showLabel = true,
  formatResolver = null,
  doc = null,
  style = DEFAULT_VIEW_STYLE,
  onHover,
  onSelect,
  onEditLabel
}: ConnectionViewProps) {
  const [hovered, setHovered] = useState(false);

  // Not memoised: documents mutate in place, so an endpoint position toggling
  // open/closed leaves `conn` the same object. The check is two lookups.
  const fmt = resolveFormat(conn, formatResolver, { doc }) ?? null;

  const baseStrokeW = hovered && interactive ? style.connection.hoverStrokeWidth : style.connection.strokeWidth;
  const strokeW = selected ? style.connection.selectedStrokeWidth : (fmt?.strokeWidth ?? baseStrokeW);
  // A format `stroke` (e.g. grey for a de-energised line) recolours the line and
  // its arrowhead; the selection highlight still wins.
  const lineColor = !selected && fmt?.stroke ? fmt.stroke : 'currentColor';
  const pathD = useMemo(() => connectionPath(geo.points, geo.hops, SLD_LAYOUT.hopRadius), [geo.points, geo.hops]);
  const label =
    conn.from.kind === 'external' ? conn.from.label : conn.to.kind === 'external' ? conn.to.label : conn.label;

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.({ id: conn.id, shiftKey: e.shiftKey });
  }

  return (
    <g
      className={`sld-connection ${colorClass ?? 'text-slate-600 dark:text-slate-300'}${interactive ? ' cursor-pointer' : ''}`}
      style={colorClass ? { color: 'var(--sld-pos)' } : undefined}
      data-hover={hovered && interactive ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => {
        setHovered(true);
        onHover?.({ id: conn.id, hovered: true });
      }}
      onPointerLeave={() => {
        setHovered(false);
        onHover?.({ id: conn.id, hovered: false });
      }}
      onDoubleClick={() => interactive && onEditLabel?.({ id: conn.id })}
    >
      {/* Invisible fat stroke so thin lines are easy to hit. */}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={style.hitStrokeWidth} />
      <path
        d={pathD}
        fill="none"
        stroke={lineColor}
        strokeWidth={strokeW}
        strokeDasharray={fmt?.dashArray ?? undefined}
        className={selected ? 'text-primary' : ''}
      />
      {geo.arrow && <path d={arrowheadPath(geo.arrow.at, geo.arrow.angle, SLD_LAYOUT.arrowSize)} fill={lineColor} />}
      {geo.dot && <circle cx={geo.dot.x} cy={geo.dot.y} r={SLD_LAYOUT.nodeDotRadius} fill="currentColor" />}
      {geo.symbol && <SymbolGlyph symbolKey={geo.symbol.key} box={geo.symbol.box} style={style} />}
      {showLabel && geo.labelAt && label && (
        <g transform={labelAngleDeg ? `rotate(${labelAngleDeg} ${geo.labelAt.at.x} ${geo.labelAt.at.y})` : undefined}>
          <text
            x={geo.labelAt.at.x}
            y={geo.labelAt.at.y}
            textAnchor={geo.labelAt.anchor}
            fontSize={SLD_LAYOUT.labelFontSize}
            className="select-none fill-foreground"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
