import { useEffect } from 'react';
import { Plus, SquarePen } from 'lucide-react';
import { Floating, type AnchorFn } from './Floating';
import type { Terminal } from './terminals';

export interface BayPickerProps {
  /** Where it's tethered on the canvas (viewport px, polled per frame); see `Floating`. */
  anchor: AnchorFn;
  /** Its anchor left the view: close it. */
  onDetach: () => void;
  /** Substation name, for the heading. */
  name: string;
  /** The box's free feeders. */
  terminals: Terminal[];
  /** Whether a new bay can be grown (the substation has a bar). */
  canAutoBay: boolean;
  onPick: (connectionId: string) => void;
  onNewBay: () => void;
  /** Open the substation editor to design a bay (omit to hide the action). */
  onDesign?: () => void;
  onCancel: () => void;
}

/**
 * Shown when a drawn line lands on a box body instead of a feeder dot: connect
 * to one of the box's free feeders, grow a new bay for it, or open the
 * substation editor to design one. Lines join bays, never whole boxes.
 */
export function BayPicker({
  anchor,
  onDetach,
  name,
  terminals,
  canAutoBay,
  onPick,
  onNewBay,
  onDesign,
  onCancel
}: BayPickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <Floating
      anchor={anchor}
      onDetach={onDetach}
      className="w-56 rounded-lg border border-border bg-background p-1 text-sm shadow-lg"
    >
      <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Connect to {name}</p>
      {terminals.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">No free feeders.</p>
      ) : (
        terminals.map((t) => (
          <button
            key={t.connectionId}
            type="button"
            onClick={() => onPick(t.connectionId)}
            className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-accent"
          >
            <span className="truncate">{t.label}</span>
            {t.bayLabel && t.bayLabel !== t.label && (
              <span className="truncate text-xs text-muted-foreground">{t.bayLabel}</span>
            )}
          </button>
        ))
      )}
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        disabled={!canAutoBay}
        onClick={onNewBay}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" /> New bay
      </button>
      {onDesign && (
        <button
          type="button"
          onClick={onDesign}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
        >
          <SquarePen className="h-3.5 w-3.5" /> Design bay…
        </button>
      )}
    </Floating>
  );
}
