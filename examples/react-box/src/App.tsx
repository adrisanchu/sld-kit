import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AddChildCommand,
  RemoveChildCommand,
  CommandStack,
  CompositeDocument,
  CompositeLayoutEngine,
  DiagramInstance,
  CompositeSerializer,
  CompositeSvgExporter,
  LayoutEngine,
  BatchCommand,
  RemoveLineCommand,
  Serializer,
  SnapshotCommand,
  ChildDocumentCommand,
  Position,
  UpdateElementCommand,
  effectiveState,
  SWITCH_OPEN_CONNECTION_FORMAT,
  SLD_LAYOUT,
  SetAutoFacingCommand,
  SetBoxModeCommand,
  SetLineDataCommand,
  SetPortDirectionCommand,
  UpdateLineKindCommand,
  TransformChildCommand,
  newId,
  type BoxSection,
  type ChildLayout,
  type Command,
  type ElementFormat,
  type SldElement,
  type SldDocument,
  type CompositeLineKind,
  type CompositeLineLayout,
  type ExternalDirection,
  type Point,
  type Rect
} from '@sld-kit/core';
import {
  ChildDiagramView,
  CompositeCanvas,
  downloadText,
  slugify,
  useCommandStack,
  useSldDocument,
  type CompositeCanvasHandle
} from '@sld-kit/react';
import {
  ArrowLeft,
  Boxes,
  Layers,
  Magnet,
  Maximize,
  Move,
  PenLine,
  Plus,
  Pointer,
  Redo2,
  SquarePen,
  Trash2,
  Undo2
} from 'lucide-react';
import { buildBoxComposite, ratingLabels, voltageClass, voltageFill } from './fixture';
import { barBusIdLabel, boxSplit, openFeeders, sectionLabel } from './topology';
import { BayPicker } from './editor/BayPicker';
import { LinePopover } from './editor/LinePopover';
import { TargetFx, TargetPin, type Target } from './editor/TargetFx';
import type { AnchorFn } from './editor/Floating';
import type { LineRatingData } from './fixture';
import { SubstationDialog, type SubstationEditTarget } from './editor/SubstationDialog';
import {
  barFor,
  boxAt,
  dedupe,
  draftCommand,
  draftProblem,
  freeTerminals,
  freeTips,
  sameVertex,
  type DraftVertex
} from './editor/terminals';

const LINE_KINDS: { kind: CompositeLineKind; label: string }[] = [
  { kind: 'line', label: 'Overhead' },
  { kind: 'cable', label: 'Cable' },
  { kind: 'transformer', label: 'Transformer' },
  { kind: 'demand', label: 'Demand' }
];

/**
 * The bus id(s) a box shows under its name, derived from the child's topology:
 * each bar carries its own id, and bars joined through closed switches (e.g. a
 * double bus with the coupler closed) share one box — `39770 / 39771`. A split
 * child labels each section box with its own ids.
 */
function busLabel(child: ChildLayout, section?: BoxSection): string | null {
  return sectionLabel(child.instance.resolved, section);
}

/**
 * - `operate`: interact with the network — click a substation to open it (box
 *   view: expands in place; detail view: flies in), then click its switches.
 * - `move`: arrange — drag substations, select/delete lines, pin feeder sides.
 * - `draw`: add lines.
 */
type Tool = 'operate' | 'move' | 'draw';
/** The bay picker opened by a drawn end landing on a box body. */
type Picker = { point: Point; instanceId: string; sectionKey: string | null };

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Placement grid for a new substation (composite units). */
const PLACE_SNAP = 20;
const snap = (v: number) => Math.round(v / PLACE_SNAP) * PLACE_SNAP;

