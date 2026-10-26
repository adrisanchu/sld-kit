import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AddBusBarCommand,
  AddElementCommand,
  AddLaneCommand,
  AddPositionCommand,
  BusBar,
  CommandStack,
  Connection,
  DeleteElementsCommand,
  Grid,
  LayoutEngine,
  Position,
  SLD_LAYOUT,
  Serializer,
  SldDocument,
  SnapshotCommand,
  UpdateElementCommand,
  newId,
  nextExternalLabel,
  nextPositionLabel,
  type Cell,
  type Command,
  type CompositeDocument,
  type ElementGeometry,
  type ExternalAssetKind,
  type Point,
  type PositionType
} from '@sld-kit/core';
import {
  ExternalAssetPopover,
  GhostPreview,
  GridOverlay,
  LaneOverlay,
  MatrixCreatorFlyout,
  SldCanvas,
  SldToolbar,
  useCommandStack,
  useSldDocument,
  type ColorMode,
  type LabelMode,
  type Lane,
  type SldCanvasHandle,
  type SldTool
} from '@sld-kit/react';
import { X } from 'lucide-react';
import { voltageClass } from '../fixture';
import { barBusIdLabel } from '../topology';
import { terminalsOf } from './terminals';

/** Map the toolbar's label-visibility mode to the canvas's three toggles. */
const LABELS: Record<LabelMode, { pos: boolean; conn: boolean; bar: boolean }> = {
  all: { pos: true, conn: true, bar: true },
  topology: { pos: false, conn: true, bar: true },
  none: { pos: false, conn: false, bar: false }
};

export type SubstationEditTarget =
  | { mode: 'create'; voltageKv: number }
  | { mode: 'edit'; instanceId: string; doc: SldDocument };

export interface SubstationDialogProps {
  target: SubstationEditTarget;
  /** The composition, to warn about lines a removed feeder would drop. */
  composite: CompositeDocument;
  /**
   * The finished document (a working copy — never the original). `droppedFeeders`
   * lists the original's feeder ids that no longer exist (edit mode).
   */
  onSave: (doc: SldDocument, droppedFeeders: string[]) => void;
  onCancel: () => void;
}

/** Bus number a bar carries in `data` (shown in the box sub-label). */
interface BarData {
  busId?: number;
}

/**
 * Focused editor for one substation's detailed SLD, in a modal over the
 * composition: grid, bus bars, bays and feeders (the box's terminals), plus its
 * name and voltage. It edits a throwaway working copy with its own undo stack;
 * Save hands the result back for the composition to commit as ONE step, Cancel
 * discards it. A port of the React example's editor, plus the connection tool
 * (bay ↔ bay/bar, and bay → external feeder) from the Svelte one.
 */
