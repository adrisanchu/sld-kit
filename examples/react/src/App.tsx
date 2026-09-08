import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AddPositionCommand,
  CommandStack,
  DeleteElementsCommand,
  LayoutEngine,
  Position,
  Serializer,
  SvgExporter,
  nextPositionLabel,
  type Cell,
  type Command,
  type PositionType
} from '@sld-kit/core';
import {
  GhostPreview,
  GridOverlay,
  LaneOverlay,
  SldCanvas,
  downloadText,
  slugify,
  useCommandStack,
  useSldDocument,
  type Lane,
  type SldCanvasHandle
} from '@sld-kit/react';
import { Download, Maximize, Moon, Plus, Redo2, Sun, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { buildExample400 } from './fixture';

const POSITION_TYPES: PositionType[] = ['line', 'transformer', 'renewable', 'storage', 'demand'];

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
  // `version` is the load-bearing dep here: `doc` mutates in place, so only the
  // counter tells React the layout must be recomputed. Same for the callbacks
  // below that read the document. exhaustive-deps can't see this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => engine.layout(doc), [engine, doc, version]);

  const canvasRef = useRef<SldCanvasHandle>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedLane, setSelectedLane] = useState<Lane | null>(null);
  const [placing, setPlacing] = useState<PositionType | null>(null);
  const [ghost, setGhost] = useState<{ cell: Cell; valid: boolean } | null>(null);
  const [dark, setDark] = useState(false);

  const run = useCallback((cmd: Command) => stack.execute(cmd, doc), [stack, doc]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
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

  /** While the placement tool is active, track the hovered slot for the ghost. */
  const handleCanvasMove = useCallback(
    ({ point }: { point: { x: number; y: number } }) => {
      if (!placing) return;
      const cell = layout.cellAt(point);
      if (!cell || layout.rowKind(cell.row) !== 'slots') {
        setGhost(null);
        return;
      }
      const occupied = doc.positions().some((p) => p.row === cell.row && p.col === cell.col);
      setGhost({ cell, valid: !occupied });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placing, layout, doc, version]
  );

  const handleCanvasDown = useCallback(
    ({ point }: { point: { x: number; y: number } }) => {
      if (!placing) return;
      const cell = layout.cellAt(point);
      if (!cell || layout.rowKind(cell.row) !== 'slots') return;
      if (doc.positions().some((p) => p.row === cell.row && p.col === cell.col)) return;
      run(
        new AddPositionCommand(
          Position.of({
            label: nextPositionLabel(doc, placing),
            type: placing,
            row: cell.row,
            col: cell.col
          })
        )
      );
      setPlacing(null);
      setGhost(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placing, layout, doc, version, run]
  );

  const deleteSelection = () => {
    if (selectedIds.size === 0) return;
    run(new DeleteElementsCommand([...selectedIds]));
    setSelectedIds(new Set());
  };

  const exportSvg = () => {
    const svg = new SvgExporter().export(doc, { background: true });
    downloadText(`${slugify(doc.meta.name ?? '')}.svg`, svg, 'image/svg+xml');
  };

  const exportJson = () => {
    const json = JSON.stringify(Serializer.toJSON(doc), null, 2);
    downloadText(`${slugify(doc.meta.name ?? '')}.json`, json, 'application/json');
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div className="mr-auto">
          <h1 className="text-sm font-semibold">{doc.meta.name}</h1>
          <p className="text-xs text-muted-foreground">
            @sld-kit/react example — {doc.positions().length} positions, {doc.connections().length} connections
          </p>
        </div>

        <ToolButton title="Zoom out" onClick={() => canvasRef.current?.zoomOut()}>
          <ZoomOut className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Zoom in" onClick={() => canvasRef.current?.zoomIn()}>
          <ZoomIn className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Zoom to fit" onClick={() => canvasRef.current?.zoomToFit()}>
          <Maximize className="h-4 w-4" />
        </ToolButton>

        <span className="mx-1 h-5 w-px bg-border" />

        {POSITION_TYPES.map((type) => (
          <ToolButton
            key={type}
            title={`Add ${type} position`}
            active={placing === type}
            onClick={() => {
              setPlacing((p) => (p === type ? null : type));
              setGhost(null);
            }}
          >
            <Plus className="h-3 w-3" />
            <span
              className={`sld-pos-${type} ml-1 h-2.5 w-2.5 rounded-full`}
              style={{ background: 'var(--sld-pos)' }}
            />
          </ToolButton>
        ))}

        <ToolButton title="Delete selection" onClick={deleteSelection} disabled={selectedIds.size === 0}>
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Undo" onClick={() => stack.undo(doc)} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Redo" onClick={() => stack.redo(doc)} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>

        <span className="mx-1 h-5 w-px bg-border" />

        <ToolButton title="Export SVG" onClick={exportSvg}>
          <Download className="h-4 w-4" />
          <span className="ml-1 text-xs">SVG</span>
        </ToolButton>
        <ToolButton title="Export JSON" onClick={exportJson}>
          <Download className="h-4 w-4" />
          <span className="ml-1 text-xs">JSON</span>
        </ToolButton>
        <ToolButton title="Toggle dark mode" onClick={toggleDark}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </ToolButton>
      </header>

      <main className="min-h-0 flex-1">
        <SldCanvas
          ref={canvasRef}
          doc={doc}
          layout={layout}
          version={version}
          selectedIds={selectedIds}
          cursor={placing ? 'crosshair' : ''}
          panOnDrag={!placing}
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
              onAddLane={({ kind }) => {
                // Grid growth is a document mutation; kept out of scope for the
                // Phase 1 example, which only demonstrates the overlay wiring.
                console.log('add lane', kind);
              }}
            />
          }
        >
          {placing && <GridOverlay layout={layout} highlight={ghost} />}
          {placing && ghost && <GhostPreview rect={layout.cellRect(ghost.cell)} valid={ghost.valid} type={placing} />}
        </SldCanvas>
      </main>
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  disabled,
  active,
  children
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 items-center rounded-md border border-border px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );
}
