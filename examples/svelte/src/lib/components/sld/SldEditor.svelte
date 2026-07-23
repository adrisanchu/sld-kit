<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    LayoutEngine,
    Grid,
    CommandStack,
    BusBar,
    Position,
    Connection,
    Serializer,
    AddElementCommand,
    AddPositionCommand,
    AddBusBarCommand,
    DeleteElementsCommand,
    MoveElementCommand,
    UpdateElementCommand,
    RenameElementCommand,
    SnapshotCommand,
    AddLaneCommand,
    RemoveLaneCommand,
    SvgExporter,
    nextPositionLabel,
    nextExternalLabel,
    newId,
    type Command,
    type LaneKind,
    type SldDocument,
    type SldElement,
    type ElementJson,
    type Cell,
    type Point,
    type MovePlan,
    type ExternalAssetKind,
    type ElementGeometry
  } from '@sld-kit/core';
  import { sldEditorSettings } from '$lib/stores/sldEditorSettings';
  import {
    SldCanvas,
    SldToolbar,
    GridOverlay,
    LaneOverlay,
    GhostPreview,
    ExternalAssetPopover,
    LaneActionChip,
    createDocStore,
    downloadText,
    slugify
  } from '@sld-kit/svelte';
  import ElementEditDialog from './ElementEditDialog.svelte';
  import ConfirmationDialog from '$lib/components/confirmation-dialog/ConfirmationDialog.svelte';
  import {
    POSITION_TYPE_TOKENS,
    POSITION_TYPE_LABELS,
    SLD_TOOLBAR_LABELS,
    SLD_MATRIX_LABELS,
    SLD_EXPORT_LABELS,
    SLD_EXTERNAL_ASSET_LABELS,
    SLD_LANE_OVERLAY_LABELS,
    SLD_LANE_ACTION_CHIP_LABELS
  } from '$lib/components/sld/theme';

  /**
   * Composition root of the SLD editor. Owns per-instance editor state (the
   * active tool, selection, command stack, and the transient drag / connection
   * previews) and translates canvas intents into undoable core commands.
   * Commands are the only things that mutate the document, so undo/redo can
   * never desync from the model.
   */
  export let doc: SldDocument;
  export let userRole: string = 'viewer';

  const engine = new LayoutEngine();
  const svgExporter = new SvgExporter();
  const stack = new CommandStack();

  $: docStore = createDocStore(doc);
  $: layout = engine.layout($docStore);
  $: grid = new Grid($docStore);

  let canvas: SldCanvas;
  let containerEl: HTMLDivElement;
  let _vbTick = 0;
  let _vbUnsub: (() => void) | null = null;
  let selectedIds: Set<string> = new Set();
  let selectedLane: { kind: LaneKind; index: number } | null = null;
  let editMode = false;
  let tool: 'select' | 'busbar' | 'position' | 'connection' = 'select';

  // Command-stack availability (drives toolbar button states).
  let canUndo = false;
  let canRedo = false;
  const unsubStack = stack.subscribe(() => {
    canUndo = stack.canUndo;
    canRedo = stack.canRedo;
  });
  onDestroy(unsubStack);

  // ── Tool previews ────────────────────────────────────────────────────────
  let hoverCell: Cell | null = null; // position tool
  let ghostValid = false;
  let hoverBoundary: number | null = null; // busbar tool
  let cursorPoint: Point | null = null; // connection rubber-band end
  let pendingFrom: string | null = null; // connection source element id
  let externalPopover: { screenX: number; screenY: number; point: Point } | null = null;

  // ── Drag-move ────────────────────────────────────────────────────────────
  let drag: {
    id: string;
    startClient: { x: number; y: number };
    moved: boolean;
    plan: MovePlan | null;
    targetCell: Cell | null;
  } | null = null;

  // Matrix creator confirmation
  let matrixConfirmOpen = false;
  let pendingMatrix: { rows: number; cols: number } | null = null;

  // Edit dialog
  let editOpen = false;
  let editElement: SldElement | null = null;

  $: canEdit = userRole !== 'viewer';

  // Lane overlay visible only in select mode while editing (not mid-drag).
  $: showLanes = canEdit && editMode && tool === 'select' && !drag?.moved;

  // Guard: deselect lane when undo/redo shrinks the grid past its index.
  $: if (selectedLane) {
    if (selectedLane.kind === 'col' && selectedLane.index >= $docStore.grid.cols) selectedLane = null;
    else if (selectedLane.kind === 'row' && selectedLane.index >= $docStore.grid.rows) selectedLane = null;
  }

  // Subscribe to viewBox changes so chipPos stays correct after pan/zoom.
  $: if (canvas) {
    _vbUnsub?.();
    _vbUnsub = canvas.getViewBox().subscribe(() => (_vbTick = _vbTick + 1));
  }

  // Chip screen position — recomputes on layout/selectedLane/pan/zoom changes.
  $: chipPos = (() => {
    _vbTick; // reactive dependency on pan/zoom
    if (!selectedLane || !canvas || !containerEl) return null;
    const containerRect = containerEl.getBoundingClientRect();
    const { kind, index } = selectedLane;
    if (kind === 'col') {
      if (index >= layout.cols) return null;
      const cellR = layout.cellRect({ row: 0, col: index });
      // Use the first row's cell top (= margin) as anchor, not rowBoundaryY(0)
      // (= margin - cellGapY/2). At high zoom the gap magnifies and the chip
      // would appear hundreds of pixels above the visible diagram content.
      const rowTop = layout.cellRect({ row: 0, col: 0 }).y;
      const pt = canvas.svgToClient(cellR.x + cellR.width / 2, rowTop);
      return { x: pt.x - containerRect.left, y: pt.y - containerRect.top };
    } else {
      if (index >= layout.rows) return null;
      const cellR = layout.cellRect({ row: index, col: 0 });
      // Anchor at the right edge of the handle area (handleX + HANDLE_W = margin - 34).
      const pt = canvas.svgToClient(cellR.x - 34, cellR.y + cellR.height / 2);
      return { x: pt.x - containerRect.left, y: pt.y - containerRect.top };
    }
  })();

  // Reset transient tool state whenever the active tool changes.
  $: if (tool !== 'position') {
    hoverCell = null;
  }
  $: if (tool !== 'busbar') {
    hoverBoundary = null;
  }
  $: if (tool !== 'connection') {
    pendingFrom = null;
    cursorPoint = null;
    externalPopover = null;
  }

  function run(cmd: Command) {
    stack.execute(cmd, doc);
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  function handleSelect(e: CustomEvent<{ id: string; shiftKey: boolean }>) {
    const { id, shiftKey } = e.detail;

    if (tool === 'connection') {
      handleConnectionPick(id);
      return;
    }
    if (tool !== 'select') return; // placement tools ignore element clicks

    selectedLane = null; // element selection clears lane selection
    if (shiftKey) {
      const next = new Set(selectedIds);
      next.has(id) ? next.delete(id) : next.add(id);
      selectedIds = next;
    } else {
      selectedIds = new Set([id]);
    }
  }

  function clearSelection() {
    if (selectedIds.size > 0) selectedIds = new Set();
    if (selectedLane !== null) selectedLane = null;
  }

  // ── Lane selection ─────────────────────────────────────────────────────────
  function handleSelectLane(e: CustomEvent<{ kind: LaneKind; index: number }>) {
    selectedIds = new Set();
    selectedLane = { kind: e.detail.kind, index: e.detail.index };
  }

  function handleAddLane(e: CustomEvent<{ kind: LaneKind }>) {
    run(new AddLaneCommand(e.detail.kind));
  }

  function deleteLane() {
    if (!selectedLane) return;
    const { kind, index } = selectedLane;
    const isLast = kind === 'col' ? $docStore.grid.cols <= 1 : $docStore.grid.rows <= 1;
    const isEmpty = kind === 'col' ? grid.isColEmpty(index) : grid.isRowEmpty(index);
    if (isLast || !isEmpty) return;
    run(new RemoveLaneCommand(kind, index));
    selectedLane = null;
  }

  function getLaneDeleteTooltip(lane: { kind: LaneKind; index: number }): string {
    const { kind, index } = lane;
    if (kind === 'col') {
      if ($docStore.grid.cols <= 1) return 'The grid must keep at least one column';
      if (!grid.isColEmpty(index)) return 'Cannot delete: the column contains positions';
    } else {
      if ($docStore.grid.rows <= 1) return 'The grid must keep at least one row';
      if (grid.rowKind(index) === 'busbar') return 'Delete the bus bar first';
      if (!grid.isRowEmpty(index)) return 'Cannot delete: the row contains positions';
    }
    return '';
  }

  // ── Connection tool ──────────────────────────────────────────────────────
  function handleConnectionPick(id: string) {
    if (!pendingFrom) {
      // Start from a position or a bar; typical source is a position.
      pendingFrom = id;
      return;
    }
    if (id === pendingFrom) return; // ignore self-click, keep pending

    const a = doc.getElement(pendingFrom);
    const b = doc.getElement(id);
    if (!a || !b) {
      pendingFrom = null;
      return;
    }
    // Reject bar↔bar; a valid connection always involves a position.
    if (a.kind === 'busbar' && b.kind === 'busbar') return;
    // Reject duplicate connection between the same pair.
    const already = doc.connectionsOf(pendingFrom).some((c) => c.elementIds().includes(id));
    if (already) return;

    run(
      new AddElementCommand(new Connection(newId(), '', { kind: 'element', id: pendingFrom }, { kind: 'element', id }))
    );
    pendingFrom = null;
    cursorPoint = null;
  }

  function createExternal(asset: ExternalAssetKind, label: string) {
    if (!pendingFrom || !externalPopover) return;
    const srcGeo = layout.geometry.get(pendingFrom);
    const srcCenterY = srcGeo && 'rect' in srcGeo ? srcGeo.rect.y + srcGeo.rect.height / 2 : externalPopover.point.y;
    const direction = externalPopover.point.y < srcCenterY ? 'up' : 'down';
    const finalLabel = label.trim() || nextExternalLabel(doc, asset);
    run(
      new AddElementCommand(
        new Connection(
          newId(),
          '',
          { kind: 'element', id: pendingFrom },
          { kind: 'external', asset, label: finalLabel, direction }
        )
      )
    );
    pendingFrom = null;
    cursorPoint = null;
    externalPopover = null;
  }

  // ── Edit dialog ────────────────────────────────────────────────────────────
  function handleEditLabel(e: CustomEvent<{ id: string }>) {
    const el = doc.getElement(e.detail.id);
    if (!el) return;
    editElement = el;
    editOpen = true;
  }

  function handleEditSave(e: CustomEvent<{ json: ElementJson }>) {
    if (!editElement) return;
    const before = editElement.toJSON();
    const after = e.detail.json;
    const newId = after.id.trim();
    // An empty or already-taken id can't be applied, so keep the original.
    const renaming = !!newId && newId !== before.id && !doc.getElement(newId);

    // Apply the field edits (label/type/external) in place first, under the
    // current id; then, if the id changed, let the core rename the element and
    // repoint every connection that referenced it (UpdateElementCommand's
    // replaceElement is keyed by id and can't rename).
    after.id = before.id;
    run(new UpdateElementCommand(before, after));
    if (renaming) run(new RenameElementCommand(before.id, newId));

    editElement = null;
  }

  // ── Canvas pointer intents ─────────────────────────────────────────────────
  function nearestBoundary(y: number): number {
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
  }

  function handleCanvasDown(e: CustomEvent<{ point: Point; event: PointerEvent }>) {
    const { point, event } = e.detail;
    if (tool === 'position') {
      const cell = layout.cellAt(point);
      if (cell && grid.isFree(cell)) {
        // Auto-name (line-1, trf-2, …) so drawing stays fast; the user renames
        // later via the edit dialog.
        const type = $sldEditorSettings.positionType;
        run(new AddPositionCommand(new Position(newId(), nextPositionLabel(doc, type), type, cell.row, cell.col)));
      }
    } else if (tool === 'busbar') {
      const at = nearestBoundary(point.y);
      run(new AddBusBarCommand(new BusBar(newId(), '', at), at));
    } else if (
      tool === 'connection' &&
      pendingFrom &&
      doc.getElement(pendingFrom)?.kind === 'position' &&
      layout.cellAt(point) === null
    ) {
      // Clicked in the margin from a position → external endpoint. External
      // assets always hang off a position (the layout can't route bar→external).
      const rect = containerEl.getBoundingClientRect();
      externalPopover = { screenX: event.clientX - rect.left, screenY: event.clientY - rect.top, point };
    }
  }

  function handleCanvasMove(e: CustomEvent<{ point: Point }>) {
    const { point } = e.detail;
    if (tool === 'position') {
      hoverCell = layout.cellAt(point);
      ghostValid = hoverCell ? grid.isFree(hoverCell) : false;
    } else if (tool === 'busbar') {
      hoverBoundary = nearestBoundary(point.y);
    } else if (tool === 'connection' && pendingFrom) {
      cursorPoint = point;
    }
  }

  // ── Drag-move (select tool) ────────────────────────────────────────────────
  function handleElementDragStart(e: CustomEvent<{ id: string; event: PointerEvent }>) {
    if (tool !== 'select') return;
    const el = doc.getElement(e.detail.id);
    if (!(el instanceof Position)) return; // only positions drag-reflow in v0
    drag = {
      id: e.detail.id,
      startClient: { x: e.detail.event.clientX, y: e.detail.event.clientY },
      moved: false,
      plan: null,
      targetCell: null
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
    const point = canvas.clientToSvg(e.clientX, e.clientY);
    const cell = layout.cellAt(point);
    drag = { ...drag, targetCell: cell, plan: cell ? grid.planMove(drag.id, cell) : null };
  }

  function onDragUp() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    if (drag?.moved && drag.plan && drag.plan.moves.length > 0) {
      run(new MoveElementCommand(drag.plan));
    }
    drag = null;
  }

  function cancelDrag() {
    if (!drag) return;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    drag = null;
  }

  onDestroy(() => {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    _vbUnsub?.();
  });

  // ── Toolbar actions ──────────────────────────────────────────────────────
  function deleteSelection() {
    if (selectedIds.size === 0) return;
    run(new DeleteElementsCommand([...selectedIds]));
    selectedIds = new Set();
  }

  function handleDelete() {
    if (selectedLane) deleteLane();
    else deleteSelection();
  }

  function requestMatrix(e: CustomEvent<{ rows: number; cols: number }>) {
    pendingMatrix = e.detail;
    if (doc.isEmpty()) applyMatrix();
    else matrixConfirmOpen = true;
  }

  function applyMatrix() {
    if (!pendingMatrix) return;
    const before = Serializer.toJSON(doc);
    const after = { ...before, grid: { ...pendingMatrix }, elements: [] };
    run(new SnapshotCommand('Create grid', before, after));
    selectedIds = new Set();
    pendingMatrix = null;
    matrixConfirmOpen = false;
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function exportJson() {
    const json = JSON.stringify(Serializer.toJSON(doc), null, 2);
    downloadText(`${slugify(doc.meta.name)}.sld.json`, json, 'application/json');
  }

  function exportSvg() {
    // Standalone, PowerPoint-safe SVG from the same layout the view uses.
    downloadText(`${slugify(doc.meta.name)}.sld.svg`, svgExporter.export(doc), 'image/svg+xml');
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
      if (drag) cancelDrag();
      else if (externalPopover) externalPopover = null;
      else if (pendingFrom) pendingFrom = null;
      else if (selectedLane !== null)
        selectedLane = null; // clear lane before element selection
      else if (tool !== 'select') tool = 'select';
      else clearSelection();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit) {
      e.preventDefault();
      handleDelete();
    } else if (e.shiftKey && e.code === 'Digit1') {
      e.preventDefault();
      canvas?.zoomToFit();
    }
  }

  // ── Overlay derivations ────────────────────────────────────────────────────
  $: draggedType = drag ? (doc.getElement(drag.id) as Position | undefined)?.type ?? 'line' : 'line';

  // Ghost: position-tool hover, or drag target.
  $: ghost =
    tool === 'position' && hoverCell
      ? { rect: layout.cellRect(hoverCell), valid: ghostValid, type: $sldEditorSettings.positionType }
      : drag?.moved && drag.targetCell
        ? { rect: layout.cellRect(drag.targetCell), valid: !!drag.plan, type: draggedType }
        : null;

  // Grid overlay highlight + reflow chain.
  $: overlayHighlight =
    tool === 'position' && hoverCell
      ? { cell: hoverCell, valid: ghostValid }
      : drag?.moved && drag.targetCell
        ? { cell: drag.targetCell, valid: !!drag.plan }
        : null;
  $: chainCells = drag?.plan && drag.moved ? drag.plan.moves.filter((m) => m.id !== drag!.id).map((m) => m.to) : [];
  $: showOverlay = tool === 'position' || tool === 'busbar' || !!drag?.moved;

  // Connection rubber-band anchor.
  function anchorOf(geo: ElementGeometry | undefined, cursor: Point | null): Point | null {
    if (!geo) return null;
    if (geo.kind === 'position') return { x: geo.rect.x + geo.rect.width / 2, y: geo.rect.y + geo.rect.height / 2 };
    if (geo.kind === 'busbar') {
      const cx = cursor
        ? Math.min(Math.max(cursor.x, geo.rect.x), geo.rect.x + geo.rect.width)
        : geo.rect.x + geo.rect.width / 2;
      return { x: cx, y: geo.rect.y + geo.rect.height / 2 };
    }
    return null;
  }
  $: rubberFrom = pendingFrom ? anchorOf(layout.geometry.get(pendingFrom), cursorPoint) : null;

  $: canvasCursor = tool === 'select' ? '' : 'crosshair';
  $: draggingId = drag?.moved ? drag.id : null;
</script>

<svelte:window on:keydown={handleKeydown} />

<div bind:this={containerEl} class="relative h-full w-full overflow-hidden bg-background">
  <SldCanvas
    bind:this={canvas}
    doc={$docStore}
    {layout}
    {selectedIds}
    {draggingId}
    cursor={canvasCursor}
    interactive={true}
    tokens={POSITION_TYPE_TOKENS}
    on:select={handleSelect}
    on:clearselection={clearSelection}
    on:elementdragstart={handleElementDragStart}
    on:editlabel={handleEditLabel}
    on:canvasdown={handleCanvasDown}
    on:canvasmove={handleCanvasMove}
  >
    <svelte:fragment slot="background">
      {#if showLanes}
        <LaneOverlay
          {layout}
          {selectedLane}
          labels={SLD_LANE_OVERLAY_LABELS}
          on:selectlane={handleSelectLane}
          on:addlane={handleAddLane}
        />
      {/if}
    </svelte:fragment>

    {#if showOverlay}
      <GridOverlay
        {layout}
        highlight={overlayHighlight}
        {chainCells}
        boundaryAt={tool === 'busbar' ? hoverBoundary : null}
      />
    {/if}

    {#if rubberFrom && cursorPoint}
      <line
        x1={rubberFrom.x}
        y1={rubberFrom.y}
        x2={cursorPoint.x}
        y2={cursorPoint.y}
        class="stroke-primary"
        stroke-width="2"
        stroke-dasharray="5 4"
      />
    {/if}

    {#if ghost}
      <GhostPreview rect={ghost.rect} valid={ghost.valid} type={ghost.type} tokens={POSITION_TYPE_TOKENS} />
    {/if}
  </SldCanvas>

  <SldToolbar
    bind:editMode
    {userRole}
    {tool}
    {canUndo}
    {canRedo}
    hasSelection={selectedIds.size > 0 || selectedLane !== null}
    positionType={$sldEditorSettings.positionType}
    positionTypeLabels={POSITION_TYPE_LABELS}
    labels={SLD_TOOLBAR_LABELS}
    exportLabels={SLD_EXPORT_LABELS}
    matrixLabels={SLD_MATRIX_LABELS}
    on:settool={(e) => (tool = e.detail)}
    on:settype={(e) => sldEditorSettings.update((s) => ({ ...s, positionType: e.detail }))}
    on:matrix={requestMatrix}
    on:delete={handleDelete}
    on:undo={() => stack.undo(doc)}
    on:redo={() => stack.redo(doc)}
    on:fit={() => canvas?.zoomToFit()}
    on:exportJson={exportJson}
    on:exportSvg={exportSvg}
  />

  {#if externalPopover}
    <ExternalAssetPopover
      x={externalPopover.screenX}
      y={externalPopover.screenY}
      labels={SLD_EXTERNAL_ASSET_LABELS}
      on:confirm={(e) => createExternal(e.detail.asset, e.detail.label)}
      on:cancel={() => (externalPopover = null)}
    />
  {/if}

  {#if selectedLane && chipPos}
    <LaneActionChip
      x={chipPos.x}
      y={chipPos.y}
      lane={selectedLane}
      occupants={selectedLane.kind === 'col'
        ? grid.colOccupants(selectedLane.index)
        : grid.rowOccupants(selectedLane.index)}
      isBarRow={selectedLane.kind === 'row' && grid.rowKind(selectedLane.index) === 'busbar'}
      canDelete={selectedLane.kind === 'col'
        ? grid.isColEmpty(selectedLane.index) && $docStore.grid.cols > 1
        : grid.isRowEmpty(selectedLane.index) && $docStore.grid.rows > 1}
      deleteTooltip={getLaneDeleteTooltip(selectedLane)}
      labels={SLD_LANE_ACTION_CHIP_LABELS}
      on:delete={deleteLane}
      on:close={() => (selectedLane = null)}
    />
  {/if}
</div>

<ElementEditDialog bind:open={editOpen} element={editElement} on:save={handleEditSave} />

<ConfirmationDialog
  bind:open={matrixConfirmOpen}
  title="Replace grid"
  description="This will replace the current grid and delete all elements. Continue?"
  confirmText="Replace"
  cancelText="Cancel"
  on:confirm={applyMatrix}
  on:cancel={() => {
    matrixConfirmOpen = false;
    pendingMatrix = null;
  }}
/>
