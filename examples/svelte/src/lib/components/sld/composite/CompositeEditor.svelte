<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    CompositeLayoutEngine,
    CompositeSerializer,
    CompositeSvgExporter,
    CommandStack,
    AddChildCommand,
    RemoveChildCommand,
    TransformChildCommand,
    DiagramInstance,
    newId,
    type CompositeDocument,
    type Command,
    type Point
  } from '@sld-kit/core';
  import { sldLibrary } from '$lib/stores/sldLibrary';
  import { CompositeCanvas, CompositeToolbar, createDocStore, downloadText, slugify } from '@sld-kit/svelte';
  import ImportDiagramDialog from './ImportDiagramDialog.svelte';
  import {
    POSITION_TYPE_TOKENS,
    SLD_COMPOSITE_TOOLBAR_LABELS,
    SLD_EXPORT_LABELS,
    SLD_CHILD_NOT_FOUND
  } from '$lib/components/sld/theme';

  /**
   * Composition root of the composite ("diagram of diagrams") editor. A small
   * sibling of `SldEditor`: owns the `CommandStack<CompositeDocument>`,
   * single-child selection, the transient drag/rotate gesture state and the
   * import dialog. Commands are the only things that persist a mutation, so
   * undo/redo can never desync from the model.
   */
  export let doc: CompositeDocument;
  export let userRole: string = 'viewer';

  const engine = new CompositeLayoutEngine();
  const svgExporter = new CompositeSvgExporter();
  const stack = new CommandStack<CompositeDocument>();

  $: docStore = createDocStore(doc);
  $: layout = engine.layout($docStore);

  let canvas: CompositeCanvas;
  let selectedId: string | null = null;
  let importOpen = false;

  let canUndo = false;
  let canRedo = false;
  const unsubStack = stack.subscribe(() => {
    canUndo = stack.canUndo;
    canRedo = stack.canRedo;
  });
  onDestroy(unsubStack);

  $: canEdit = userRole !== 'viewer';

  function run(cmd: Command<CompositeDocument>) {
    stack.execute(cmd, doc);
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  function clearSelection() {
    selectedId = null;
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

  onDestroy(() => {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointermove', onRotateMove);
    window.removeEventListener('pointerup', onRotateUp);
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
    downloadText(`${slugify(doc.meta.name)}.composite.svg`, svgExporter.export(doc), 'image/svg+xml');
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
      clearSelection();
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
    interactive={canEdit}
    tokens={POSITION_TYPE_TOKENS}
    notFoundLabel={SLD_CHILD_NOT_FOUND}
    on:childdown={handleChildDown}
    on:rotatestart={handleRotateStart}
    on:clearselection={clearSelection}
  />

  <CompositeToolbar
    {userRole}
    {canUndo}
    {canRedo}
    hasSelection={selectedId !== null}
    labels={SLD_COMPOSITE_TOOLBAR_LABELS}
    exportLabels={SLD_EXPORT_LABELS}
    on:import={() => (importOpen = true)}
    on:delete={deleteSelection}
    on:undo={() => stack.undo(doc)}
    on:redo={() => stack.redo(doc)}
    on:fit={() => canvas?.zoomToFit()}
    on:exportJson={exportJson}
    on:exportSvg={exportSvg}
  />
</div>

<ImportDiagramDialog bind:open={importOpen} on:import={handleImport} />
