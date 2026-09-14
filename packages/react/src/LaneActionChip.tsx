import { useMemo } from 'react';
import { Trash2, X } from 'lucide-react';
import { DEFAULT_LANE_ACTION_CHIP_LABELS, type LaneActionChipLabels } from './labels';
import type { Lane } from './elements/LaneOverlay';

export interface LaneActionChipProps {
  x: number;
  y: number;
  lane: Lane;
  /** Ids of elements occupying this lane (bars + positions). */
  occupants?: string[];
  isBarRow?: boolean;
  canDelete?: boolean;
  deleteTooltip?: string;
  labels?: Partial<LaneActionChipLabels>;
  onDelete?: () => void;
  onClose?: () => void;
}

/**
 * Floating chip showing info about the selected lane plus a delete action.
 * Positioned in screen pixels by the parent (the editor), the same
 * absolute-positioning pattern as ExternalAssetPopover.
 *
 * Columns anchor at the top-center of the column band; rows at the
 * right-center of the row handle.
 */
export function LaneActionChip({
  x,
  y,
  lane,
  occupants = [],
  isBarRow = false,
  canDelete = false,
  deleteTooltip = '',
  labels,
  onDelete,
  onClose
}: LaneActionChipProps) {
  const L = useMemo(() => ({ ...DEFAULT_LANE_ACTION_CHIP_LABELS, ...labels }), [labels]);

  const title = lane.kind === 'col' ? L.columnTitle(lane.index + 1) : L.rowTitle(lane.index + 1);
  const positionsCount = isBarRow ? Math.max(0, occupants.length - 1) : occupants.length;

  const occupancyLine = (() => {
    if (lane.kind === 'col') {
      return positionsCount === 0 ? L.empty : L.positions(positionsCount);
    }
    if (!isBarRow && positionsCount === 0) return L.empty;
    const parts: string[] = [];
    if (positionsCount > 0) parts.push(L.positions(positionsCount));
    if (isBarRow) parts.push(L.busBar);
    return parts.join(' · ');
  })();

  // Column chip appears above the anchor; row chip to the right of it.
  const transform = lane.kind === 'col' ? 'translate(-50%, calc(-100% - 6px))' : 'translate(6px, -50%)';

  return (
    <div
      className="absolute z-30 min-w-36 rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
      style={{ left: x, top: y, transform }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{title}</span>
        <button
          type="button"
          className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => onClose?.()}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{occupancyLine}</p>
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canDelete}
          title={canDelete ? L.delete : deleteTooltip}
          onClick={() => onDelete?.()}
        >
          <Trash2 className="h-3 w-3" />
          {L.delete}
        </button>
      </div>
    </div>
  );
}
