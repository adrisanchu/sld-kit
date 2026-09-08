import { useState } from 'react';
import { ChevronUp } from 'lucide-react';
import type { PositionType } from '@sld-kit/core';
import { DEFAULT_POSITION_TYPE_LABELS } from './labels';

const DEFAULT_TYPES: PositionType[] = ['line', 'transformer', 'central', 'renewable', 'reserve', 'storage', 'demand'];

export interface PositionTypeFlyoutProps {
  isActive?: boolean;
  /** Currently selected position type (owned by the parent). */
  positionType?: PositionType;
  /** Selectable types, in display order. */
  positionTypes?: PositionType[];
  /** Label per position type. */
  labels?: Record<string, string>;
  /** Tooltip on the chevron trigger. */
  title?: string;
  onSetType?: (type: PositionType) => void;
}

/**
 * Split-button companion of the "add position" tool: a chevron that opens a
 * small panel to pick the position type for the next placements. Stateless —
 * the selected `positionType` is owned by the parent and reported through
 * `onSetType` (the app persists it, e.g. to localStorage).
 *
 * The color dots read `--sld-pos-<type>` directly. As with every React view,
 * those tokens are complete colors here (not the HSL triplet the Svelte
 * adapter expects).
 */
export function PositionTypeFlyout({
  isActive = false,
  positionType = 'line',
  positionTypes = DEFAULT_TYPES,
  labels = DEFAULT_POSITION_TYPE_LABELS,
  title = 'Position type',
  onSetType
}: PositionTypeFlyoutProps) {
  const [open, setOpen] = useState(false);

  function choose(type: PositionType) {
    onSetType?.(type);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        title={title}
        className={`flex h-8 w-4 items-center justify-center rounded-full transition-colors ${
          open || isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sr-only">{title}</span>
        <ChevronUp className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm">
          {positionTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                positionType === type ? 'bg-accent/60 font-medium' : ''
              }`}
              onClick={() => choose(type)}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `var(--sld-pos-${type})` }} />
              <span>{labels[type] ?? type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
