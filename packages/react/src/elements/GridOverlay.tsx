import { useMemo } from 'react';
import type { Cell, DiagramLayout } from '@sld-kit/core';

export interface GridOverlayProps {
  layout: DiagramLayout;
  /** Slot currently hovered/targeted by a placement or drag. */
  highlight?: { cell: Cell; valid: boolean } | null;
  /** Destination cells of the displacement chain a drop would cause. */
  chainCells?: Cell[];
  /** Row boundary index highlighted by the bus bar insertion tool. */
  boundaryAt?: number | null;
}

const VALID = 'hsl(142 71% 45%)';
const INVALID = 'hsl(0 72% 51%)';
const CHAIN = 'hsl(38 92% 50%)';

/**
 * Edit-mode overlay: dashed outlines for every free slot, plus a highlighted
 * drop target (green = valid, red = invalid) and the cells a reflow would
 * displace elements into (amber).
 */
export function GridOverlay({ layout, highlight = null, chainCells = [], boundaryAt = null }: GridOverlayProps) {
  const slotRows = useMemo(
    () => Array.from({ length: layout.rows }, (_, r) => r).filter((r) => layout.rowKind(r) === 'slots'),
    [layout]
  );
  const cols = useMemo(() => Array.from({ length: layout.cols }, (_, c) => c), [layout]);

  const isHighlight = (r: number, c: number) =>
    highlight !== null && highlight.cell.row === r && highlight.cell.col === c;
  const isChain = (r: number, c: number) => chainCells.some((cell) => cell.row === r && cell.col === c);

  /**
   * Slot paint. The status colors are literal hsl (they mean valid/invalid/
   * displaced, not a theme role); only the resting stroke reads a shadcn token,
   * which is a whole color here — so its alpha rides on stroke-opacity.
   */
  function paint(r: number, c: number) {
    if (isHighlight(r, c)) {
      const color = highlight?.valid ? VALID : INVALID;
      return { fill: color, fillOpacity: 0.15, stroke: color, strokeOpacity: 1, strokeWidth: 1.5 };
    }
    if (isChain(r, c)) {
      return { fill: CHAIN, fillOpacity: 0.12, stroke: CHAIN, strokeOpacity: 1, strokeWidth: 1.5 };
    }
    return {
      fill: 'none',
      fillOpacity: undefined,
      stroke: 'var(--muted-foreground)',
      strokeOpacity: 0.25,
      strokeWidth: 1
    };
  }

  return (
    <g className="pointer-events-none">
      {slotRows.map((r) =>
        cols.map((c) => {
          const rect = layout.cellRect({ row: r, col: c });
          const p = paint(r, c);
          return (
            <rect
              key={`${r}:${c}`}
              x={rect.x + 2}
              y={rect.y + 2}
              width={rect.width - 4}
              height={rect.height - 4}
              rx="4"
              fill={p.fill}
              fillOpacity={p.fillOpacity}
              stroke={p.stroke}
              strokeOpacity={p.strokeOpacity}
              strokeWidth={p.strokeWidth}
              strokeDasharray="4 3"
            />
          );
        })
      )}

      {boundaryAt !== null &&
        (() => {
          const y = layout.rowBoundaryY(boundaryAt);
          const first = layout.cellRect({ row: 0, col: 0 });
          const last = layout.cellRect({ row: 0, col: Math.max(0, layout.cols - 1) });
          return (
            <line
              x1={first.x - 20}
              y1={y}
              x2={last.x + first.width + 20}
              y2={y}
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })()}
    </g>
  );
}
