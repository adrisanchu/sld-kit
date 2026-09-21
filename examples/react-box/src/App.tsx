import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AddLineCommand,
  CommandStack,
  CompositeLayoutEngine,
  CompositeLine,
  CompositeSerializer,
  CompositeSvgExporter,
  RemoveLineCommand,
  SetBoxModeCommand,
  TransformChildCommand,
  newId,
  type ChildLayout,
  type Command,
  type CompositeDocument,
  type CompositeLineKind,
  type CompositeLineLayout,
  type LineVertexJson,
  type Point
} from '@sld-kit/core';
import {
  CompositeCanvas,
  downloadText,
  slugify,
  useCommandStack,
  useSldDocument,
  type CompositeCanvasHandle
} from '@sld-kit/react';
import { Boxes, Layers, Maximize, PenLine, MousePointer2, Redo2, Trash2, Undo2 } from 'lucide-react';
import { buildBoxComposite, voltageClass, voltageFill } from './fixture';

const LINE_KINDS: { kind: CompositeLineKind; label: string }[] = [
  { kind: 'line', label: 'Overhead' },
  { kind: 'cable', label: 'Cable' },
  { kind: 'transformer', label: 'Transformer' },
  { kind: 'demand', label: 'Demand' }
];

/** The integer bus id a box shows under its name (from the child's opaque meta.data). */
function busLabel(child: ChildLayout): string | null {
  const id = (child.instance.resolved?.meta.data as { busId?: number } | undefined)?.busId;
  return id != null ? String(id) : null;
}

type Tool = 'select' | 'draw';
type Draft = { point: { x: number; y: number }; snap: { instanceId: string; connectionId: string } | null };