export default function App() {
  const [composite] = useState(buildBoxComposite);
  const [stack] = useState(() => new CommandStack<CompositeDocument>());

  // The document mutates in place, so a version counter — not its identity — is
  // what tells React to re-derive (the hook is generic over CompositeDocument).
  const version = useSldDocument(composite);
  const { canUndo, canRedo } = useCommandStack(stack);

  // The core engine's box mode resolves line endpoints to the active view's
  // frame (box perimeter vs SLD tip) and routes the bends via floating
  // connectors, so box↔detail never strands or bends a line into a box. The
  // `lineLabels` resolver formats each line's ratings (folded into `line.data`
  // by the fixture) — placed by the core layout, so screen and export agree.
  // The detail-view child engine labels each bar with its bus id, placed left of
  // the bar so a long label never runs into a bay's stem. `boxSections` splits a
  // substation into one box per bus section (e.g. a double bus with its coupler
  // open), computed from live switch states in `topology.ts`.
  const engine = useMemo(
    () =>
      new CompositeLayoutEngine(
        new LayoutEngine({ ...SLD_LAYOUT, busBarLabelAnchor: 'center-left' }, { busBarLabel: barBusIdLabel }),
        undefined,
        undefined,
        { lineLabels: ratingLabels, boxSections: boxSplit }
      ),
    []
  );
  const [tool, setTool] = useState<Tool>('move');
  // Operate: the substation the user opened (box view: expanded in place;
  // detail view: flown into). Its positions are live — a click toggles them.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const operating = tool === 'operate';
  // In box view an opened substation is expanded in place by the core layout
  // (its detail drawing, centred on its box); everything else stays a box.
  const expanded = operating && composite.meta.boxMode && focusedId ? [focusedId] : [];
  const expandedKey = expanded.join();

  // `version` is the load-bearing dep: `composite` mutates in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => engine.layout(composite, { expanded }), [engine, composite, version, expandedKey]);

  const canvasRef = useRef<CompositeCanvasHandle>(null);

  const [lineKind, setLineKind] = useState<CompositeLineKind>('line');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftVertex[]>([]);
  const [picker, setPicker] = useState<Picker | null>(null);
  // Transient draw feedback (e.g. "that feeder already has a line").
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 2500);
    return () => clearTimeout(t);
  }, [hint]);
  // Last pointer-down position (viewport px), to anchor popovers.
  const lastPointer = useRef({ x: 0, y: 0 });
  // The box under the pointer (Operate / Move): drawn as a lock-on frame.
  const [hover, setHover] = useState<Target | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  // The substation editor (create mode here; edit mode arrives with phase 3),
  // then placement: the finished substation follows the pointer as a ghost
  // until a click drops it. Nothing touches the composite until that click.
  const [editor, setEditor] = useState<SubstationEditTarget | null>(null);
  const [placing, setPlacing] = useState<SldDocument | null>(null);
  const [ghostAt, setGhostAt] = useState<Point | null>(null);
  const [lastKv, setLastKv] = useState(220);
  // Where the selected line's editor popover sits (container px); null = closed.
  // The selected line's editor popover, tethered to the clicked point (world); null = closed.
  const [lineEditAt, setLineEditAt] = useState<Point | null>(null);
  const lastChildDown = useRef<{ id: string; t: number } | null>(null);
  // `openEdit` is declared further down; the drag handler reaches it through a ref.
  const openEditRef = useRef<(id: string) => void>(() => {});
  // The click trailing a placing pointer-down must not reach the canvas (Draw
  // would read it as a line point).
  const swallowClick = useRef(false);
  const [dark, setDark] = useState(false);

  // Box drag: transient setChildTransform during the gesture, one undoable
  // TransformChildCommand committed on pointer-up (mirrors the Svelte editor).
  const dragRef = useRef<{
    id: string;
    startPtr: Point;
    before: { x: number; y: number; angleDeg: number };
  } | null>(null);

  const boxMode = !!composite.meta.boxMode;
  const autoFacing = !!composite.meta.autoFacing;
  const run = useCallback((cmd: Command<CompositeDocument>) => stack.execute(cmd, composite), [stack, composite]);

  const childColorClass = useCallback((c: ChildLayout) => voltageClass(c.instance.resolved?.meta.voltageKv), []);

  // De-energised feeder connections (their bay is open, or cut off from every
  // bar), by object identity — element ids can repeat across children.
  const openConnections = useMemo(() => {
    const out = new Set<SldElement>();
    for (const c of layout.children) {
      const doc = c.instance.resolved;
      if (!doc) continue;
      for (const id of openFeeders(doc)) {
        const el = doc.getElement(id);
        if (el) out.add(el);
      }
    }
    return out;
  }, [layout]);
  // Core already greys + dashes every connection that *directly* touches an open
  // position. This resolver only extends that look to feeders the topology cuts
  // off further away (same format, so both read alike). Core applies it to the
  // child's own connection (detail view) and to every composite line anchored to
  // it (both views); the export gets the same function as its theme resolver.
  const formatResolver = useCallback(
    (el: SldElement): ElementFormat | undefined =>
      openConnections.has(el) ? SWITCH_OPEN_CONNECTION_FORMAT : undefined,
    [openConnections]
  );
  const lineColorClass = useCallback(
    (ln: CompositeLineLayout) => {
      const a = ln.line.vertices.find((v) => v.kind === 'anchor');
      if (a?.kind !== 'anchor') return null;
      const child = layout.children.find((c) => c.instance.id === a.instanceId);
      return child ? voltageClass(child.instance.resolved?.meta.voltageKv) : null;
    },
    [layout]
  );

  const chooseTool = useCallback((t: Tool) => {
    setTool(t);
    setDraft([]);
    setPicker(null);
    setPlacing(null);
    setGhostAt(null);
    if (t !== 'operate') setFocusedId(null); // leaving operate closes the open substation
    if (t !== 'move') {
      setSelectedLineId(null);
      setSelectedChildId(null);
    }
  }, []);

  // ── Draw: lines join bays (feeder terminals), one line per terminal ───────
  // Only free terminals are snap targets. Ending on a box body opens the bay
  // picker (a free feeder, or a new bay grown on commit). An anchored end after
  // the start finishes the line; a double-click finishes a free lead (demand).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapTargets = useMemo(() => freeTips(layout, composite), [layout, composite, version]);

  /** Commit a draft as ONE undoable step (new bays + the line), or explain why not. */
  const commit = useCallback(
    (vertices: DraftVertex[]) => {
      const d = dedupe(vertices);
      if (d.length < 2) return setDraft([]);
      const problem = draftProblem(composite, d);
      if (problem) {
        setHint(problem);
        setDraft(d.slice(0, -1)); // drop the offending end, keep drawing
        return;
      }
      // Store the raw clicked path; the composite's `defaultRouting: 'orthogonal'`
      // makes the core layout render it axis-aligned — as the draft preview shows.
      run(draftCommand(d, lineKind, newId(), (id, cmd) => new ChildDocumentCommand(id, cmd)));
      setDraft([]);
    },
    [composite, lineKind, run]
  );

  const addVertex = useCallback(
    (v: DraftVertex) => {
      const last = draft[draft.length - 1];
      if (last && sameVertex(last, v)) return; // the 2nd click of a double-click
      const next = [...draft, v];
      if (v.kind !== 'point' && draft.length >= 1) commit(next);
      else setDraft(next);
    },
    [draft, commit]
  );

  const onCanvasPoint = useCallback(
    ({ point, snap }: { point: Point; snap: { instanceId: string; connectionId: string } | null }) => {
      if (tool !== 'draw') return;
      if (picker) return setPicker(null); // a click away dismisses the picker
      if (snap) return addVertex({ kind: 'anchor', point, ...snap });
      const hit = boxAt(layout, point, boxMode);
      if (hit) {
        setPicker({
          point,
          instanceId: hit.child.instance.id,
          sectionKey: hit.sectionKey
        });
        return;
      }
      addVertex({ kind: 'point', point });
    },
    [tool, picker, layout, boxMode, addVertex]
  );

  const commitDraw = useCallback(() => {
    if (picker) return; // the picker decides how this end connects
    commit(draft);
  }, [picker, draft, commit]);

  const pickerChild = picker ? layout.children.find((c) => c.instance.id === picker.instanceId) : undefined;
  const pickerTerminals = pickerChild && picker ? freeTerminals(composite, pickerChild, picker.sectionKey) : [];
  const pickerBar =
    pickerChild?.instance.resolved && picker ? barFor(pickerChild.instance.resolved, picker.sectionKey) : null;

  const pickTerminal = (connectionId: string) => {
    if (!picker) return;
    const tip = layout.snapTips.find((t) => t.instanceId === picker.instanceId && t.connectionId === connectionId);
    setPicker(null);
    addVertex({ kind: 'anchor', point: tip?.point ?? picker.point, instanceId: picker.instanceId, connectionId });
  };
  const pickNewBay = () => {
    if (!picker || !pickerBar) return;
    setPicker(null);
    addVertex({ kind: 'newBay', point: picker.point, instanceId: picker.instanceId, barId: pickerBar });
  };

  /**
   * Delete the selected line, or the selected substation together with every
   * line anchored to it — ONE undoable step either way (undo restores the box,
   * its resolved diagram and its lines).
   */
  const deleteSelected = useCallback(() => {
    if (selectedLineId) {
      run(new RemoveLineCommand(selectedLineId));
      setSelectedLineId(null);
      return;
    }
    if (!selectedChildId) return;
    const id = selectedChildId;
    run(
      new BatchCommand('Delete substation', [
        ...composite.linesAt(id).map((l) => new RemoveLineCommand(l.id)),
        new RemoveChildCommand(id)
      ])
    );
    setSelectedChildId(null);
    if (focusedId === id) setFocusedId(null);
    // A draft anchored to the deleted box can't finish.
    setDraft((d) => (d.some((v) => v.kind !== 'point' && v.instanceId === id) ? [] : d));
  }, [selectedLineId, selectedChildId, focusedId, composite, run]);

  const handleChildDown = useCallback(
    ({ id, event }: { id: string; event: React.PointerEvent }) => {
      if (tool !== 'move') return;
      setSelectedChildId(id);
      setSelectedLineId(null);
      // A second press on the same box within the double-click window opens
      // its editor instead of starting another drag (the canvas emits presses
      // only, so the app times them).
      const last = lastChildDown.current;
      lastChildDown.current = { id, t: event.timeStamp };
      if (last && last.id === id && event.timeStamp - last.t < 350) {
        lastChildDown.current = null;
        dragRef.current = null;
        openEditRef.current(id);
        return;
      }
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
      composite.setChildTransform(
        d.id,
        d.before.x + (p.x - d.startPtr.x),
        d.before.y + (p.y - d.startPtr.y),
        d.before.angleDeg
      );
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
    setLineEditAt(null);
  };

  const editedLine = selectedLineId ? composite.getLine(selectedLineId) : undefined;
  const editedLineLayout = editedLine ? layout.lines.find((l) => l.line.id === editedLine.id) : undefined;

  /** Kind + ratings of the selected line as ONE undoable step (no-op when unchanged). */
  const applyLineEdit = (kind: CompositeLineKind, data: LineRatingData | undefined) => {
    const line = selectedLineId ? composite.getLine(selectedLineId) : undefined;
    if (!line) return;
    const steps: Command<CompositeDocument>[] = [];
    if (kind !== line.kind) steps.push(new UpdateLineKindCommand(line.id, line.kind, kind));
    if (JSON.stringify(data) !== JSON.stringify(line.data))
      steps.push(new SetLineDataCommand(line.id, line.data, data));
    if (steps.length) run(new BatchCommand('Edit line', steps));
    setLineEditAt(null);
  };

  // ── Operate: open a substation, click its switches ─────────────────────────
  // Reuses the adapter's explore mode (no new adapter API). The camera follows
  // the focus *after* the re-layout, so in box view it flies onto the expanded
  // drawing's real frame while the adapter morphs the box into it.
  const focusChild = ({ id }: { id: string }) => setFocusedId(id);
  const blur = useCallback(() => setFocusedId(null), []);
  const flownRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusedId === flownRef.current) return;
    flownRef.current = focusedId;
    if (focusedId) {
      const child = layout.children.find((c) => c.instance.id === focusedId);
      if (child) canvasRef.current?.flyTo(child.worldBounds, { durationMs: 450 });
    } else {
      canvasRef.current?.flyToFit({ durationMs: 450 });
    }
  }, [focusedId, layout]);
  // Toggle a position's first-class `state` as ONE step of the composite
  // history (undo/redo work across the box↔detail toggle); the composite
  // re-layouts, so the box view re-splits / merges from the new state.
  const toggleSwitch = ({ instanceId, elementId }: { instanceId: string; elementId: string }) => {
    const el = composite.getChild(instanceId)?.resolved?.getElement(elementId);
    if (!(el instanceof Position)) return;
    const before = el.toJSON();
    const state = effectiveState(el) === 'open' ? 'closed' : 'open';
    run(new ChildDocumentCommand(instanceId, new UpdateElementCommand(before, { ...before, state })));
  };

  const toggleBoxMode = () => {
    setFocusedId(null);
    run(new SetBoxModeCommand(boxMode, !boxMode));
  };
  const toggleAutoFacing = () => run(new SetAutoFacingCommand(autoFacing, !autoFacing));

  // Pin a feeder's exit side (the canvas cycles it clockwise on click). The pin
  // beats auto-facing; undo clears it back to auto/authored. `before` is the
  // current pin so undo restores exactly.
  const pinPortDirection = useCallback(
    ({ instanceId, connectionId, side }: { instanceId: string; connectionId: string; side: ExternalDirection }) => {
      const before = composite.getChild(instanceId)?.portDirections[connectionId];
      run(new SetPortDirectionCommand('Pin feeder side', instanceId, connectionId, before, side));
    },
    [composite, run]
  );

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  // ── New substation: design it, then place it ───────────────────────────────
  const openCreate = () => {
    setDraft([]);
    setPicker(null);
    setEditor({ mode: 'create', voltageKv: lastKv });
  };
  /** Open an existing substation's detailed SLD in the editor dialog. */
  const openEdit = (instanceId: string) => {
    const doc = composite.getChild(instanceId)?.resolved;
    if (!doc) return;
    setPicker(null);
    setEditor({ mode: 'edit', instanceId, doc });
  };
  openEditRef.current = openEdit;

  const onEditorSave = (doc: SldDocument, droppedFeeders: string[]) => {
    if (editor?.mode === 'create') {
      if (doc.meta.voltageKv != null) setLastKv(doc.meta.voltageKv);
      setPlacing(doc);
      setGhostAt(null);
      if (tool === 'operate') chooseTool('move');
    } else if (editor?.mode === 'edit') {
      // ONE composite step: drop the lines whose feeder was removed, then swap
      // the child's contents for the edited copy. Undo restores both. Note:
      // instances sharing a library id share this document (see #18).
      const { instanceId } = editor;
      const child = composite.getChild(instanceId)?.resolved;
      if (child) {
        const lineIds = new Set(droppedFeeders.flatMap((id) => composite.linesAt(instanceId, id).map((l) => l.id)));
        run(
          new BatchCommand('Edit substation', [
            ...[...lineIds].map((id) => new RemoveLineCommand(id)),
            new ChildDocumentCommand(
              instanceId,
              new SnapshotCommand('Edit substation', Serializer.toJSON(child), Serializer.toJSON(doc))
            )
          ])
        );
        if (selectedLineId && lineIds.has(selectedLineId)) setSelectedLineId(null);
        // A draft anchored to a dropped feeder can't finish: start over.
        if (
          draft.some(
            (v) => v.kind === 'anchor' && v.instanceId === instanceId && droppedFeeders.includes(v.connectionId)
          )
        ) {
          setDraft([]);
        }
      }
    }
    setEditor(null);
  };

  /**
   * Lay the substation being placed out alone, with the canvas's own engine
   * and display flags, so the ghost is exactly what the click will drop.
   */
  const layoutGhost = useCallback(
    (doc: SldDocument, x: number, y: number): ChildLayout | null => {
      const tmp = new CompositeDocument({ boxMode, defaultRouting: composite.meta.defaultRouting, autoFacing });
      const inst = new DiagramInstance('ghost', 'ghost', x, y, 0);
      inst.resolved = doc;
      inst.resolveAttempted = true;
      tmp.addChild(inst);
      return engine.layout(tmp).children[0] ?? null;
    },
    [engine, boxMode, autoFacing, composite]
  );
  // The child-local centre, so the pointer holds the ghost by its middle.
  const ghostCentre = useMemo(() => {
    const c = placing ? layoutGhost(placing, 0, 0) : null;
    return c ? { x: c.worldBounds.x + c.worldBounds.width / 2, y: c.worldBounds.y + c.worldBounds.height / 2 } : null;
  }, [placing, layoutGhost]);
  const ghostPos =
    placing && ghostAt && ghostCentre
      ? { x: snap(ghostAt.x - ghostCentre.x), y: snap(ghostAt.y - ghostCentre.y) }
      : null;
  const ghost = useMemo(
    () => (placing && ghostPos ? layoutGhost(placing, ghostPos.x, ghostPos.y) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placing, ghostPos?.x, ghostPos?.y, layoutGhost]
  );

  /** Drop the ghost: ONE undoable step adds the substation where it stands. */
  const place = () => {
    if (!placing || !ghostPos) return;
    // A fresh library id: this substation exists only in this composition.
    const inst = new DiagramInstance(newId(), newId(), ghostPos.x, ghostPos.y, 0);
    inst.resolved = placing;
    inst.resolveAttempted = true;
    run(new AddChildCommand(inst));
    setPlacing(null);
    setGhostAt(null);
    if (tool === 'move') setSelectedChildId(inst.id);
  };
  /**
   * Hover affordance for Operate / Move: lock onto the box (or section box)
   * under the pointer. Off while a button is held (dragging / panning), and on
   * the substation already opened in Operate (its switches are the targets).
   */
  const trackHover = (e: React.PointerEvent) => {
    const handle = canvasRef.current;
    const hit =
      (tool === 'operate' || tool === 'move') && e.buttons === 0 && handle
        ? boxAt(layout, handle.clientToSvg(e.clientX, e.clientY), boxMode)
        : null;
    const next: Target | null =
      hit && !(operating && hit.child.instance.id === focusedId)
        ? {
            key: `${hit.child.instance.id}:${hit.sectionKey ?? ''}`,
            rect: hit.rect,
            colorClass: voltageClass(hit.child.instance.resolved?.meta.voltageKv),
            variant: 'lock'
          }
        : null;
    // Same box, same place → keep the object, so nothing re-renders per move.
    setHover((prev) => (prev && next && prev.key === next.key && sameRect(prev.rect, next.rect) ? prev : next));
  };

  /**
   * Tether a popover to a world point: maps it to viewport px through the
   * live view (the canvas's `clientToSvg` is affine, so two samples invert it),
   * or `null` once it leaves the visible canvas — the popover then closes.
   */
  const worldAnchor =
    (p: Point): AnchorFn =>
    () => {
      const h = canvasRef.current;
      const box = canvasWrapRef.current?.getBoundingClientRect();
      if (!h || !box) return null;
      const a = h.clientToSvg(0, 0);
      const b = h.clientToSvg(100, 100);
      const x = (p.x - a.x) / ((b.x - a.x) / 100);
      const y = (p.y - a.y) / ((b.y - a.y) / 100);
      return x < box.left || x > box.right || y < box.top || y > box.bottom ? null : { x, y };
    };

  // The selected box wears the same lock-on frame as the hover, turned up
  // (the canvas's own selection frame is off): one perimeter, two intensities.
  const selectedLayout = selectedChildId ? layout.children.find((c) => c.instance.id === selectedChildId) : undefined;
  const selectedTarget: Target | null = selectedLayout
    ? {
        key: selectedLayout.instance.id,
        rect: selectedLayout.worldBounds,
        colorClass: voltageClass(selectedLayout.instance.resolved?.meta.voltageKv),
        variant: 'lock'
      }
    : null;
  const hoverOnSelected = !!hover && !!selectedChildId && hover.key.startsWith(`${selectedChildId}:`);

  const isOnCanvas = (target: EventTarget) => target instanceof Node && !!canvasWrapRef.current?.contains(target);

  // Escape cancels a draft; Delete removes the selected line.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (editor) return; // the dialog owns the keyboard while open
      if (e.key === 'Escape') {
        setDraft([]);
        setPicker(null);
        setLineEditAt(null);
        setPlacing(null);
        setGhostAt(null);
        blur();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedLineId || selectedChildId)) deleteSelected();
      // Tool shortcuts (no modifiers): O operate, V move, L draw.
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const next = ({ o: 'operate', v: 'move', l: 'draw' } as const)[e.key.toLowerCase() as 'o' | 'v' | 'l'];
        if (next) chooseTool(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedLineId, selectedChildId, deleteSelected, blur, chooseTool, editor]);

  const exportSvg = () => {
    // Export through the same engine the canvas uses, so the SVG carries the
    // box view's floating-connector routing (screen and export stay in lock-step).
    const svg = new CompositeSvgExporter(engine).export(composite, {
      boxMode: true,
      boxFill: (c) => voltageFill(c.instance.resolved?.meta.voltageKv),
      boxSubLabel: busLabel,
      theme: { resolveElementFormat: formatResolver }
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
        {/* Deployed under the landing site (/sld-kit/box/): link back up to it. */}
        {import.meta.env.BASE_URL !== '/' && (
          <a
            href={`${import.meta.env.BASE_URL}../`}
            className="mr-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            sld-kit
          </a>
        )}
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

      <main
        ref={mainRef}
        className="relative min-h-0 flex-1"
        onPointerDownCapture={(e) => {
          lastPointer.current = { x: e.clientX, y: e.clientY };
          // Placing: a primary click on the canvas drops the ghost — and goes no
          // further, so it neither grabs a box nor starts a pan.
          if (placing && e.button === 0 && isOnCanvas(e.target)) {
            e.stopPropagation();
            e.preventDefault();
            swallowClick.current = true;
            place();
          }
        }}
        onClickCapture={(e) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.stopPropagation();
        }}
        onPointerMoveCapture={(e) => {
          if (!isOnCanvas(e.target)) return;
          if (placing) return setGhostAt(canvasRef.current?.clientToSvg(e.clientX, e.clientY) ?? null);
          trackHover(e);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div ref={canvasWrapRef} className="absolute inset-0">
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
            showSelectionFrame={false}
            selectedLineId={selectedLineId}
            childColorClass={childColorClass}
            lineColorClass={lineColorClass}
            formatResolver={formatResolver}
            onChildDown={handleChildDown}
            onCanvasPoint={onCanvasPoint}
            onDrawCommit={commitDraw}
            onLineDown={({ id }) => {
              if (tool !== 'move') return;
              setSelectedLineId(id);
              setSelectedChildId(null);
              setLineEditAt(canvasRef.current?.clientToSvg(lastPointer.current.x, lastPointer.current.y) ?? null);
            }}
            onPortDirection={pinPortDirection}
            explore={operating}
            focusedId={operating ? focusedId : null}
            onChildFocus={focusChild}
            onElementActivate={toggleSwitch}
            onClearSelection={() => {
              clearSelection();
              blur();
            }}
          >
            <TargetFx target={selectedTarget} mode="selected" hot={hoverOnSelected} />
            {(tool === 'operate' || tool === 'move') && !placing && (
              <TargetFx target={hoverOnSelected ? null : hover} />
            )}
            {picker && <TargetPin at={picker.point} colorClass={pickerChild && childColorClass(pickerChild)} />}
            {tool === 'move' && lineEditAt && editedLine && (
              <TargetPin at={lineEditAt} colorClass={editedLineLayout && lineColorClass(editedLineLayout)} />
            )}
            {ghost && placing && (
              <g opacity={0.6} pointerEvents="none">
                <rect
                  x={ghost.worldBounds.x - 6}
                  y={ghost.worldBounds.y - 6}
                  width={ghost.worldBounds.width + 12}
                  height={ghost.worldBounds.height + 12}
                  rx={6}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
                <ChildDiagramView
                  child={ghost}
                  interactive={false}
                  boxMode={boxMode}
                  boxSubLabel={busLabel}
                  colorClass={voltageClass(placing.meta.voltageKv)}
                  animateMorph={false}
                />
              </g>
            )}
          </CompositeCanvas>
        </div>

        {/* Minimal floating chrome — the app owns all orchestration; the canvas
            just emits semantic callbacks (see the adapter contract). */}
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-full border border-border bg-background/85 px-2 py-1 shadow-lg backdrop-blur-sm">
          <ToolButton
            title="Operate (O) — open a substation, toggle its switches"
            active={tool === 'operate'}
            onClick={() => chooseTool('operate')}
          >
            <Pointer className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            title="Move (V) — drag substations, edit lines"
            active={tool === 'move'}
            onClick={() => chooseTool('move')}
          >
            <Move className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="Draw line (L)" active={tool === 'draw'} onClick={() => chooseTool('draw')}>
            <PenLine className="h-4 w-4" />
          </ToolButton>

          {tool === 'move' && selectedChildId && (
            <div className="mx-1 flex items-center rounded-md border border-border p-0.5 text-xs">
              <button
                type="button"
                title="Edit substation (or double-click it)"
                onClick={() => openEdit(selectedChildId)}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <SquarePen className="h-3.5 w-3.5" /> Edit
              </button>
            </div>
          )}

          {tool === 'draw' && (
            <div className="mx-1 flex items-center rounded-md border border-border p-0.5 text-xs">
              <button
                type="button"
                title="New substation"
                onClick={openCreate}
                className={`flex items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                  placing ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Plus className="h-3.5 w-3.5" /> Substation
              </button>
              <span className="mx-1 h-4 w-px bg-border" />
              {LINE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => setLineKind(k.kind)}
                  className={`rounded px-2 py-0.5 transition-colors ${
                    lineKind === k.kind
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
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
          <ToolButton
            title={autoFacing ? 'Auto-facing: on (feeders face their peer)' : 'Auto-facing: off (strict/authored)'}
            active={autoFacing}
            onClick={toggleAutoFacing}
          >
            <Magnet className="h-4 w-4" />
          </ToolButton>
          <ToolButton
            title={selectedChildId && !selectedLineId ? 'Delete substation (and its lines)' : 'Delete line'}
            disabled={!selectedLineId && !selectedChildId}
            onClick={deleteSelected}
          >
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

        {placing && (
          <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground shadow">
            Click to place {placing.meta.name} · Esc to cancel
          </p>
        )}
        {tool === 'draw' && !placing && (
          <p
            className={`pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-xs shadow ${
              hint ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground'
            }`}
          >
            {hint ??
              (draft.length === 0
                ? 'Click a free feeder dot or a substation to start a line · Esc to cancel'
                : 'Click a feeder dot or a substation to finish · click to bend · double-click ends a free lead')}
          </p>
        )}
        {picker && pickerChild && (
          <BayPicker
            anchor={worldAnchor(picker.point)}
            onDetach={() => setPicker(null)}
            name={pickerChild.name}
            terminals={pickerTerminals}
            canAutoBay={!!pickerBar}
            onPick={pickTerminal}
            onNewBay={pickNewBay}
            onDesign={() => openEdit(picker.instanceId)}
            onCancel={() => setPicker(null)}
          />
        )}
        {tool === 'move' && lineEditAt && editedLine && (
          <LinePopover
            key={editedLine.id}
            anchor={worldAnchor(lineEditAt)}
            onDetach={() => setLineEditAt(null)}
            line={editedLine}
            kinds={LINE_KINDS}
            onApply={applyLineEdit}
            onClose={() => setLineEditAt(null)}
          />
        )}
        {editor && (
          <SubstationDialog
            target={editor}
            composite={composite}
            onSave={onEditorSave}
            onCancel={() => setEditor(null)}
          />
        )}
        {tool === 'operate' && (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground shadow">
            {focusedId
              ? 'Click a switch to open / close it · click outside or Esc to close'
              : 'Click a substation to open it'}
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
