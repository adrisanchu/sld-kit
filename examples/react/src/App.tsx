import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AddBusBarCommand,
  AddLaneCommand,
  AddPositionCommand,
  BusBar,
  CommandStack,
  DeleteElementsCommand,
  Grid,
  LayoutEngine,
  Position,
  Serializer,
  SldDocument,
  SnapshotCommand,
  SvgExporter,
  nextPositionLabel,
  type Cell,
  type Command,
  type Point,
  type PositionType
} from '@sld-kit/core';
import {
  GhostPreview,
  GridOverlay,
  LaneOverlay,
  SldCanvas,
  SldToolbar,
  downloadText,
  slugify,
  useCommandStack,
  useSldDocument,
  type ColorMode,
  type LabelMode,
  type Lane,
  type SldCanvasHandle,
  type SldTool
} from '@sld-kit/react';
import { Moon, Sun } from 'lucide-react';
import { buildExample400 } from './fixture';
import { Overview } from './Overview';

/** Map the toolbar's label-visibility mode to the canvas's three toggles. */
const LABELS: Record<LabelMode, { pos: boolean; conn: boolean; bar: boolean }> = {
  all: { pos: true, conn: true, bar: true },
  topology: { pos: false, conn: true, bar: true },
  none: { pos: false, conn: false, bar: false }
};

/** Voltage bucket → the `sld-volt-*` class the app's CSS maps to `--sld-pos`. */
function voltageClass(kv: number | undefined): string {
  if (kv != null && kv >= 400) return 'sld-volt-hv';
  if (kv != null && kv >= 200) return 'sld-volt-mv';
  return 'sld-volt-unknown';
}

