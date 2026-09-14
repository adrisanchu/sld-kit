import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Grid3x3,
  Maximize,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Spline,
  Square,
  Tag,
  Trash2,
  Undo2,
  X,
  Zap,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { PositionType } from '@sld-kit/core';
import { MatrixCreatorFlyout } from './MatrixCreatorFlyout';
import { ExportFlyout } from './ExportFlyout';
import { PositionTypeFlyout } from './PositionTypeFlyout';
import {
  DEFAULT_TOOLBAR_LABELS,
  DEFAULT_POSITION_TYPE_LABELS,
  type SldToolbarLabels,
  type ExportFlyoutLabels,
  type MatrixCreatorLabels
} from './labels';
import { useSldAnimations, fadeIn, slideUpIn } from './styles';

export type SldTool = 'select' | 'busbar' | 'position' | 'connection';
export type ColorMode = 'by-type' | 'by-voltage';
export type LabelMode = 'all' | 'topology' | 'none';

const DEFAULT_TYPES: PositionType[] = ['line', 'transformer', 'central', 'renewable', 'reserve', 'storage', 'demand'];

export interface SldToolbarProps {
  userRole?: string;
  /** Active canvas tool, owned by the editor. */
  tool?: SldTool;
  canUndo?: boolean;
  canRedo?: boolean;
  hasSelection?: boolean;
  /** Position type of the "add position" tool, owned by the editor. */
  positionType?: PositionType;
  /** Color mode, owned by the editor. */
  colorMode?: ColorMode;
  /** Label-visibility mode, owned by the editor. */
  labelMode?: LabelMode;
  /** Selectable position types for the type flyout. */
  positionTypes?: PositionType[];
  /** Label per position type (hint bar + type flyout). */
  positionTypeLabels?: Record<string, string>;
  /** Toolbar UI strings. */
  labels?: Partial<SldToolbarLabels>;
  /** Export flyout strings. */
  exportLabels?: Partial<ExportFlyoutLabels>;
  /** Matrix creator strings. */
  matrixLabels?: Partial<MatrixCreatorLabels>;
  /**
   * Edit-mode toggle. Controlled when provided (pair with `onEditModeChange`);
   * otherwise the toolbar manages it internally, seeded from this default.
   */
  editMode?: boolean;
  onEditModeChange?: (editMode: boolean) => void;

  onSetTool?: (tool: SldTool) => void;
  onSetType?: (type: PositionType) => void;
  onMatrix?: (detail: { rows: number; cols: number }) => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFit?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onExportJson?: () => void;
  onExportSvg?: () => void;
  onSetColorMode?: (mode: ColorMode) => void;
  onSetLabelMode?: (mode: LabelMode) => void;
  /** Fired when the user switches into edit mode (not on exit). */
  onEnterEditMode?: () => void;
}

// Label visibility cycles all → topology → none → all.
const NEXT_LABEL_MODE: Record<LabelMode, LabelMode> = { all: 'topology', topology: 'none', none: 'all' };

const btnBase = 'flex h-8 w-8 items-center justify-center rounded-full transition-colors';
const btnActive = 'bg-primary text-primary-foreground';
const btnIdle = 'text-muted-foreground hover:bg-accent hover:text-foreground';

// A cluster of buttons. On ≥sm it's transparent and sits inside the one shared
// pill; below sm each cluster becomes its own pill (the outer shell drops its
// background) so the toolbar splits into stacked rows. On small screens the
// pill fills the width (capped + centered) and spreads its buttons edge to edge
// instead of shrinking to content and wrapping early.
const groupPill =
  'flex min-h-10 w-full max-w-md mx-auto flex-wrap items-center justify-between gap-y-1 rounded-full border border-border bg-background/80 px-1.5 shadow-lg backdrop-blur-sm sm:mx-0 sm:h-auto sm:min-h-0 sm:w-auto sm:max-w-none sm:flex-nowrap sm:justify-start sm:px-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none sm:backdrop-blur-none';
const divider = 'mx-1 h-5 w-px shrink-0 bg-border';

/**
 * The floating editor toolbar: a bottom-centre pill with always-available view
 * controls (zoom, fit, export, color mode, label mode) and — for editors — an
 * edit cluster (select, grid, bus bar, position + type flyout, connection,
 * delete, undo/redo). Owns the global keyboard shortcuts and shows a hint bar
 * while a placement tool is active. Headless: it only reports intent.
 */
