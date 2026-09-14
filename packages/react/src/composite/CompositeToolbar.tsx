import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ImagePlus,
  Maximize,
  MousePointer2,
  Redo2,
  Spline,
  Tag,
  Trash2,
  Type,
  Undo2,
  Zap
} from 'lucide-react';
import { ExportFlyout } from '../ExportFlyout';
import { DEFAULT_COMPOSITE_TOOLBAR_LABELS, type CompositeToolbarLabels, type ExportFlyoutLabels } from '../labels';
import type { ColorMode, LabelMode } from '../SldToolbar';
import { useSldAnimations, slideUpIn } from '../styles';

export interface CompositeToolbarProps {
  userRole?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  hasSelection?: boolean;
  /** Whether a *child diagram* (not a line/link) is selected — gates the name button. */
  childSelected?: boolean;
  /** Whether the draw-line tool is active (owned by the editor). */
  drawActive?: boolean;
  colorMode?: ColorMode;
  labelMode?: LabelMode;
  labels?: Partial<CompositeToolbarLabels>;
  exportLabels?: Partial<ExportFlyoutLabels>;

  onImport?: () => void;
  onDrawLine?: () => void;
  onDelete?: () => void;
  /** Open the name-placement editor for the selected child. */
  onEditLabel?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFit?: () => void;
  onExportJson?: () => void;
  onExportSvg?: () => void;
  onSetColorMode?: (mode: ColorMode) => void;
  onSetLabelMode?: (mode: LabelMode) => void;
}

const NEXT_LABEL_MODE: Record<LabelMode, LabelMode> = { all: 'topology', topology: 'none', none: 'all' };

const btnBase = 'flex h-8 w-8 items-center justify-center rounded-full transition-colors';
const btnActive = 'bg-primary text-primary-foreground';
const btnIdle = 'text-muted-foreground hover:bg-accent hover:text-foreground';

// Fewer buttons than SldToolbar, so the single pill fits to ~420px and only then
// splits into two stacked, full-width pills.
const groupPill =
  'flex min-h-10 flex-wrap items-center gap-y-1 rounded-full border border-border bg-background/80 px-1.5 shadow-lg backdrop-blur-sm min-[420px]:h-auto min-[420px]:min-h-0 min-[420px]:w-auto min-[420px]:flex-nowrap min-[420px]:justify-start min-[420px]:px-0 min-[420px]:rounded-none min-[420px]:border-0 min-[420px]:bg-transparent min-[420px]:shadow-none min-[420px]:backdrop-blur-none';
const divider = 'mx-1 h-5 w-px shrink-0 bg-border';

/**
 * Deliberately poorer than `SldToolbar`: the composite editor has no
 * position/bus-bar/connection drawing tools. Only Import, Select, Draw line,
 * Remove selected, name placement, Undo/Redo, Zoom-to-fit and Export.
 */
