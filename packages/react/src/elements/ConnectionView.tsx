import { useMemo, useState } from 'react';
import type { Connection, ConnectionGeometry, ElementFormat } from '@sld-kit/core';
import { SLD_LAYOUT, arrowheadPath, connectionPath, createDefaultSymbolRegistry } from '@sld-kit/core';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

/** Shared: the registry is stateless and tiny, so one instance serves every view. */
const symbols = createDefaultSymbolRegistry();

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
  /** Numeric presentation config (stroke widths, hit target, symbol). */
  style?: SldViewStyle;
  onSelect?: (detail: { id: string; shiftKey: boolean }) => void;
  onEditLabel?: (detail: { id: string }) => void;
}

/**
 * Draws one `Connection`: the orthogonal path with hop arcs, plus an optional
 * arrowhead, junction dot, asset glyph and label. An invisible fat hit stroke
 * underneath keeps thin lines easy to click.
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
  style = DEFAULT_VIEW_STYLE,
  onSelect,
  onEditLabel
}: ConnectionViewProps) {
  const [hovered, setHovered] = useState(false);

  const fmt = useMemo<ElementFormat | null>(() => formatResolver?.(conn) ?? null, [formatResolver, conn]);

  const baseStrokeW = hovered && interactive ? style.connection.hoverStrokeWidth : style.connection.strokeWidth;
  const strokeW = selected ? style.connection.selectedStrokeWidth : (fmt?.strokeWidth ?? baseStrokeW);
  const pathD = useMemo(() => connectionPath(geo.points, geo.hops, SLD_LAYOUT.hopRadius), [geo.points, geo.hops]);
  const label =
    conn.from.kind === 'external' ? conn.from.label : conn.to.kind === 'external' ? conn.to.label : conn.label;
  const symbolDef = geo.symbol ? symbols.get(geo.symbol.key) : undefined;
  const symbolScale =
    geo.symbol && symbolDef
      ? Math.min(geo.symbol.box.width / symbolDef.size[0], geo.symbol.box.height / symbolDef.size[1])
      : 1;

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.({ id: conn.id, shiftKey: e.shiftKey });
  }

  return (
    <g
      className={`${colorClass ?? 'text-slate-600 dark:text-slate-300'}${interactive ? ' cursor-pointer' : ''}`}
      style={colorClass ? { color: 'var(--sld-pos)' } : undefined}
      onPointerDown={handlePointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={() => interactive && onEditLabel?.({ id: conn.id })}
    >
      {/* Invisible fat stroke so thin lines are easy to hit. */}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={style.hitStrokeWidth} />
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeW}
        strokeDasharray={fmt?.dashArray ?? undefined}
        className={selected ? 'text-primary' : ''}
      />
      {geo.arrow && <path d={arrowheadPath(geo.arrow.at, geo.arrow.angle, SLD_LAYOUT.arrowSize)} fill="currentColor" />}
      {geo.dot && <circle cx={geo.dot.x} cy={geo.dot.y} r={SLD_LAYOUT.nodeDotRadius} fill="currentColor" />}
      {geo.symbol && symbolDef && (
        <>
          <rect
            x={geo.symbol.box.x}
            y={geo.symbol.box.y}
            width={geo.symbol.box.width}
            height={geo.symbol.box.height}
            className="fill-background"
          />
          <g
            transform={`translate(${geo.symbol.box.x} ${geo.symbol.box.y}) scale(${symbolScale})`}
            stroke="currentColor"
            fill="none"
          >
            {symbolDef.shapes.map((shape, i) =>
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
      )}
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