export function SldToolbar({
  userRole = 'viewer',
  tool = 'select',
  canUndo = false,
  canRedo = false,
  hasSelection = false,
  positionType = 'line',
  colorMode = 'by-type',
  labelMode = 'all',
  positionTypes = DEFAULT_TYPES,
  positionTypeLabels = DEFAULT_POSITION_TYPE_LABELS,
  labels,
  exportLabels,
  matrixLabels,
  editMode: editModeProp,
  onEditModeChange,
  onSetTool,
  onSetType,
  onMatrix,
  onDelete,
  onUndo,
  onRedo,
  onFit,
  onZoomIn,
  onZoomOut,
  onExportJson,
  onExportSvg,
  onSetColorMode,
  onSetLabelMode,
  onEnterEditMode
}: SldToolbarProps) {
  useSldAnimations();
  const L = useMemo(() => ({ ...DEFAULT_TOOLBAR_LABELS, ...labels }), [labels]);

  const canEdit = userRole !== 'viewer';

  // Controlled if `editMode` is supplied, otherwise internally managed.
  const [internalEdit, setInternalEdit] = useState(false);
  const editMode = editModeProp ?? internalEdit;
  const setEditMode = (v: boolean) => {
    if (editModeProp === undefined) setInternalEdit(v);
    onEditModeChange?.(v);
  };

  const [showMatrix, setShowMatrix] = useState(false);
  const [showExport, setShowExport] = useState(false);

  function toggleEdit() {
    const next = !editMode;
    setEditMode(next);
    if (next) {
      onEnterEditMode?.();
    } else {
      setShowMatrix(false);
      onSetTool?.('select');
    }
  }

  function pick(t: SldTool) {
    setShowMatrix(false);
    onSetTool?.(t);
  }

  function handleMatrix(detail: { rows: number; cols: number }) {
    setShowMatrix(false);
    onMatrix?.(detail);
  }

  function toggleExport() {
    setShowExport((s) => {
      const next = !s;
      if (next) setShowMatrix(false);
      return next;
    });
  }

  // Global shortcuts. Read the latest closures through a ref so the window
  // listener binds once yet never goes stale.
  const latest = useRef({ canEdit, editMode, toggleEdit, pick, onUndo, onRedo });
  latest.current = { canEdit, editMode, toggleEdit, pick, onUndo, onRedo };

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

      const s = latest.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        if (!s.canEdit) return;
        e.preventDefault();
        s.toggleEdit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        (e.shiftKey ? s.onRedo : s.onUndo)?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.onRedo?.();
        return;
      }
      if (!s.editMode || !s.canEdit) return;
      // Single-key tool shortcuts (only while editing).
      if (e.key === 'v' || e.key === 'V') s.pick('select');
      else if (e.key === 'b' || e.key === 'B') s.pick('busbar');
      else if (e.key === 'p' || e.key === 'P') s.pick('position');
      else if (e.key === 'c' || e.key === 'C') s.pick('connection');
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  const activeToolLabel =
    tool === 'busbar'
      ? L.hintBusBar
      : tool === 'position'
        ? L.hintPosition(positionTypeLabels[positionType] ?? positionType)
        : tool === 'connection'
          ? L.hintConnection
          : '';

  return (
    <>
      {/* Floating hint bar while a placement/connection tool is active. */}
      {tool !== 'select' && activeToolLabel && (
        <div className="absolute inset-x-2 top-4 z-10 flex justify-center" data-sld-anim style={fadeIn}>
          <div className="flex min-h-9 max-w-full items-center gap-2 rounded-2xl border border-border bg-background/80 px-4 py-1.5 shadow-lg backdrop-blur-sm">
            <span className="text-sm text-muted-foreground">{activeToolLabel}</span>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => pick('select')}
            >
              <X className="h-3.5 w-3.5" />
              <span>
                <kbd className="rounded border border-border px-1 font-mono text-xs">{L.escKey}</kbd>
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="absolute inset-x-2 bottom-4 z-10 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
        {/* Matrix creator flyout */}
        {showMatrix && (
          <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2" data-sld-anim style={slideUpIn}>
            <MatrixCreatorFlyout labels={matrixLabels} onCreate={handleMatrix} />
          </div>
        )}

        {/* Export flyout */}
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

        {/* Responsive shell: one pill on ≥sm; below sm the view and edit clusters
            split into two stacked pills (view on the bottom) so nothing clips. */}
        <div className="flex flex-col-reverse items-stretch gap-2 sm:h-10 sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:border sm:border-border sm:bg-background/80 sm:px-1 sm:shadow-lg sm:backdrop-blur-sm">
          {/* View / navigation cluster (always visible) + the edit toggle */}
          <div className={groupPill}>
            <button type="button" title={L.zoomOut} className={`${btnBase} ${btnIdle}`} onClick={() => onZoomOut?.()}>
              <span className="sr-only">{L.zoomOut}</span>
              <ZoomOut className="h-4 w-4" />
            </button>
            <button type="button" title={L.zoomIn} className={`${btnBase} ${btnIdle}`} onClick={() => onZoomIn?.()}>
              <span className="sr-only">{L.zoomIn}</span>
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" title={L.fit} className={`${btnBase} ${btnIdle}`} onClick={() => onFit?.()}>
              <span className="sr-only">{L.fit}</span>
              <Maximize className="h-4 w-4" />
            </button>

            <button
              type="button"
              title={L.export}
              className={`${btnBase} ${showExport ? btnActive : btnIdle}`}
              onClick={toggleExport}
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

            {/* Label visibility cycle. Kept visually neutral in all three states;
                the glyph alone conveys the state. */}
            <button
              type="button"
              title={L.labelMode(labelMode)}
              className={`${btnBase} ${btnIdle}`}
              onClick={() => onSetLabelMode?.(NEXT_LABEL_MODE[labelMode])}
            >
              <span className="sr-only">{L.labelMode(labelMode)}</span>
              <Tag className="h-4 w-4">
                {/* `all` shows the plain tag; `topology` adds a corner dot for
                    "some labels"; `none` adds a lucide-style slash. */}
                {labelMode === 'topology' && <circle cx="18.5" cy="18.5" r="4.5" fill="currentColor" stroke="none" />}
                {labelMode === 'none' && <path d="m2 22 20 -20" strokeWidth="2.5" />}
              </Tag>
            </button>

            {canEdit && (
              <>
                <div className={divider} />
                <button
                  type="button"
                  title={editMode ? L.exitEditMode : L.editMode}
                  className={`${btnBase} ${editMode ? btnActive : btnIdle}`}
                  onClick={toggleEdit}
                >
                  <span className="sr-only">{L.editMode}</span>
                  <Pencil className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Edit cluster: mutation tools. Inside the shared pill on ≥sm; its own
              pill (stacked above the view row) below sm. */}
          {canEdit && editMode && (
            <div className={groupPill} data-sld-anim style={fadeIn}>
              <div className={`${divider} hidden sm:block`} />

              <button
                type="button"
                title={L.select}
                className={`${btnBase} ${tool === 'select' ? btnActive : btnIdle}`}
                onClick={() => pick('select')}
              >
                <span className="sr-only">{L.select}</span>
                <MousePointer2 className="h-4 w-4" />
              </button>

              <button
                type="button"
                title={L.matrix}
                className={`${btnBase} ${showMatrix ? btnActive : btnIdle}`}
                onClick={() => setShowMatrix((s) => !s)}
              >
                <span className="sr-only">{L.matrix}</span>
                <Grid3x3 className="h-4 w-4" />
              </button>

              <button
                type="button"
                title={L.addBusBar}
                className={`${btnBase} ${tool === 'busbar' ? btnActive : btnIdle}`}
                onClick={() => pick('busbar')}
              >
                <span className="sr-only">{L.addBusBar}</span>
                <Minus className="h-4 w-4" />
              </button>

              {/* Add position (split button + type flyout) */}
              <div className="flex items-center">
                <button
                  type="button"
                  title={L.addPosition}
                  className={`${btnBase} ${tool === 'position' ? btnActive : btnIdle}`}
                  onClick={() => pick('position')}
                >
                  <span className="sr-only">{L.addPosition}</span>
                  <Square className="h-4 w-4" style={{ color: `var(--sld-pos-${positionType})` }} />
                </button>
                <PositionTypeFlyout
                  isActive={tool === 'position'}
                  positionType={positionType}
                  positionTypes={positionTypes}
                  labels={positionTypeLabels}
                  onSetType={onSetType}
                />
              </div>

              <button
                type="button"
                title={L.addConnection}
                className={`${btnBase} ${tool === 'connection' ? btnActive : btnIdle}`}
                onClick={() => pick('connection')}
              >
                <span className="sr-only">{L.addConnection}</span>
                <Spline className="h-4 w-4" />
              </button>

              <div className={divider} />

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
    </>
  );
}
