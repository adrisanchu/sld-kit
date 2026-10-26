import { useState } from 'react';
import type { CompositeLine, CompositeLineKind } from '@sld-kit/core';
import type { LineRatingData, SeasonalCapacity } from '../fixture';

export interface LinePopoverProps {
  /** Screen position (px, relative to the canvas container). */
  x: number;
  y: number;
  line: CompositeLine;
  kinds: { kind: CompositeLineKind; label: string }[];
  /** Apply both edits as one undoable step (`data` undefined clears the ratings). */
  onApply: (kind: CompositeLineKind, data: LineRatingData | undefined) => void;
  onClose: () => void;
}

const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn'] as const;

const toField = (n: number | null | undefined) => (n == null ? '' : String(n));
const toNum = (s: string): number | undefined => {
  const t = s.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Edit a selected line: its kind, and the rating it shows — seasonal capacity
 * (MW) for lines and cables, an MVA rating for transformers. The ratings live in
 * the line's opaque `data` (core never reads it); the layout's `lineLabels`
 * resolver formats them.
 */
export function LinePopover({ x, y, line, kinds, onApply, onClose }: LinePopoverProps) {
  const ratings = (line.data as LineRatingData | undefined)?.ratings;
  const [kind, setKind] = useState<CompositeLineKind>(line.kind);
  const [capacity, setCapacity] = useState<string[]>(() => [0, 1, 2, 3].map((i) => toField(ratings?.capacity?.[i])));
  const [mva, setMva] = useState(toField(ratings?.mva));

  const apply = () => {
    let data: LineRatingData | undefined;
    if (kind === 'transformer') {
      const v = toNum(mva);
      data = v != null ? { ratings: { mva: v } } : undefined;
    } else if (kind !== 'demand') {
      const cap = capacity.map(toNum) as SeasonalCapacity;
      data = cap.some((v) => v != null) ? { ratings: { capacity: cap } } : undefined;
    }
    onApply(kind, data);
  };

  return (
    <div
      className="absolute z-20 w-64 rounded-lg border border-border bg-background p-3 text-sm shadow-lg"
      style={{ left: x + 12, top: y + 12 }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
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
      ) : kind === 'demand' ? (
        <p className="text-xs text-muted-foreground">Demands carry no rating.</p>
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

      <div className="mt-3 flex justify-end gap-2 text-xs">
        <button type="button" onClick={onClose} className="rounded-md border border-border px-2 py-1 hover:bg-accent">
          Close
        </button>
        <button type="button" onClick={apply} className="rounded-md bg-primary px-2 py-1 text-primary-foreground">
          Apply
        </button>
      </div>
    </div>
  );
}
