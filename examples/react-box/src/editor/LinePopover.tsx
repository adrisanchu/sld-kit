import { useState } from 'react';
import {
  DEFAULT_LINE_NAME_PLACEMENT,
  LINE_NAME_ALONGS,
  LINE_NAME_ORIENTATIONS,
  LINE_NAME_SIDES,
  type CompositeLine,
  type CompositeLineKind,
  type LineName,
  type LineNamePlacement
} from '@sld-kit/core';
import type { LineRatingData, SeasonalCapacity } from '../fixture';
import { Floating, type AnchorFn } from './Floating';

export interface LinePopoverProps {
  /** Where it's tethered on the canvas (viewport px, polled per frame); see `Floating`. */
  anchor: AnchorFn;
  /** Its anchor left the view: close it. */
  onDetach: () => void;
  line: CompositeLine;
  kinds: { kind: CompositeLineKind; label: string }[];
  /** Apply every edit as one undoable step (`data` undefined clears the ratings; an empty name unnames). */
  onApply: (kind: CompositeLineKind, data: LineRatingData | undefined, name: LineName) => void;
  onClose: () => void;
}

const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn'] as const;

const PLACEMENT_LABELS: Record<string, string> = {
  start: 'Start',
  middle: 'Middle',
  end: 'End',
  above: 'Above',
  below: 'Below',
  parallel: 'Parallel',
  perpendicular: 'Across',
  horizontal: 'Horizontal'
};

/** A small segmented control, styled like the kind picker. */
function Segmented<T extends string>({
  values,
  value,
  onChange
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap rounded-md border border-border p-0.5 text-xs">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded px-2 py-0.5 transition-colors ${
            value === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {PLACEMENT_LABELS[v] ?? v}
        </button>
      ))}
    </div>
  );
}

const toField = (n: number | null | undefined) => (n == null ? '' : String(n));
const toNum = (s: string): number | undefined => {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Edit a selected line: its kind, the rating it shows — seasonal capacity (MW)
 * for lines and cables, an MVA rating for transformers — and its own name. The
 * ratings live in the line's opaque `data` (core never reads it); the layout's
 * `lineLabels` resolver formats them. The name (`CompositeLine.name`) is drawn by
 * the core layout itself, placed along / beside / across the line; "start" and
 * "above" follow the reading direction, so the name stays put when boxes swap.
 */
export function LinePopover({ anchor, onDetach, line, kinds, onApply, onClose }: LinePopoverProps) {
  const ratings = (line.data as LineRatingData | undefined)?.ratings;
  const [kind, setKind] = useState<CompositeLineKind>(line.kind);
  const [capacity, setCapacity] = useState<string[]>(() => [0, 1, 2, 3].map((i) => toField(ratings?.capacity?.[i])));
  const [mva, setMva] = useState(toField(ratings?.mva));
  const [name, setName] = useState(line.name ?? '');
  const [placement, setPlacement] = useState<LineNamePlacement>(line.namePlacement ?? DEFAULT_LINE_NAME_PLACEMENT);
  const place = (patch: Partial<LineNamePlacement>) => setPlacement((p) => ({ ...p, ...patch }));

  const apply = () => {
    let data: LineRatingData | undefined;
    if (kind === 'transformer') {
      const v = toNum(mva);
      data = v != null ? { ratings: { mva: v } } : undefined;
    } else {
      const cap = capacity.map(toNum) as SeasonalCapacity;
      data = cap.some((v) => v != null) ? { ratings: { capacity: cap } } : undefined;
    }
    const trimmed = name.trim();
    onApply(kind, data, trimmed ? { name: trimmed, placement } : {});
  };

  return (
    <Floating
      anchor={anchor}
      onDetach={onDetach}
      className="w-64 rounded-lg border border-border bg-background p-3 text-sm shadow-lg"
    >
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">Line</p>
        <div className="mb-3 flex flex-wrap rounded-md border border-border p-0.5 text-xs">
          {kinds.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(k.kind)}
              className={`rounded px-2 py-0.5 transition-colors ${
                kind === k.kind ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {kind === 'transformer' ? (
          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            Rating (MVA)
            <input
              value={mva}
              inputMode="decimal"
              onChange={(e) => setMva(e.target.value)}
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-foreground"
            />
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {SEASONS.map((s, i) => (
              <label key={s} className="flex flex-col gap-1 text-xs text-muted-foreground">
                {s} (MW)
                <input
                  value={capacity[i]}
                  inputMode="decimal"
                  onChange={(e) => setCapacity((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                  className="rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-foreground"
                />
              </label>
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Name
            <input
              value={name}
              placeholder="e.g. L-220 kV Alpha-Bravo"
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>
          {name.trim() && (
            <div className="mt-2 flex flex-col gap-1.5">
              <Segmented values={LINE_NAME_ALONGS} value={placement.along} onChange={(along) => place({ along })} />
              <Segmented values={LINE_NAME_SIDES} value={placement.side} onChange={(side) => place({ side })} />
              <Segmented
                values={LINE_NAME_ORIENTATIONS}
                value={placement.orientation}
                onChange={(orientation) => place({ orientation })}
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2 text-xs">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-2 py-1 hover:bg-accent">
            Close
          </button>
          <button type="button" onClick={apply} className="rounded-md bg-primary px-2 py-1 text-primary-foreground">
            Apply
          </button>
        </div>
      </div>
    </Floating>
  );
}
