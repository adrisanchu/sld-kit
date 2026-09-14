import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExternalAssetKind } from '@sld-kit/core';
import { DEFAULT_EXTERNAL_ASSET_LABELS, type ExternalAssetPopoverLabels } from './labels';

export interface ExternalAssetPopoverProps {
  x: number;
  y: number;
  labels?: Partial<ExternalAssetPopoverLabels>;
  onConfirm?: (detail: { asset: ExternalAssetKind; label: string }) => void;
  onCancel?: () => void;
}

const ORDER: ExternalAssetKind[] = ['line', 'transformer', 'renewable', 'storage', 'demand'];

/**
 * Small HTML form shown when the user ends a connection in the margin (outside
 * the grid): choose the external asset kind and its label. Positioned in screen
 * pixels over the canvas by the parent.
 */
export function ExternalAssetPopover({ x, y, labels, onConfirm, onCancel }: ExternalAssetPopoverProps) {
  const L = useMemo(
    () => ({
      ...DEFAULT_EXTERNAL_ASSET_LABELS,
      ...labels,
      kinds: { ...DEFAULT_EXTERNAL_ASSET_LABELS.kinds, ...labels?.kinds }
    }),
    [labels]
  );

  const [asset, setAsset] = useState<ExternalAssetKind>('line');
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function confirm() {
    // Empty label → the editor auto-names it (line-1, trf-2, …).
    onConfirm?.({ asset, label: label.trim() });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') confirm();
    else if (e.key === 'Escape') onCancel?.();
  }

  return (
    <div
      className="absolute z-30 w-56 rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
      style={{ left: x, top: y }}
      onKeyDown={onKeyDown}
    >
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{L.heading}</p>
      <select
        value={asset}
        onChange={(e) => setAsset(e.target.value as ExternalAssetKind)}
        className="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        {ORDER.map((k) => (
          <option key={k} value={k}>
            {L.kinds[k]}
          </option>
        ))}
      </select>
      <input
        ref={inputRef}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={L.placeholder}
        className="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
          onClick={() => onCancel?.()}
        >
          {L.cancel}
        </button>
        <button
          type="button"
          className="h-7 rounded-md bg-primary px-2 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={confirm}
        >
          {L.confirm}
        </button>
      </div>
    </div>
  );
}