export function SubstationDialog({ target, composite, onSave, onCancel }: SubstationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SldCanvasHandle>(null);

  // The working copy and its own history, fixed for the dialog's lifetime.
  const [doc] = useState(() =>
    target.mode === 'edit'
      ? Serializer.fromJSON(Serializer.toJSON(target.doc))
      : new SldDocument({ name: 'New substation', substation: 'New substation', voltageKv: target.voltageKv })
  );
  const [stack] = useState(() => new CommandStack());
  const version = useSldDocument(doc);
  const { canUndo, canRedo } = useCommandStack(stack);
  const run = useCallback((cmd: Command) => stack.execute(cmd, doc), [stack, doc]);

  // Header fields: applied to the working copy on save (it's throwaway, so
  // they needn't be undoable steps of their own).
  const [name, setName] = useState(doc.meta.name ?? '');
  const [kv, setKv] = useState(doc.meta.voltageKv != null ? String(doc.meta.voltageKv) : '');

  const engine = useMemo(
    () => new LayoutEngine({ ...SLD_LAYOUT, busBarLabelAnchor: 'center-left' }, { busBarLabel: barBusIdLabel }),
    []
  );
  // `version` is the load-bearing dep: `doc` mutates in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => engine.layout(doc), [engine, doc, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grid = useMemo(() => new Grid(doc), [doc, version]);
  const empty = doc.grid.rows === 0 || doc.grid.cols === 0;

  const [tool, setTool] = useState<SldTool>('select');
  const [editMode, setEditMode] = useState(true);
  const [positionType, setPositionType] = useState<PositionType>('line');
  const [colorMode, setColorMode] = useState<ColorMode>('by-type');
  const [labelMode, setLabelMode] = useState<LabelMode>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedLane, setSelectedLane] = useState<Lane | null>(null);
  const [ghost, setGhost] = useState<{ cell: Cell; valid: boolean } | null>(null);
  const [boundary, setBoundary] = useState<number | null>(null);
  // Connection tool: the picked source, the rubber-band end, the margin popover.
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [external, setExternal] = useState<{ x: number; y: number; point: Point } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // The canvas measured itself before the modal had its size: refit once open.
    requestAnimationFrame(() => canvasRef.current?.zoomToFit());
  }, []);

  const chooseTool = (t: SldTool) => {
    setTool(t);
    setGhost(null);
    setBoundary(null);
    setPendingFrom(null);
    setCursor(null);
    setExternal(null);
  };

  const nearestBoundary = useCallback(
    (y: number) => {
      let best = 0;
      let bestDist = Infinity;
      for (let at = 0; at <= layout.rows; at++) {
        const d = Math.abs(y - layout.rowBoundaryY(at));
        if (d < bestDist) {
          bestDist = d;
          best = at;
        }
      }
      return best;
    },
    [layout]
  );

  // ── Connection tool ────────────────────────────────────────────────────────
  const pickForConnection = (id: string) => {
    if (!pendingFrom) {
      setPendingFrom(id);
      return;
    }
    if (id === pendingFrom) return;
    const a = doc.getElement(pendingFrom);
    const b = doc.getElement(id);
    if (!a || !b) return setPendingFrom(null);
    // A connection always involves a position; never wire the same pair twice.
    if (a.kind === 'busbar' && b.kind === 'busbar') return;
    if (doc.connectionsOf(pendingFrom).some((c) => c.elementIds().includes(id))) return;
    run(new AddElementCommand(new Connection(newId(), '', { kind: 'element', id: pendingFrom }, { kind: 'element', id })));
    setPendingFrom(null);
    setCursor(null);
  };

  const createExternal = (asset: ExternalAssetKind, label: string) => {
    if (!pendingFrom || !external) return;
    const geo = layout.geometry.get(pendingFrom);
    const cy = geo && 'rect' in geo ? geo.rect.y + geo.rect.height / 2 : external.point.y;
    run(
      new AddElementCommand(
        new Connection(
          newId(),
          '',
          { kind: 'element', id: pendingFrom },
          {
            kind: 'external',
            asset,
            label: label.trim() || nextExternalLabel(doc, asset),
            direction: external.point.y < cy ? 'up' : 'down'
          }
        )
      )
    );
    setPendingFrom(null);
    setCursor(null);
    setExternal(null);
  };

  // ── Canvas events ──────────────────────────────────────────────────────────
  const handleSelect = ({ id, shiftKey }: { id: string; shiftKey: boolean }) => {
    if (tool === 'connection') return pickForConnection(id);
    if (tool !== 'select') return;
    setSelectedLane(null);
    setSelectedIds((prev) => {
      if (!shiftKey) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCanvasMove = ({ point }: { point: Point }) => {
    if (tool === 'position') {
      const cell = layout.cellAt(point);
      setGhost(cell && layout.rowKind(cell.row) === 'slots' ? { cell, valid: grid.isFree(cell) } : null);
    } else if (tool === 'busbar') {
      setBoundary(nearestBoundary(point.y));
    } else if (tool === 'connection' && pendingFrom) {
      setCursor(point);
    }
  };

  const handleCanvasDown = ({ point, event }: { point: Point; event: React.PointerEvent }) => {
    if (tool === 'position') {
      const cell = layout.cellAt(point);
      if (cell && layout.rowKind(cell.row) === 'slots' && grid.isFree(cell)) {
        run(
          new AddPositionCommand(
            Position.of({ label: nextPositionLabel(doc, positionType), type: positionType, row: cell.row, col: cell.col })
          )
        );
      }
    } else if (tool === 'busbar') {
      const at = nearestBoundary(point.y);
      run(new AddBusBarCommand(BusBar.of({ row: at }), at));
    } else if (
      tool === 'connection' &&
      pendingFrom &&
      doc.getElement(pendingFrom)?.kind === 'position' &&
      layout.cellAt(point) === null
    ) {
      // Clicked in the margin from a bay → a feeder (the box's terminal).
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setExternal({ x: event.clientX - rect.left, y: event.clientY - rect.top, point });
    }
  };

  const deleteSelection = () => {
    if (selectedIds.size === 0) return;
    run(new DeleteElementsCommand([...selectedIds]));
    setSelectedIds(new Set());
  };

  /** Scaffold the grid; a fresh substation gets its first bus bar on top. */
  const resetGrid = ({ rows, cols }: { rows: number; cols: number }) => {
    const before = Serializer.toJSON(doc);
    const next = new SldDocument({ ...doc.meta }, { rows: rows + 1, cols });
    next.addElement(BusBar.of({ row: 0, label: 'BB' }));
    run(new SnapshotCommand('New grid', before, Serializer.toJSON(next)));
    setSelectedIds(new Set());
    setSelectedLane(null);
    chooseTool('select');
    // The canvas fitted the empty grid on mount; frame the new one.
    requestAnimationFrame(() => canvasRef.current?.zoomToFit());
  };

  // ── Selected element: label + (bars) bus number ─────────────────────────────
  const selected = selectedIds.size === 1 ? doc.getElement([...selectedIds][0]) : undefined;
  const updateSelected = (patch: { label?: string; busId?: number | null }) => {
    if (!selected) return;
    const before = selected.toJSON();
    const after = { ...before };
    if (patch.label !== undefined) after.label = patch.label;
    if (patch.busId !== undefined) {
      const data = { ...((before.data as BarData | undefined) ?? {}) };
      if (patch.busId == null) delete data.busId;
      else data.busId = patch.busId;
      after.data = Object.keys(data).length ? data : undefined;
    }
    if (JSON.stringify(after) !== JSON.stringify(before)) run(new UpdateElementCommand(before, after));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const original = target.mode === 'edit' ? target.doc : null;
  const dropped = useMemo(() => {
    if (!original) return [];
    const kept = new Set(terminalsOf(doc).map((t) => t.connectionId));
    return terminalsOf(original)
      .map((t) => t.connectionId)
      .filter((id) => !kept.has(id));
    // `version` is the load-bearing dep: `doc` mutates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, doc, version]);
  const droppedLines =
    target.mode === 'edit'
      ? new Set(dropped.flatMap((id) => composite.linesAt(target.instanceId, id).map((l) => l.id))).size
      : 0;

  const save = () => {
    const problems: string[] = [];
    if (!name.trim()) problems.push('Give the substation a name.');
    const kvNum = kv.trim() === '' ? undefined : Number(kv);
    if (kvNum !== undefined && !(kvNum > 0)) problems.push('Voltage must be a positive number of kV.');
    if (doc.busBars().length === 0) problems.push('Add at least one bus bar.');
    problems.push(...doc.validate().map((e) => e.message));
    setErrors(problems);
    if (problems.length) return;
    doc.updateMeta({ name: name.trim(), substation: name.trim(), voltageKv: kvNum });
    onSave(doc, dropped);
  };

  // Rubber band from the picked source to the cursor (connection tool).
  const rubberFrom = pendingFrom ? anchorOf(layout.geometry.get(pendingFrom), cursor) : null;
  const lbl = LABELS[labelMode];
  const kvNum = Number(kv);

  return (
    <dialog
      ref={dialogRef}
      // Esc closes the dialog natively; route it through Cancel instead.
      onCancel={(e) => {
        e.preventDefault();
        if (external) return setExternal(null);
        if (pendingFrom) return chooseTool('connection');
        onCancel();
      }}
      className="m-auto h-[92dvh] w-[94vw] max-w-none overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
          <h2 className="mr-2 text-sm font-semibold">{target.mode === 'create' ? 'New substation' : 'Edit substation'}</h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-44 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Voltage
            <span className="flex items-center rounded-md border border-border">
              <input
                value={kv}
                inputMode="decimal"
                onChange={(e) => setKv(e.target.value)}
                className="w-16 rounded-l-md bg-background px-2 py-1 text-right text-sm text-foreground"
              />
              <span className="px-2 text-xs">kV</span>
            </span>
          </label>

          {selected && (selected.kind === 'busbar' || selected.kind === 'position') && (
            <SelectedFields
              key={`${selected.id}:${version}`}
              kind={selected.kind}
              label={selected.label}
              busId={selected.kind === 'busbar' ? (selected.data as BarData | undefined)?.busId : undefined}
              onLabel={(label) => updateSelected({ label })}
              onBusId={(busId) => updateSelected({ busId })}
            />
          )}

          <button
            type="button"
            title="Close"
            onClick={onCancel}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={containerRef} className="relative min-h-0 flex-1">
          <SldCanvas
            ref={canvasRef}
            doc={doc}
            layout={layout}
            version={version}
            selectedIds={selectedIds}
            cursor={tool !== 'select' ? 'crosshair' : ''}
            panOnDrag={tool === 'select'}
            colorClass={colorMode === 'by-voltage' ? voltageClass(Number.isFinite(kvNum) ? kvNum : undefined) : null}
            showPositionLabels={lbl.pos}
            showConnectionLabels={lbl.conn}
            showBusBarLabels={lbl.bar}
            onSelect={handleSelect}
            onClearSelection={() => {
              setSelectedIds(new Set());
              setSelectedLane(null);
            }}
            onCanvasDown={handleCanvasDown}
            onCanvasMove={handleCanvasMove}
            background={
              editMode && (
                <LaneOverlay
                  layout={layout}
                  selectedLane={selectedLane}
                  onSelectLane={(lane) => {
                    setSelectedLane(lane);
                    setSelectedIds(new Set());
                  }}
                  onAddLane={({ kind }) => run(new AddLaneCommand(kind))}
                />
              )
            }
          >
            {(tool === 'position' || tool === 'busbar') && (
              <GridOverlay layout={layout} highlight={tool === 'position' ? ghost : null} boundaryAt={boundary} />
            )}
            {tool === 'position' && ghost && (
              <GhostPreview rect={layout.cellRect(ghost.cell)} valid={ghost.valid} type={positionType} />
            )}
            {rubberFrom && cursor && (
              <line
                x1={rubberFrom.x}
                y1={rubberFrom.y}
                x2={cursor.x}
                y2={cursor.y}
                className="stroke-primary"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            )}
          </SldCanvas>

          {empty && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="mb-2 text-sm text-muted-foreground">Pick the grid size to start (a bus bar is added on top).</p>
              <div className="inline-block text-left">
                <MatrixCreatorFlyout onCreate={resetGrid} />
              </div>
            </div>
          )}

          {external && (
            <ExternalAssetPopover
              x={external.x}
              y={external.y}
              onConfirm={({ asset, label }) => createExternal(asset, label)}
              onCancel={() => setExternal(null)}
            />
          )}

          <SldToolbar
            userRole="editor"
            editMode={editMode}
            onEditModeChange={setEditMode}
            tool={tool}
            canUndo={canUndo}
            canRedo={canRedo}
            hasSelection={selectedIds.size > 0}
            positionType={positionType}
            colorMode={colorMode}
            labelMode={labelMode}
            onSetTool={chooseTool}
            onSetType={setPositionType}
            onMatrix={resetGrid}
            onDelete={deleteSelection}
            onUndo={() => stack.undo(doc)}
            onRedo={() => stack.redo(doc)}
            onFit={() => canvasRef.current?.zoomToFit()}
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            onSetColorMode={setColorMode}
            onSetLabelMode={setLabelMode}
          />
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-xs">
          <p className="text-muted-foreground">
            Feeders (bay → margin, with the connection tool) are this box's terminals: lines attach to them.
          </p>
          {droppedLines > 0 && (
            <p className="rounded bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-300">
              {droppedLines} line{droppedLines === 1 ? '' : 's'} on removed feeders will be deleted.
            </p>
          )}
          {errors.length > 0 && (
            <ul className="rounded bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">
              {errors.slice(0, 3).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 hover:bg-accent">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90"
            >
              {target.mode === 'create' ? 'Done — place it' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

/** Label (and, for a bar, bus number) of the single selected element; commits on blur / Enter. */
function SelectedFields({
  kind,
  label,
  busId,
  onLabel,
  onBusId
}: {
  kind: 'busbar' | 'position';
  label: string;
  busId: number | undefined;
  onLabel: (label: string) => void;
  onBusId: (busId: number | null) => void;
}) {
  const [text, setText] = useState(label);
  const [bus, setBus] = useState(busId != null ? String(busId) : '');
  const commitBus = () => {
    const t = bus.trim();
    if (t === '') onBusId(null);
    else if (Number.isInteger(Number(t))) onBusId(Number(t));
  };
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') fn();
  };
  return (
    <div className="flex items-center gap-2 border-l border-border pl-3 text-xs text-muted-foreground">
      {kind === 'busbar' ? 'Bus bar' : 'Bay'}
      <input
        value={text}
        placeholder="label"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onLabel(text)}
        onKeyDown={enter(() => onLabel(text))}
        className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
      />
      {kind === 'busbar' && (
        <>
          Bus id
          <input
            value={bus}
            inputMode="numeric"
            placeholder="e.g. 39770"
            onChange={(e) => setBus(e.target.value)}
            onBlur={commitBus}
            onKeyDown={enter(commitBus)}
            className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </>
      )}
    </div>
  );
}

/** Where a rubber band starts: a bay's centre, or the bar point nearest the cursor. */
function anchorOf(geo: ElementGeometry | undefined, cursor: Point | null): Point | null {
  if (!geo) return null;
  if (geo.kind === 'position') return { x: geo.rect.x + geo.rect.width / 2, y: geo.rect.y + geo.rect.height / 2 };
  if (geo.kind === 'busbar') {
    const cx = cursor ? Math.min(Math.max(cursor.x, geo.rect.x), geo.rect.x + geo.rect.width) : geo.rect.x + geo.rect.width / 2;
    return { x: cx, y: geo.rect.y + geo.rect.height / 2 };
  }
  return null;
}