export default function App() {
  const [composite] = useState(buildBoxComposite);
  const [stack] = useState(() => new CommandStack<CompositeDocument>());

  // The document mutates in place, so a version counter — not its identity — is
  // what tells React to re-derive (the hook is generic over CompositeDocument).
  const version = useSldDocument(composite);
  const { canUndo, canRedo } = useCommandStack(stack);

  // The core engine's box mode resolves line endpoints to the active view's
  // frame (box perimeter vs SLD tip) and routes the bends via floating
  // connectors, so box↔detail never strands or bends a line into a box.
  const engine = useMemo(() => new CompositeLayoutEngine(), []);
  // `version` is the load-bearing dep: `composite` mutates in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => engine.layout(composite), [engine, composite, version]);
  const snapTargets = useMemo(() => engine.perimeterTips(layout), [engine, layout]);

  const canvasRef = useRef<CompositeCanvasHandle>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [lineKind, setLineKind] = useState<CompositeLineKind>('line');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [dark, setDark] = useState(false);

  // Box drag: transient setChildTransform during the gesture, one undoable
  // TransformChildCommand committed on pointer-up (mirrors the Svelte editor).
  const dragRef = useRef<{
    id: string;
    startPtr: Point;
    before: { x: number; y: number; angleDeg: number };
  } | null>(null);

  const boxMode = !!composite.meta.boxMode;
  const run = useCallback((cmd: Command<CompositeDocument>) => stack.execute(cmd, composite), [stack, composite]);

  const childColorClass = useCallback((c: ChildLayout) => voltageClass(c.instance.resolved?.meta.voltageKv), []);
  const lineColorClass = useCallback(
    (ln: CompositeLineLayout) => {
      const a = ln.line.vertices.find((v) => v.kind === 'anchor');
      if (a?.kind !== 'anchor') return null;
      const child = layout.children.find((c) => c.instance.id === a.instanceId);
      return child ? voltageClass(child.instance.resolved?.meta.voltageKv) : null;
    },
    [layout]
  );

  const chooseTool = (t: Tool) => {
    setTool(t);
    setDraft([]);
    if (t === 'draw') setSelectedLineId(null);
  };

  const onCanvasPoint = useCallback(
    ({ point, snap }: Draft) => {
      if (tool !== 'draw') return;
      setDraft((d) => [...d, { point, snap }]);
    },
    [tool]
  );

  const commitDraw = useCallback(() => {
    if (draft.length >= 2) {
      // Store the raw clicked path (endpoints anchored to a box terminal when
      // snapped); the composite's `defaultRouting: 'orthogonal'` makes the core
      // layout render it axis-aligned — the same result the draft preview shows.
      const vertices: LineVertexJson[] = draft.map((d, i) =>
        d.snap && (i === 0 || i === draft.length - 1)
          ? { kind: 'anchor', instanceId: d.snap.instanceId, connectionId: d.snap.connectionId }
          : { kind: 'point', x: d.point.x, y: d.point.y }
      );
      run(new AddLineCommand(new CompositeLine(newId(), vertices, lineKind)));
    }
    setDraft([]);
  }, [draft, lineKind, run]);

  const deleteSelected = useCallback(() => {
    if (!selectedLineId) return;
    run(new RemoveLineCommand(selectedLineId));
    setSelectedLineId(null);
  }, [selectedLineId, run]);

  const handleChildDown = useCallback(
    ({ id, event }: { id: string; event: React.PointerEvent }) => {
      if (tool !== 'select') return;
      setSelectedChildId(id);
      setSelectedLineId(null);
      const child = composite.getChild(id);
      const handle = canvasRef.current;
      if (!child || !handle) return;
      dragRef.current = {
        id,
        startPtr: handle.clientToSvg(event.clientX, event.clientY),
        before: { x: child.x, y: child.y, angleDeg: child.angleDeg }
      };
    },
    [tool, composite]
  );

  // Global drag handlers: move transiently, commit one undoable step on release.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      const handle = canvasRef.current;
      if (!d || !handle) return;
      const p = handle.clientToSvg(e.clientX, e.clientY);
      composite.setChildTransform(d.id, d.before.x + (p.x - d.startPtr.x), d.before.y + (p.y - d.startPtr.y), d.before.angleDeg);
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      const child = composite.getChild(d.id);
      if (!child) return;
      const after = { x: child.x, y: child.y, angleDeg: child.angleDeg };
      if (after.x !== d.before.x || after.y !== d.before.y) {
        stack.execute(new TransformChildCommand('Move box', d.id, d.before, after), composite);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [composite, stack]);

  const clearSelection = () => {
    setSelectedLineId(null);
    setSelectedChildId(null);
  };

  const toggleBoxMode = () => run(new SetBoxModeCommand(boxMode, !boxMode));

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  // Escape cancels a draft; Delete removes the selected line.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft([]);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLineId) deleteSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedLineId, deleteSelected]);

  const exportSvg = () => {
    // Export through the same engine the canvas uses, so the SVG carries the
    // box view's floating-connector routing (screen and export stay in lock-step).
    const svg = new CompositeSvgExporter(engine).export(composite, {
      boxMode: true,
      boxFill: (c) => voltageFill(c.instance.resolved?.meta.voltageKv),
      boxSubLabel: busLabel
    });
    downloadText(`${slugify(composite.meta.name)}.svg`, svg, 'image/svg+xml');
  };
  const exportJson = () =>
    downloadText(
      `${slugify(composite.meta.name)}.json`,
      JSON.stringify(CompositeSerializer.toJSON(composite), null, 2),
      'application/json'
    );

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="mr-auto">
          <h1 className="text-sm font-semibold">{composite.meta.name}</h1>
          <p className="text-xs text-muted-foreground">
            @sld-kit/react — grid-level box view · {layout.children.length} buses, {layout.lines.length} lines
          </p>
        </div>
        <button
          type="button"
          onClick={toggleDark}
          className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
        >
          {dark ? 'Light' : 'Dark'}
        </button>
      </header>

      <main className="relative min-h-0 flex-1">
        <CompositeCanvas
          ref={canvasRef}
          layout={layout}
          interactive
          boxMode={boxMode}
          boxSubLabel={busLabel}
          drawMode={tool === 'draw'}
          orthogonal
          snapTargets={snapTargets}
          draftPoints={draft.map((d) => d.point)}
          selectedId={selectedChildId}
          selectedLineId={selectedLineId}
          childColorClass={childColorClass}
          lineColorClass={lineColorClass}
          onChildDown={handleChildDown}
          onCanvasPoint={onCanvasPoint}
          onDrawCommit={commitDraw}
          onLineDown={({ id }) => {
            setSelectedLineId(id);
            setSelectedChildId(null);
          }}
          onClearSelection={clearSelection}
        />

        {/* Minimal floating chrome — the app owns all orchestration; the canvas
            just emits semantic callbacks (see the adapter contract). */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-full border border-border bg-background/85 px-2 py-1 shadow-lg backdrop-blur-sm">
          <ToolButton title="Select" active={tool === 'select'} onClick={() => chooseTool('select')}>
            <MousePointer2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="Draw line" active={tool === 'draw'} onClick={() => chooseTool('draw')}>
            <PenLine className="h-4 w-4" />
          </ToolButton>

          {tool === 'draw' && (
            <div className="mx-1 flex rounded-md border border-border p-0.5 text-xs">
              {LINE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => setLineKind(k.kind)}
                  className={`rounded px-2 py-0.5 transition-colors ${
                    lineKind === k.kind ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}

          <Divider />
          <ToolButton title={boxMode ? 'Show detail' : 'Show boxes'} onClick={toggleBoxMode}>
            {boxMode ? <Layers className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
          </ToolButton>
          <ToolButton title="Delete line" disabled={!selectedLineId} onClick={deleteSelected}>
            <Trash2 className="h-4 w-4" />
          </ToolButton>

          <Divider />
          <ToolButton title="Undo" disabled={!canUndo} onClick={() => stack.undo(composite)}>
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="Redo" disabled={!canRedo} onClick={() => stack.redo(composite)}>
            <Redo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="Fit" onClick={() => canvasRef.current?.zoomToFit()}>
            <Maximize className="h-4 w-4" />
          </ToolButton>

          <Divider />
          <button type="button" onClick={exportSvg} className="rounded px-2 py-1 text-xs hover:bg-accent">
            SVG
          </button>
          <button type="button" onClick={exportJson} className="rounded px-2 py-1 text-xs hover:bg-accent">
            JSON
          </button>
        </div>

        {tool === 'draw' && (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground shadow">
            Click to add points (snap to a box terminal); double-click to finish · Esc to cancel
          </p>
        )}
      </main>
    </div>
  );
}

function ToolButton({
  title,
  active = false,
  disabled = false,
  onClick,
  children
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}
