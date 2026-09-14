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
  newId,
  type ChildLayout,
  type Command,
  type CompositeDocument,
  type CompositeLineKind,
  type CompositeLineLayout,
  type LineVertexJson
} from '@sld-kit/core';
import {
  CompositeCanvas,
  downloadText,
  orthogonalizePolyline,
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

  const engine = useMemo(() => new CompositeLayoutEngine(), []);
  // `version` is the load-bearing dep: `composite` mutates in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => engine.layout(composite), [engine, composite, version]);
  const snapTargets = useMemo(() => engine.externalConnectionTips(layout.children), [engine, layout]);

  const canvasRef = useRef<CompositeCanvasHandle>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [lineKind, setLineKind] = useState<CompositeLineKind>('line');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [dark, setDark] = useState(false);

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
      // orthogonalize preserves the endpoints, so pts[0]/pts[last] === the first
      // and last click — anchor those to a box terminal when they snapped.
      const firstSnap = draft[0].snap;
      const lastSnap = draft[draft.length - 1].snap;
      const pts = orthogonalizePolyline(draft.map((d) => d.point));
      const vertices: LineVertexJson[] = pts.map((p, i) => {
        if (i === 0 && firstSnap) return { kind: 'anchor', instanceId: firstSnap.instanceId, connectionId: firstSnap.connectionId };
        if (i === pts.length - 1 && lastSnap) return { kind: 'anchor', instanceId: lastSnap.instanceId, connectionId: lastSnap.connectionId };
        return { kind: 'point', x: p.x, y: p.y };
      });
      run(new AddLineCommand(new CompositeLine(newId(), vertices, lineKind)));
    }
    setDraft([]);
  }, [draft, lineKind, run]);

  const deleteSelected = useCallback(() => {
    if (!selectedLineId) return;
    run(new RemoveLineCommand(selectedLineId));
    setSelectedLineId(null);
  }, [selectedLineId, run]);

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
    const svg = new CompositeSvgExporter().export(composite, {
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
          selectedLineId={selectedLineId}
          childColorClass={childColorClass}
          lineColorClass={lineColorClass}
          onCanvasPoint={onCanvasPoint}
          onDrawCommit={commitDraw}
          onLineDown={({ id }) => setSelectedLineId(id)}
          onClearSelection={() => setSelectedLineId(null)}
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
