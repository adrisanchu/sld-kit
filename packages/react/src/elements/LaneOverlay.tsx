import { useMemo, useState } from 'react';
import type { DiagramLayout } from '@sld-kit/core';
import { DEFAULT_LANE_OVERLAY_LABELS, type LaneOverlayLabels } from '../labels';

export type Lane = { kind: 'row' | 'col'; index: number };

export interface LaneOverlayProps {
  layout: DiagramLayout;
  selectedLane?: Lane | null;
  labels?: Partial<LaneOverlayLabels>;
  onSelectLane?: (detail: Lane) => void;
  onAddLane?: (detail: { kind: 'row' | 'col' }) => void;
}

const HANDLE_W = 28;
// The bus bar overhang is 30px (SLD_LAYOUT.busBarOverhang). Handles must end
// at x < (margin - overhang) so they don't overlap the bus bar label text.
const HANDLE_RIGHT_GAP = 34; // = busBarOverhang(30) + 4px clearance
const ADD_SIZE = 24;
const ADD_GAP = 8;
const CORNER_R = 4;

/**
 * SVG overlay (rendered in the canvas background slot) for lane selection and
 * lane addition. Renders column hit bands, row handle tabs, and "+"
 * affordances at the grid edges. All geometry derives from `layout`.
 */