export default function App() {
  // The document and the stack are stable for the life of the editor; every
  // mutation goes through a Command so undo/redo can never desync.
  const [doc] = useState(buildExample400);
  const [stack] = useState(() => new CommandStack());

  // The document mutates in place, so a version counter — not its identity —
  // is what tells React to re-derive.
  const version = useSldDocument(doc);
  const { canUndo, canRedo } = useCommandStack(stack);

  const engine = useMemo(() => new LayoutEngine(), []);
  // `version` is the load-bearing dep here and in the callbacks below: `doc`
  // mutates in place, so only the counter tells React to recompute. eslint's
  // exhaustive-deps rule can't see that.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => engine.layout(doc), [engine, doc, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grid = useMemo(() => new Grid(doc), [doc, version]);

  const canvasRef = useRef<SldCanvasHandle>(null);

  const [tool, setTool] = useState<SldTool>('select');
  const [positionType, setPositionType] = useState<PositionType>('line');
  const [colorMode, setColorMode] = useState<ColorMode>('by-type');
  const [labelMode, setLabelMode] = useState<LabelMode>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedLane, setSelectedLane] = useState<Lane | null>(null);
  const [ghost, setGhost] = useState<{ cell: Cell; valid: boolean } | null>(null);
  const [boundary, setBoundary] = useState<number | null>(null);
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<'single' | 'overview'>('single');

  const run = useCallback((cmd: Command) => stack.execute(cmd, doc), [stack, doc]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const chooseTool = (t: SldTool) => {
    setTool(t);
    setGhost(null);
    setBoundary(null);
  };

  const handleSelect = useCallback(({ id, shiftKey }: { id: string; shiftKey: boolean }) => {
    setSelectedLane(null);
    setSelectedIds((prev) => {
      if (!shiftKey) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Nearest row-boundary index to a y, for the bus-bar insertion tool. */
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

  const handleCanvasMove = useCallback(
    ({ point }: { point: Point }) => {
      if (tool === 'position') {
        const cell = layout.cellAt(point);
        setGhost(cell && layout.rowKind(cell.row) === 'slots' ? { cell, valid: grid.isFree(cell) } : null);
      } else if (tool === 'busbar') {
        setBoundary(nearestBoundary(point.y));
      }
    },
    [tool, layout, grid, nearestBoundary]
  );

  const handleCanvasDown = useCallback(
    ({ point }: { point: Point }) => {
      if (tool === 'position') {
        const cell = layout.cellAt(point);
        if (cell && grid.isFree(cell)) {
          run(
            new AddPositionCommand(
              Position.of({
                label: nextPositionLabel(doc, positionType),
                type: positionType,
                row: cell.row,
                col: cell.col
              })
            )
          );
        }
      } else if (tool === 'busbar') {
        const at = nearestBoundary(point.y);
        run(new AddBusBarCommand(BusBar.of({ row: at }), at));
      }
      // 'connection' is deferred: it needs multi-step source→target endpoint
      // picking and the ExternalAssetPopover flow (editor orchestration).
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool, layout, grid, doc, version, positionType, nearestBoundary, run]
  );

  const deleteSelection = () => {
    if (selectedIds.size === 0) return;
    run(new DeleteElementsCommand([...selectedIds]));
    setSelectedIds(new Set());
  };

  const resetGrid = ({ rows, cols }: { rows: number; cols: number }) => {
    const before = Serializer.toJSON(doc);
    const after = Serializer.toJSON(new SldDocument({ ...doc.meta }, { rows, cols }));
    run(new SnapshotCommand('New grid', before, after));
    setSelectedIds(new Set());
    setSelectedLane(null);
    chooseTool('select');
  };

  const exportSvg = () => {
    const svg = new SvgExporter().export(doc, { background: true });
    downloadText(`${slugify(doc.meta.name ?? '')}.svg`, svg, 'image/svg+xml');
  };
  const exportJson = () => {
    const json = JSON.stringify(Serializer.toJSON(doc), null, 2);
    downloadText(`${slugify(doc.meta.name ?? '')}.json`, json, 'application/json');
  };

  const colorClass = colorMode === 'by-voltage' ? voltageClass(doc.meta.voltageKv) : null;
  const lbl = LABELS[labelMode];

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="mr-auto">
          <h1 className="text-sm font-semibold">{view === 'single' ? doc.meta.name : 'Example — overview'}</h1>
          <p className="text-xs text-muted-foreground">
            {view === 'single'
              ? `@sld-kit/react example — ${doc.positions().length} positions, ${doc.connections().length} connections`
              : '@sld-kit/react example — composite of two levels'}
          </p>
        </div>

        {/* Segmented view toggle: the single-diagram editor vs the composite overview. */}
        <div className="flex rounded-md border border-border p-0.5 text-sm">
          {(['single', 'overview'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-2 py-0.5 transition-colors ${
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'single' ? 'Editor' : 'Overview'}
            </button>
          ))}
        </div>

        <button
          type="button"
          title="Toggle dark mode"
          onClick={toggleDark}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-accent"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      {view === 'overview' ? (
        <main className="min-h-0 flex-1">
          <Overview />
        </main>
      ) : (
        <main className="relative min-h-0 flex-1">
          <SldCanvas
            ref={canvasRef}
            doc={doc}
            layout={layout}
            version={version}
            selectedIds={selectedIds}
            cursor={tool !== 'select' ? 'crosshair' : ''}
            panOnDrag={tool === 'select'}
            colorClass={colorClass}
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
              <LaneOverlay
                layout={layout}
                selectedLane={selectedLane}
                onSelectLane={(lane) => {
                  setSelectedLane(lane);
                  setSelectedIds(new Set());
                }}
                onAddLane={({ kind }) => run(new AddLaneCommand(kind))}
              />
            }
          >
            {(tool === 'position' || tool === 'busbar') && (
              <GridOverlay layout={layout} highlight={tool === 'position' ? ghost : null} boundaryAt={boundary} />
            )}
            {tool === 'position' && ghost && (
              <GhostPreview rect={layout.cellRect(ghost.cell)} valid={ghost.valid} type={positionType} />
            )}
          </SldCanvas>

          <SldToolbar
            userRole="editor"
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
            onExportSvg={exportSvg}
            onExportJson={exportJson}
            onSetColorMode={setColorMode}
            onSetLabelMode={setLabelMode}
          />
        </main>
      )}
    </div>
  );
}
