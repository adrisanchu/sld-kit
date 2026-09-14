import { useMemo, useState } from 'react';
import { DEFAULT_MATRIX_LABELS, type MatrixCreatorLabels } from './labels';

export interface MatrixCreatorFlyoutProps {
  labels?: Partial<MatrixCreatorLabels>;
  onCreate?: (detail: { rows: number; cols: number }) => void;
}

const MAX = 8;
const RANGE = Array.from({ length: MAX }, (_, i) => i);

/**
 * Word-style table-size picker: hover an N×M grid, click to scaffold. The
 * picker chooses SLOT rows/cols only — bus bars are inserted afterwards with
 * the dedicated tool, each in its own row.
 */
export function MatrixCreatorFlyout({ labels, onCreate }: MatrixCreatorFlyoutProps) {
  const L = useMemo(() => ({ ...DEFAULT_MATRIX_LABELS, ...labels }), [labels]);
  const [hover, setHover] = useState<{ rows: number; cols: number }>({ rows: 0, cols: 0 });

  return (
    <div className="rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{L.heading}</p>
      <div className="flex flex-col gap-1" onPointerLeave={() => setHover({ rows: 0, cols: 0 })}>
        {RANGE.map((r) => (
          <div key={r} className="flex gap-1">
            {RANGE.map((c) => (
              <button
                key={c}
                type="button"
                className={`h-5 w-5 rounded-sm border transition-colors ${
                  r < hover.rows && c < hover.cols
                    ? 'border-primary bg-primary/30'
                    : 'border-border bg-muted/40 hover:bg-muted'
                }`}
                onPointerEnter={() => setHover({ rows: r + 1, cols: c + 1 })}
                onClick={() => onCreate?.({ rows: r + 1, cols: c + 1 })}
              >
                <span className="sr-only">
                  {r + 1} × {c + 1}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs tabular-nums text-muted-foreground">
        {hover.rows > 0 ? `${hover.rows} × ${hover.cols}` : '—'}
      </p>
    </div>
  );
}