export function LaneOverlay({ layout, selectedLane = null, labels, onSelectLane, onAddLane }: LaneOverlayProps) {
  const L = useMemo(() => ({ ...DEFAULT_LANE_OVERLAY_LABELS, ...labels }), [labels]);
  const [hoverLane, setHoverLane] = useState<Lane | null>(null);

  const selectedRowIndex = selectedLane?.kind === 'row' ? selectedLane.index : -1;
  const selectedColIndex = selectedLane?.kind === 'col' ? selectedLane.index : -1;
  const hoverRowIndex = hoverLane?.kind === 'row' ? hoverLane.index : -1;
  const hoverColIndex = hoverLane?.kind === 'col' ? hoverLane.index : -1;

  const hasContent = layout.rows > 0 && layout.cols > 0;
  const margin = hasContent ? layout.cellRect({ row: 0, col: 0 }).x : 90;
  const cellWidth = hasContent ? layout.cellRect({ row: 0, col: 0 }).width : 0;
  const handleX = margin - HANDLE_W - HANDLE_RIGHT_GAP;

  const innerTop = layout.rowBoundaryY(0);
  const innerBottom = layout.rowBoundaryY(layout.rows);
  const innerHeight = innerBottom - innerTop;
  const innerRight = hasContent ? layout.cellRect({ row: 0, col: layout.cols - 1 }).x + cellWidth : margin;

  const colIndices = useMemo(() => Array.from({ length: layout.cols }, (_, c) => c), [layout.cols]);
  const rowIndices = useMemo(() => Array.from({ length: layout.rows }, (_, r) => r), [layout.rows]);

  if (!hasContent) return null;

  /** x of a column band — starts at the cell's left edge. */
  const colBandX = (col: number) => layout.cellRect({ row: 0, col }).x;
  /** Width of a column band — extends to the next column's left edge, or just cellWidth for the last. */
  const colBandW = (col: number) =>
    col < layout.cols - 1 ? layout.cellRect({ row: 0, col: col + 1 }).x - colBandX(col) : cellWidth;
  const rowTop = (row: number) => layout.cellRect({ row, col: 0 }).y;
  const rowHeight = (row: number) => layout.cellRect({ row, col: 0 }).height;
  const rowBandY = (row: number) => layout.rowBoundaryY(row);
  const rowBandH = (row: number) => layout.rowBoundaryY(row + 1) - layout.rowBoundaryY(row);

  return (
    <>
      {/* Column hit bands (interactive, behind elements).
          pointerEvents="all" is required: SVG's default "visiblePainted" skips
          hit-testing on transparent fills, causing hover/click to pass through. */}
      {colIndices.map((col) => {
        const selected = selectedColIndex === col;
        const hovered = hoverColIndex === col;
        return (
          <rect
            key={`col:${col}`}
            x={colBandX(col)}
            y={innerTop}
            width={colBandW(col)}
            height={innerHeight}
            fill={selected || hovered ? 'var(--primary)' : 'transparent'}
            fillOpacity={selected ? 0.12 : hovered ? 0.06 : undefined}
            stroke={selected ? 'var(--primary)' : 'none'}
            strokeWidth="1.5"
            strokeDasharray="4 3"
            pointerEvents="all"
            className="cursor-pointer"
            onPointerEnter={() => setHoverLane({ kind: 'col', index: col })}
            onPointerLeave={() => setHoverLane((l) => (l?.kind === 'col' && l.index === col ? null : l))}
            onClick={() => onSelectLane?.({ kind: 'col', index: col })}
          >
            <title>{L.columnTitle(col + 1)}</title>
          </rect>
        );
      })}

      {/* Row band highlights (pointer-events-none, shown when row selected/hovered) */}
      {rowIndices.map((row) => {
        const selected = selectedRowIndex === row;
        if (!selected && hoverRowIndex !== row) return null;
        return (
          <rect
            key={`rowband:${row}`}
            x={margin}
            y={rowBandY(row)}
            width={innerRight - margin}
            height={rowBandH(row)}
            fill="var(--primary)"
            fillOpacity={selected ? 0.12 : 0.06}
            stroke={selected ? 'var(--primary)' : 'none'}
            strokeWidth="1.5"
            strokeDasharray="4 3"
            className="pointer-events-none"
          />
        );
      })}

      {/* Row handle tabs (left margin, interactive) */}
      {rowIndices.map((row) => {
        const selected = selectedRowIndex === row;
        const hovered = hoverRowIndex === row;
        const isBar = layout.rowKind(row) === 'busbar';
        const fill = selected || hovered ? 'var(--primary)' : 'var(--muted-foreground)';
        const fillOpacity = selected ? 0.25 : hovered ? 0.12 : isBar ? 0.15 : 0.08;
        return (
          <g key={`rowhandle:${row}`}>
            <rect
              x={handleX}
              y={rowTop(row)}
              width={HANDLE_W}
              height={rowHeight(row)}
              rx={CORNER_R}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={selected ? 'var(--primary)' : 'var(--border)'}
              strokeWidth="1"
              className="cursor-pointer"
              onPointerEnter={() => setHoverLane({ kind: 'row', index: row })}
              onPointerLeave={() => setHoverLane((l) => (l?.kind === 'row' && l.index === row ? null : l))}
              onClick={() => onSelectLane?.({ kind: 'row', index: row })}
            >
              <title>{L.rowTitle(row + 1)}</title>
            </rect>
            <text
              x={handleX + HANDLE_W / 2}
              y={rowTop(row) + rowHeight(row) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="10"
              fill={selected ? 'var(--primary)' : 'var(--muted-foreground)'}
              className="pointer-events-none select-none"
            >
              {row + 1}
            </text>
          </g>
        );
      })}

      {/* "+" tab: add column (right edge of grid) */}
      <rect
        x={innerRight + ADD_GAP}
        y={innerTop}
        width={ADD_SIZE}
        height={innerHeight}
        rx={CORNER_R}
        fill="var(--primary)"
        fillOpacity={0.08}
        stroke="var(--primary)"
        strokeOpacity={0.3}
        strokeWidth="1"
        strokeDasharray="4 3"
        className="cursor-pointer"
        onClick={() => onAddLane?.({ kind: 'col' })}
      >
        <title>{L.addColumn}</title>
      </rect>
      <text
        x={innerRight + ADD_GAP + ADD_SIZE / 2}
        y={(innerTop + innerBottom) / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="16"
        fontWeight="bold"
        fill="var(--primary)"
        fillOpacity={0.6}
        className="pointer-events-none select-none"
      >
        +
      </text>

      {/* "+" tab: add row (below grid, in handle column) */}
      <rect
        x={handleX}
        y={innerBottom + ADD_GAP}
        width={HANDLE_W}
        height={ADD_SIZE}
        rx={CORNER_R}
        fill="var(--primary)"
        fillOpacity={0.08}
        stroke="var(--primary)"
        strokeOpacity={0.3}
        strokeWidth="1"
        strokeDasharray="4 3"
        className="cursor-pointer"
        onClick={() => onAddLane?.({ kind: 'row' })}
      >
        <title>{L.addRow}</title>
      </rect>
      <text
        x={handleX + HANDLE_W / 2}
        y={innerBottom + ADD_GAP + ADD_SIZE / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="16"
        fontWeight="bold"
        fill="var(--primary)"
        fillOpacity={0.6}
        className="pointer-events-none select-none"
      >
        +
      </text>
    </>
  );
}
