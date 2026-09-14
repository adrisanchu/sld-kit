import { useMemo } from 'react';
import { FileJson, Image as ImageIcon } from 'lucide-react';
import { DEFAULT_EXPORT_LABELS, type ExportFlyoutLabels } from './labels';

export interface ExportFlyoutProps {
  labels?: Partial<ExportFlyoutLabels>;
  onJson?: () => void;
  onSvg?: () => void;
}

/** Two-item menu card: "Export JSON" / "Export SVG". Shared by both toolbars. */
export function ExportFlyout({ labels, onJson, onSvg }: ExportFlyoutProps) {
  const L = useMemo(() => ({ ...DEFAULT_EXPORT_LABELS, ...labels }), [labels]);

  return (
    <div className="flex w-44 flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm">
      <button
        type="button"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
        onClick={() => onJson?.()}
      >
        <FileJson className="h-4 w-4 text-muted-foreground" />
        <span>{L.json}</span>
      </button>
      <button
        type="button"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
        onClick={() => onSvg?.()}
      >
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <span>{L.svg}</span>
      </button>
    </div>
  );
}
