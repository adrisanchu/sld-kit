import { useEffect, useRef } from 'react';
import { Lock, WandSparkles } from 'lucide-react';

export interface TidyPromptProps {
  /** How many substations are locked (the prompt only opens when there are some). */
  lockedCount: number;
  /** Run the tidy; `includeLocked` lets it move the locked ones too. */
  onTidy: (includeLocked: boolean) => void;
  onCancel: () => void;
}

/**
 * Asked before a Tidy when some substations are locked: tidy around them
 * (the default), or let the clean-up move them too — they stay locked, at
 * their new spots.
 */
export function TidyPrompt({ lockedCount, onTidy, onCancel }: TidyPromptProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    keepRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(420px,92vw)] rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/30"
    >
      <div className="flex flex-col gap-3 p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <WandSparkles className="h-4 w-4" /> Tidy the layout
        </h2>
        <p className="text-muted-foreground">
          <Lock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {lockedCount === 1 ? '1 substation is' : `${lockedCount} substations are`} locked. Do you want to re-route
          locked elements as well?
        </p>
        <div className="mt-1 flex justify-end gap-2 text-xs">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1 hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onTidy(true)}
            className="rounded-md border border-border px-3 py-1 hover:bg-accent"
          >
            Include locked
          </button>
          <button
            ref={keepRef}
            type="button"
            onClick={() => onTidy(false)}
            className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
          >
            Keep locked in place
          </button>
        </div>
      </div>
    </dialog>
  );
}