export function CompositeToolbar({
  userRole = 'viewer',
  canUndo = false,
  canRedo = false,
  hasSelection = false,
  childSelected = false,
  drawActive = false,
  colorMode = 'by-type',
  labelMode = 'all',
  labels,
  exportLabels,
  onImport,
  onDrawLine,
  onDelete,
  onEditLabel,
  onUndo,
  onRedo,
  onFit,
  onExportJson,
  onExportSvg,
  onSetColorMode,
  onSetLabelMode
}: CompositeToolbarProps) {
  useSldAnimations();
  const L = useMemo(() => ({ ...DEFAULT_COMPOSITE_TOOLBAR_LABELS, ...labels }), [labels]);
  const canEdit = userRole !== 'viewer';
  const [showExport, setShowExport] = useState(false);

  const latest = useRef({ onUndo, onRedo });
  latest.current = { onUndo, onRedo };

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        (e.shiftKey ? latest.current.onRedo : latest.current.onUndo)?.();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        latest.current.onRedo?.();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  return (
    <div className="absolute inset-x-2 bottom-4 z-10 min-[420px]:inset-x-auto min-[420px]:left-1/2 min-[420px]:-translate-x-1/2">
      {showExport && (
        <div className="absolute bottom-full right-0 z-20 mb-2" data-sld-anim style={slideUpIn}>
          <ExportFlyout
            labels={exportLabels}
            onJson={() => {
              setShowExport(false);
              onExportJson?.();
            }}
            onSvg={() => {
              setShowExport(false);
              onExportSvg?.();
            }}
          />
        </div>
      )}

      <div className="flex flex-col-reverse items-center gap-2 min-[420px]:h-10 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-0 min-[420px]:rounded-full min-[420px]:border min-[420px]:border-border min-[420px]:bg-background/80 min-[420px]:px-1 min-[420px]:shadow-lg min-[420px]:backdrop-blur-sm">
        {/* View / navigation cluster (always visible) */}
        <div className={`${groupPill} justify-stretch`}>
          <button type="button" title={L.fit} className={`${btnBase} ${btnIdle}`} onClick={() => onFit?.()}>
            <span className="sr-only">{L.fit}</span>
            <Maximize className="h-4 w-4" />
          </button>

          <button
            type="button"
            title={L.export}
            className={`${btnBase} ${showExport ? btnActive : btnIdle}`}
            onClick={() => setShowExport((s) => !s)}
          >
            <span className="sr-only">{L.export}</span>
            <Download className="h-4 w-4" />
          </button>

          <button
            type="button"
            title={L.colorMode}
            className={`${btnBase} ${colorMode === 'by-voltage' ? btnActive : btnIdle}`}
            onClick={() => onSetColorMode?.(colorMode === 'by-voltage' ? 'by-type' : 'by-voltage')}
          >
            <span className="sr-only">{L.colorMode}</span>
            <Zap className="h-4 w-4" />
          </button>

          <button
            type="button"
            title={L.labelMode(labelMode)}
            className={`${btnBase} ${btnIdle}`}
            onClick={() => onSetLabelMode?.(NEXT_LABEL_MODE[labelMode])}
          >
            <span className="sr-only">{L.labelMode(labelMode)}</span>
            <Tag className="h-4 w-4">
              {labelMode === 'topology' && <circle cx="18.5" cy="18.5" r="4.5" fill="currentColor" stroke="none" />}
              {labelMode === 'none' && <path d="m2 22 20 -20" strokeWidth="2.5" />}
            </Tag>
          </button>
        </div>

        {/* Edit cluster: mutation tools. */}
        {canEdit && (
          <div className={`${groupPill} justify-between`}>
            <div className={`${divider} hidden min-[420px]:block`} />

            {/* Select — the default tool; active unless the draw tool is engaged. */}
            <button
              type="button"
              title={L.select}
              className={`${btnBase} ${drawActive ? btnIdle : btnActive}`}
              onClick={() => drawActive && onDrawLine?.()}
            >
              <span className="sr-only">{L.select}</span>
              <MousePointer2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              title={L.drawLine}
              className={`${btnBase} ${drawActive ? btnActive : btnIdle}`}
              onClick={() => onDrawLine?.()}
            >
              <span className="sr-only">{L.drawLine}</span>
              <Spline className="h-4 w-4" />
            </button>

            <button type="button" title={L.import} className={`${btnBase} ${btnIdle}`} onClick={() => onImport?.()}>
              <span className="sr-only">{L.import}</span>
              <ImagePlus className="h-4 w-4" />
            </button>

            <div className={divider} />

            <button
              type="button"
              title={L.editLabel}
              className={`${btnBase} ${btnIdle} disabled:opacity-40`}
              disabled={!childSelected}
              onClick={() => onEditLabel?.()}
            >
              <span className="sr-only">{L.editLabel}</span>
              <Type className="h-4 w-4" />
            </button>

            <button
              type="button"
              title={L.delete}
              className={`${btnBase} ${btnIdle} disabled:opacity-40`}
              disabled={!hasSelection}
              onClick={() => onDelete?.()}
            >
              <span className="sr-only">{L.delete}</span>
              <Trash2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              title={L.undo}
              className={`${btnBase} ${btnIdle} disabled:opacity-40`}
              disabled={!canUndo}
              onClick={() => onUndo?.()}
            >
              <span className="sr-only">{L.undo}</span>
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={L.redo}
              className={`${btnBase} ${btnIdle} disabled:opacity-40`}
              disabled={!canRedo}
              onClick={() => onRedo?.()}
            >
              <span className="sr-only">{L.redo}</span>
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
