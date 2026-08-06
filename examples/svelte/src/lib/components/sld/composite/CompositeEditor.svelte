<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    CompositeLayoutEngine,
    CompositeSerializer,
    CompositeSvgExporter,
    CommandStack,
    LayoutEngine,
    AddChildCommand,
    RemoveChildCommand,
    TransformChildCommand,
    SetChildLabelCommand,
    AddLineCommand,
    RemoveLineCommand,
    UpdateLineCommand,
    DiagramInstance,
    CompositeLine,
    chordFrame,
    newId,
    type CompositeDocument,
    type Command,
    type Point,
    type ChildLayout,
    type ChordFrame,
    type CompositeLineLayout,
    type LineVertexJson,
    type LabelAnchor
  } from '@sld-kit/core';
  import { sldLibrary } from '$lib/stores/sldLibrary';
  import { sldEditorSettings } from '$lib/stores/sldEditorSettings';
  import { CompositeCanvas, CompositeToolbar, createDocStore, downloadText, slugify } from '@sld-kit/svelte';
  import ImportDiagramDialog from './ImportDiagramDialog.svelte';
  import DiagramLabelDialog from './DiagramLabelDialog.svelte';
  import {
    POSITION_TYPE_TOKENS,
    SLD_COMPOSITE_TOOLBAR_LABELS,
    SLD_EXPORT_LABELS,
    SLD_CHILD_NOT_FOUND,
    COMPACT_LAYOUT,
    voltageToken,
    SLD_VIEW_STYLE
  } from '$lib/components/sld/theme';
  import { commissioningResolver } from '$lib/components/sld/commissioning';

  /**
   * Composition root of the composite ("diagram of diagrams") editor. A small
   * sibling of `SldEditor`: owns the `CommandStack<CompositeDocument>`,
   * single-child selection, the transient drag/rotate gesture state and the
   * import dialog. Commands are the only things that persist a mutation, so
   * undo/redo can never desync from the model.
   */
  export let doc: CompositeDocument;
  export let userRole: string = 'viewer';

  const svgExporter = new CompositeSvgExporter();
  const stack = new CommandStack<CompositeDocument>();

  $: docStore = createDocStore(doc);
  // Hiding position labels compacts each child (and re-packs the composite).
  $: engine = new CompositeLayoutEngine(
    new LayoutEngine($sldEditorSettings.labelMode === 'all' ? undefined : COMPACT_LAYOUT)
  );
  $: layout = engine.layout($docStore);

  // Display toggles (shared with the single-diagram editor, persisted).
  $: childColorClass = (child: ChildLayout): string | null =>
    $sldEditorSettings.colorMode === 'by-voltage'
      ? voltageToken(child.instance.resolved?.meta.voltageKv)
      : null;
  // A manual line is a physical asset at one voltage: color it like a
  // connection when every anchored end shares the same voltage level.
  $: lineColorClass = (line: CompositeLineLayout): string | null => {
    if ($sldEditorSettings.colorMode !== 'by-voltage') return null;
    const volts = new Set<number | undefined>();
    for (const v of line.line.vertices) {
      if (v.kind === 'anchor') volts.add(doc.getChild(v.instanceId)?.resolved?.meta.voltageKv);
    }
    if (volts.size !== 1) return null;
    const kv = [...volts][0];
    return kv == null ? null : voltageToken(kv);
  };
  $: showPositionLabels = $sldEditorSettings.labelMode === 'all';
  $: showBusBarLabels = $sldEditorSettings.labelMode !== 'none';
  $: showConnectionLabels = $sldEditorSettings.labelMode !== 'none';

  let canvas: CompositeCanvas;
  let selectedId: string | null = null;
  let selectedLineId: string | null = null;
  let selectedLinkId: string | null = null;
  let importOpen = false;

  // ── Draw-line tool ──────────────────────────────────────────────────────────
  let drawActive = false;
  let draftVertices: LineVertexJson[] = [];
  let draftPoints: Point[] = [];
  // Connection dots a drawn/converted end can snap to (only computed while drawing).
  $: snapTargets = drawActive ? engine.externalConnectionTips(layout.children) : [];

  let canUndo = false;
  let canRedo = false;
  const unsubStack = stack.subscribe(() => {
    canUndo = stack.canUndo;
    canRedo = stack.canRedo;
  });
  onDestroy(unsubStack);

  $: canEdit = userRole !== 'viewer';
  $: hasSelection = selectedId !== null || selectedLineId !== null;

  function run(cmd: Command<CompositeDocument>) {
    stack.execute(cmd, doc);
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  function clearSelection() {
    selectedId = null;
    selectedLineId = null;
    selectedLinkId = null;
  }

  function handleLineDown(e: CustomEvent<{ id: string; event: PointerEvent }>) {
    selectedLineId = e.detail.id;
    selectedId = null;
    selectedLinkId = null;
  }

  function handleLinkDown(e: CustomEvent<{ connectionId: string; event: PointerEvent }>) {
    selectedLinkId = e.detail.connectionId;
    selectedId = null;
    selectedLineId = null;
  }

  // ── Diagram-name label ───────────────────────────────────────────────────────
  // Placement is edited from the toolbar: with a child selected, the name button
  // opens a dialog (dropdown of the six slots + a rotate-90° button). Every change
  // runs a SetChildLabelCommand against the live instance, so it stays undoable.
  let labelDialogOpen = false;

  $: labelChild = selectedId ? ($docStore.getChild(selectedId) ?? null) : null;

  function applyLabelPlacement(e: CustomEvent<{ anchor: LabelAnchor; direction: number }>) {
    if (!canEdit || !selectedId) return;
    const inst = doc.getChild(selectedId);
    if (!inst) return;
    run(
      new SetChildLabelCommand(
        selectedId,
        { anchor: inst.labelAnchor, direction: inst.labelDirection },
        { anchor: e.detail.anchor, direction: e.detail.direction }
      )
    );
  }

  // ── Drag-move ──────────────────────────────────────────────────────────────
  let drag: {
    id: string;
    startClient: { x: number; y: number };
    before: { x: number; y: number; angleDeg: number };
    moved: boolean;
  } | null = null;

  function handleChildDown(e: CustomEvent<{ id: string; event: PointerEvent }>) {
    const { id, event } = e.detail;
    // The topmost child's capture rect is hit first (later = higher z-order),
    // so selection picks the top diagram for free.
    selectedId = id;
    selectedLineId = null;
    selectedLinkId = null;
    if (!canEdit) return;
    const inst = doc.getChild(id);
    if (!inst) return;
    drag = {
      id,
      startClient: { x: event.clientX, y: event.clientY },
      before: { x: inst.x, y: inst.y, angleDeg: inst.angleDeg },
      moved: false
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
  }

  function onDragMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startClient.x;
    const dy = e.clientY - drag.startClient.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true;
    // Client delta → svg delta via two mapped points (accounts for zoom).
    const p0 = canvas.clientToSvg(drag.startClient.x, drag.startClient.y);
    const p1 = canvas.clientToSvg(e.clientX, e.clientY);
    doc.setChildTransform(drag.id, drag.before.x + (p1.x - p0.x), drag.before.y + (p1.y - p0.y), drag.before.angleDeg);
  }

  function onDragUp() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    if (drag?.moved) {
      const inst = doc.getChild(drag.id);
      if (inst) {
        run(
          new TransformChildCommand('Move diagram', drag.id, drag.before, {
            x: inst.x,
            y: inst.y,
            angleDeg: inst.angleDeg
          })
        );
      }
    }
    drag = null;
  }

  // ── Rotate ─────────────────────────────────────────────────────────────────
  let rotate: {
    id: string;
    center: Point;
    startPointerAngle: number;
    before: { x: number; y: number; angleDeg: number };
    moved: boolean;
  } | null = null;

  function angleDeg(from: Point, to: Point): number {
    return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  }

  function handleRotateStart(e: CustomEvent<{ event: PointerEvent }>) {
    if (!canEdit || !selectedId) return;
    const child = layout.children.find((c) => c.instance.id === selectedId);
    const inst = doc.getChild(selectedId);
    if (!child || !inst) return;
    const c = child.worldCorners;
    const center = {
      x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4,
      y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4
    };
    const pt = canvas.clientToSvg(e.detail.event.clientX, e.detail.event.clientY);
    rotate = {
      id: selectedId,
      center,
      startPointerAngle: angleDeg(center, pt),
      before: { x: inst.x, y: inst.y, angleDeg: inst.angleDeg },
      moved: false
    };
    window.addEventListener('pointermove', onRotateMove);
    window.addEventListener('pointerup', onRotateUp);
  }

  function onRotateMove(e: PointerEvent) {
    if (!rotate) return;
    rotate.moved = true;
    const pt = canvas.clientToSvg(e.clientX, e.clientY);
    let angle = rotate.before.angleDeg + (angleDeg(rotate.center, pt) - rotate.startPointerAngle);
    if (e.shiftKey) angle = Math.round(angle / 15) * 15;
    doc.setChildTransform(rotate.id, rotate.before.x, rotate.before.y, angle);
  }

  function onRotateUp() {
    window.removeEventListener('pointermove', onRotateMove);
    window.removeEventListener('pointerup', onRotateUp);
    if (rotate?.moved) {
      const inst = doc.getChild(rotate.id);
      if (inst) {
        run(
          new TransformChildCommand('Rotate diagram', rotate.id, rotate.before, {
            x: inst.x,
            y: inst.y,
            angleDeg: inst.angleDeg
          })
        );
      }
    }
    rotate = null;
  }

  // ── Relative bends ─────────────────────────────────────────────────────────
  // Free bends are stored relative to a line's two anchored ends (a `rel` vertex),
  // so they follow the endpoints when a child moves or the layout config changes
  // (e.g. label-mode compaction) instead of freezing in absolute pixels. All the
  // pointer maths below works in world coords; we convert to/from `rel` only at
  // the anchor chord, using the same helper the core layout engine resolves with.

  /** The chord frame (first→last anchor) for a set of vertices given their aligned
   *  resolved world points, or null when there aren't two distinct anchored ends. */
  function frameFor(vertices: LineVertexJson[], points: Point[]): ChordFrame | null {
    if (points.length !== vertices.length) return null;
    let first = -1;
    let last = -1;
    vertices.forEach((v, i) => {
      if (v.kind === 'anchor') {
        if (first < 0) first = i;
        last = i;
      }
    });
    if (first < 0 || first === last) return null;
    return chordFrame(points[first], points[last]);
  }

  /** Rewrite a line's free `point` bends to `rel` against its anchor chord; a no-op
   *  when the line lacks two anchored ends (bends stay absolute). */
  function relativize(vertices: LineVertexJson[], points: Point[]): LineVertexJson[] {
    const frame = frameFor(vertices, points);
    if (!frame) return vertices;
    return vertices.map((v, i) => (v.kind === 'point' ? { kind: 'rel', ...frame.toRel(points[i]) } : v));
  }

  /** The live resolved layout for a line already in the doc, if its vertices ↔ points map 1:1. */
  function resolvedLine(id: string): CompositeLineLayout | null {
    const rl = layout.lines.find((l) => l.line.id === id);
    return rl && rl.points.length === rl.line.vertices.length ? rl : null;
  }

  // One-time upgrade on open: rewrite any legacy absolute (`point`) bends on lines
  // that have an anchor chord to relative bends, so seeded/imported lines follow
  // their endpoints too (children resolve before mount; the route autosaves the
  // result). Idempotent — lines already `rel`, or without two anchors, are left.
  onMount(() => {
    for (const line of doc.allLines()) {
      if (!line.vertices.some((v) => v.kind === 'point')) continue;
      const rl = resolvedLine(line.id);
      if (!rl) continue;
      const next = relativize(line.vertices, rl.points);
      if (next !== line.vertices) doc.setLineVertices(line.id, next);
    }
  });

  // ── Draw line ────────────────────────────────────────────────────────────
  function toggleDraw() {
    drawActive = !drawActive;
    draftVertices = [];
    draftPoints = [];
    clearSelection();
  }

  function handleCanvasPoint(
    e: CustomEvent<{ point: Point; snap: { instanceId: string; connectionId: string } | null }>
  ) {
    if (!drawActive) return;
    const { point, snap } = e.detail;
    draftPoints = [...draftPoints, point];
    draftVertices = [
      ...draftVertices,
      snap ? { kind: 'anchor', instanceId: snap.instanceId, connectionId: snap.connectionId } : { kind: 'point', x: point.x, y: point.y }
    ];
  }

  function sameVertex(a: LineVertexJson, b: LineVertexJson): boolean {
    if (a.kind !== b.kind) return false;
    return a.kind === 'point' && b.kind === 'point'
      ? a.x === b.x && a.y === b.y
      : a.kind === 'anchor' && b.kind === 'anchor'
        ? a.instanceId === b.instanceId && a.connectionId === b.connectionId
        : false;
  }

  function handleDrawCommit() {
    // The double-click that finishes drawing also fires two clicks at the same
    // spot; collapse consecutive duplicate vertices before committing. `draftPoints`
    // holds each vertex's world position (1:1 with `draftVertices`), so filter both
    // in lockstep to keep them aligned for `relativize`.
    const keep = draftVertices
      .map((_, i) => i)
      .filter((i) => i === 0 || !sameVertex(draftVertices[i], draftVertices[i - 1]));
    const vertices = keep.map((i) => draftVertices[i]);
    const points = keep.map((i) => draftPoints[i]);
    if (vertices.length >= 2) {
      const line = new CompositeLine(newId(), relativize(vertices, points));
      run(new AddLineCommand(line));
      selectedLineId = line.id;
      selectedId = null;
    }
    drawActive = false;
    draftVertices = [];
    draftPoints = [];
  }

  /** Convert the selected auto-link into an editable manual line (with one bend to drag). */
  function convertSelectedLink() {
    const link = layout.links.find((l) => l.connectionId === selectedLinkId);
    if (!link) return;
    const mid = { x: (link.a.point.x + link.b.point.x) / 2, y: (link.a.point.y + link.b.point.y) / 2 };
    // Store the bend relative to the two anchored ends (t=0.5, n=0), so it stays
    // centred as the diagrams move or compact instead of freezing in place.
    const frame = chordFrame(link.a.point, link.b.point);
    const bend: LineVertexJson = frame ? { kind: 'rel', ...frame.toRel(mid) } : { kind: 'point', x: mid.x, y: mid.y };
    const line = new CompositeLine(newId(), [
      { kind: 'anchor', instanceId: link.a.instanceId, connectionId: link.connectionId },
      bend,
      { kind: 'anchor', instanceId: link.b.instanceId, connectionId: link.connectionId }
    ]);
    run(new AddLineCommand(line));
    selectedLinkId = null;
    selectedLineId = line.id;
  }

  // ── Line vertex drag / add ─────────────────────────────────────────────────
  // `base` is what the drag deltas apply to (vertices at gesture start);
  // `commitBefore` is what undo restores (pre-insert when adding a bend, so the
  // whole add-and-position gesture is a single undoable step).
  let lineDrag: {
    id: string;
    index: number;
    startClient: { x: number; y: number };
    // World position of the dragged bend at gesture start, plus the anchor chord
    // it's expressed against, so deltas apply in world space and convert to `rel`.
    startWorld: Point;
    frame: ChordFrame | null;
    base: LineVertexJson[];
    commitBefore: LineVertexJson[];
    moved: boolean;
    added: boolean;
    label: string;
  } | null = null;

  function handleLineVertexDown(e: CustomEvent<{ id: string; index: number; event: PointerEvent }>) {
    if (!canEdit) return;
    const { id, index, event } = e.detail;
    const line = doc.getLine(id);
    const rl = resolvedLine(id);
    // Handles only render when vertices ↔ points map 1:1, so `rl` is present here.
    if (!line || !rl) return;
    const snapshot = line.vertices.map((v) => ({ ...v }));
    lineDrag = {
      id,
      index,
      startClient: { x: event.clientX, y: event.clientY },
      startWorld: rl.points[index],
      frame: frameFor(line.vertices, rl.points),
      base: snapshot,
      commitBefore: snapshot,
      moved: false,
      added: false,
      label: 'Move line vertex'
    };
    window.addEventListener('pointermove', onLineVertexMove);
    window.addEventListener('pointerup', onLineVertexUp);
  }

  /** Insert a new bend at a segment midpoint, then drag it — one undoable step. */
  function handleLineSegmentDown(e: CustomEvent<{ id: string; index: number; point: Point; event: PointerEvent }>) {
    if (!canEdit) return;
    const { id, index, point, event } = e.detail;
    const line = doc.getLine(id);
    const rl = resolvedLine(id);
    if (!line || !rl) return;
    // Keep the line selected so the new dot is visibly part of the selection.
    selectedLineId = id;
    selectedId = null;
    selectedLinkId = null;
    const commitBefore = line.vertices.map((v) => ({ ...v }));
    // A new bend is a free `point`, never an anchor, so the anchor chord is
    // unchanged by the insert — the pre-insert frame stays valid.
    const frame = frameFor(line.vertices, rl.points);
    const inserted: LineVertexJson = frame ? { kind: 'rel', ...frame.toRel(point) } : { kind: 'point', x: point.x, y: point.y };
    const base = [...commitBefore.slice(0, index + 1), inserted, ...commitBefore.slice(index + 1)];
    doc.setLineVertices(id, base.map((v) => ({ ...v }))); // transient insert
    lineDrag = {
      id,
      index: index + 1,
      startClient: { x: event.clientX, y: event.clientY },
      startWorld: { x: point.x, y: point.y },
      frame,
      base,
      commitBefore,
      moved: false,
      added: true,
      label: 'Add line vertex'
    };
    window.addEventListener('pointermove', onLineVertexMove);
    window.addEventListener('pointerup', onLineVertexUp);
  }

  function onLineVertexMove(e: PointerEvent) {
    if (!lineDrag) return;
    const dx = e.clientX - lineDrag.startClient.x;
    const dy = e.clientY - lineDrag.startClient.y;
    if (!lineDrag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    lineDrag.moved = true;
    const p0 = canvas.clientToSvg(lineDrag.startClient.x, lineDrag.startClient.y);
    const p1 = canvas.clientToSvg(e.clientX, e.clientY);
    const world = { x: lineDrag.startWorld.x + (p1.x - p0.x), y: lineDrag.startWorld.y + (p1.y - p0.y) };
    // Store as `rel` when the line has an anchor chord, else fall back to absolute.
    const bend: LineVertexJson = lineDrag.frame
      ? { kind: 'rel', ...lineDrag.frame.toRel(world) }
      : { kind: 'point', x: world.x, y: world.y };
    const next = lineDrag.base.map((v, i) => (i === lineDrag!.index ? bend : v));
    doc.setLineVertices(lineDrag.id, next);
  }

  function onLineVertexUp() {
    window.removeEventListener('pointermove', onLineVertexMove);
    window.removeEventListener('pointerup', onLineVertexUp);
    // Commit when the vertex actually moved, or a bend was added (even if not dragged).
    if (lineDrag && (lineDrag.moved || lineDrag.added)) {
      const line = doc.getLine(lineDrag.id);
      if (line) run(new UpdateLineCommand(lineDrag.label, lineDrag.id, lineDrag.commitBefore, line.vertices));
    }
    lineDrag = null;
  }

  /** Delete an intermediate bend (a free `point` vertex), keeping the line valid (≥ 2 vertices). */
  function handleLineVertexDelete(e: CustomEvent<{ id: string; index: number }>) {
    if (!canEdit) return;
    const { id, index } = e.detail;
    const line = doc.getLine(id);
    const kind = line?.vertices[index]?.kind;
    if (!line || (kind !== 'point' && kind !== 'rel') || line.vertices.length <= 2) return;
    const before = line.vertices.map((v) => ({ ...v }));
    const after = before.filter((_, i) => i !== index);
    run(new UpdateLineCommand('Delete line vertex', id, before, after));
    selectedLineId = id;
  }

  onDestroy(() => {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointermove', onRotateMove);
    window.removeEventListener('pointerup', onRotateUp);
    window.removeEventListener('pointermove', onLineVertexMove);
    window.removeEventListener('pointerup', onLineVertexUp);
  });

  // ── Import ─────────────────────────────────────────────────────────────────
  function handleImport(e: CustomEvent<{ libraryId: string }>) {
    const b = layout.bounds;
    const hasContent = b.width > 0 || b.height > 0;
    const spawnX = hasContent ? b.x + b.width + 80 : 0;
    const spawnY = hasContent ? b.y : 0;
    const inst = new DiagramInstance(newId(), e.detail.libraryId, spawnX, spawnY, 0);
    inst.resolve(sldLibrary.resolver);
    run(new AddChildCommand(inst));
    selectedId = inst.id;
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  function deleteSelection() {
    if (selectedLineId) {
      run(new RemoveLineCommand(selectedLineId));
      selectedLineId = null;
      return;
    }
    if (!selectedId) return;
    run(new RemoveChildCommand(selectedId));
    selectedId = null;
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportJson() {
    const json = JSON.stringify(CompositeSerializer.toJSON(doc), null, 2);
    downloadText(`${slugify(doc.meta.name)}.composite.json`, json, 'application/json');
  }

  function exportSvg() {
    const svg = svgExporter.export(doc, {
      theme: { resolveElementFormat: commissioningResolver }
    });
    downloadText(`${slugify(doc.meta.name)}.composite.svg`, svg, 'image/svg+xml');
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
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

    if (e.key === 'Escape') {
      if (drawActive) {
        drawActive = false;
        draftVertices = [];
        draftPoints = [];
      } else {
        clearSelection();
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit) {
      e.preventDefault();
      deleteSelection();
    } else if (e.shiftKey && e.code === 'Digit1') {
      e.preventDefault();
      canvas?.zoomToFit();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="relative h-full w-full overflow-hidden bg-background">
  <CompositeCanvas
    bind:this={canvas}
    {layout}
    {selectedId}
    {selectedLineId}
    drawMode={drawActive}
    {snapTargets}
    {draftPoints}
    interactive={canEdit}
    tokens={POSITION_TYPE_TOKENS}
    {childColorClass}
    {lineColorClass}
    formatResolver={commissioningResolver}
    style={SLD_VIEW_STYLE}
    {showPositionLabels}
    {showBusBarLabels}
    {showConnectionLabels}
    notFoundLabel={SLD_CHILD_NOT_FOUND}
    on:childdown={handleChildDown}
    on:rotatestart={handleRotateStart}
    on:clearselection={clearSelection}
    on:linedown={handleLineDown}
    on:linkdown={handleLinkDown}
    on:linevertexdown={handleLineVertexDown}
    on:linesegmentdown={handleLineSegmentDown}
    on:linevertexdelete={handleLineVertexDelete}
    on:canvaspoint={handleCanvasPoint}
    on:drawcommit={handleDrawCommit}
  />

  {#if canEdit && selectedLinkId}
    <!-- Contextual action: turn the selected auto-link into an editable manual line. -->
    <div class="absolute left-1/2 top-6 z-10 -translate-x-1/2">
      <button
        class="rounded-full border border-border bg-background/90 px-4 py-1.5 text-sm font-medium shadow-lg backdrop-blur-sm hover:bg-accent"
        on:click={convertSelectedLink}
      >
        Draw this link manually
      </button>
    </div>
  {/if}


  <CompositeToolbar
    {userRole}
    {canUndo}
    {canRedo}
    {hasSelection}
    childSelected={selectedId !== null}
    {drawActive}
    colorMode={$sldEditorSettings.colorMode}
    labelMode={$sldEditorSettings.labelMode}
    labels={SLD_COMPOSITE_TOOLBAR_LABELS}
    exportLabels={SLD_EXPORT_LABELS}
    on:import={() => (importOpen = true)}
    on:drawline={toggleDraw}
    on:delete={deleteSelection}
    on:editlabel={() => (labelDialogOpen = true)}
    on:undo={() => stack.undo(doc)}
    on:redo={() => stack.redo(doc)}
    on:fit={() => canvas?.zoomToFit()}
    on:exportJson={exportJson}
    on:exportSvg={exportSvg}
    on:setcolormode={(e) => sldEditorSettings.update((s) => ({ ...s, colorMode: e.detail }))}
    on:setlabelmode={(e) => sldEditorSettings.update((s) => ({ ...s, labelMode: e.detail }))}
  />
</div>

<ImportDiagramDialog bind:open={importOpen} on:import={handleImport} />

{#if labelChild}
  <DiagramLabelDialog
    bind:open={labelDialogOpen}
    name={labelChild.resolved?.meta.name ?? labelChild.libraryId}
    anchor={labelChild.labelAnchor}
    direction={labelChild.labelDirection}
    on:change={applyLabelPlacement}
  />
{/if}
