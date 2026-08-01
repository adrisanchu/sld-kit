<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    SLD_LAYOUT,
    type CompositeLayout,
    type ChildLayout,
    type CompositeLineLayout,
    type ExternalConnectionTip,
    type Point
  } from '@sld-kit/core';
  import { createPanZoom } from '../panzoom';
  import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
  import type { FormatResolver } from '../format';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
  import ChildDiagramView from './ChildDiagramView.svelte';
  import SelectionFrame from './SelectionFrame.svelte';

  /**
   * SVG host of the composite. A sibling of `SldCanvas`, sharing only the
   * pan/zoom mechanics (via `createPanZoom`). Renders the inter-diagram links
   * beneath the children, each child as a rigid transformed group, and the
   * rotation/selection chrome for the active child on top.
   */
  export let layout: CompositeLayout;
  export let selectedId: string | null = null;
  /** Currently selected manual line (shows its draggable bend handles). */
  export let selectedLineId: string | null = null;
  export let interactive: boolean = true;
  /**
   * Draw mode: clicking the canvas emits `canvaspoint` (snapped to the nearest
   * connection dot when close) instead of clearing the selection. The consumer
   * accumulates the points and commits a line; a double-click emits `drawcommit`.
   */
  export let drawMode: boolean = false;
  /** Connection dots a drawn end can snap to (from `engine.externalConnectionTips`). */
  export let snapTargets: ExternalConnectionTip[] = [];
  /** In-progress polyline being drawn, in composite coordinates. */
  export let draftPoints: Point[] = [];
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /**
   * Per-child color class override (e.g. a voltage bucket). Stays agnostic: the
   * consumer decides the class from the child's resolved document.
   */
  export let childColorClass: (child: ChildLayout) => string | null = () => null;
  /**
   * Per-line color class override (e.g. a voltage bucket, set only when both
   * ends share a voltage). Same contract as `childColorClass`: the class must
   * set `--sld-pos`; `null` falls back to the neutral primary stroke.
   */
  export let lineColorClass: (line: CompositeLineLayout) => string | null = () => null;
  /**
   * Commissioning overlay (new vs. existing assets): a single resolver returning
   * a per-element `ElementFormat`, forwarded to every child. It reads element
   * `data`, so one resolver spans all children. `null` (default) = unchanged.
   */
  export let formatResolver: FormatResolver | null = null;
  /**
   * Numeric presentation config for the children and the composite chrome
   * (link/line stroke widths, dash patterns, handle radii). Defaults reproduce
   * today's look; override via `resolveViewStyle({...})`.
   */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;
  /** Label-visibility toggles, forwarded to every child. */
  export let showPositionLabels: boolean = true;
  export let showBusBarLabels: boolean = true;
  export let showConnectionLabels: boolean = true;
  /**
   * The always-on child diagram name (issue #17). Independent of the label
   * toggles above; on by default.
   */
  export let showChildNames: boolean = true;
  /** Fallback text when a child diagram can't be resolved. */
  export let notFoundLabel: string = DEFAULT_CHILD_NOT_FOUND;

  const dispatch = createEventDispatcher<{
    childdown: { id: string; event: PointerEvent };
    rotatestart: { event: PointerEvent };
    clearselection: void;
    linkdown: { connectionId: string; event: PointerEvent };
    linedown: { id: string; event: PointerEvent };
    linevertexdown: { id: string; index: number; event: PointerEvent };
    /** Remove an intermediate bend (double-click a vertex handle). */
    linevertexdelete: { id: string; index: number };
    /** Add a bend: `index` is the segment (between vertex `index` and `index+1`). */
    linesegmentdown: { id: string; index: number; point: Point; event: PointerEvent };
    canvaspoint: { point: Point; snap: { instanceId: string; connectionId: string } | null };
    drawcommit: void;
  }>();

  /** Snap distance for drawn ends, in composite (SVG) units. */
  const SNAP_RADIUS = 16;

  let svgEl: SVGSVGElement;
  let suppressNextClick = false;

  $: cs = style.composite;
  $: selectedLine = selectedLineId ? layout.lines.find((l) => l.line.id === selectedLineId) ?? null : null;

  function nearestSnap(p: Point): ExternalConnectionTip | null {
    let best: ExternalConnectionTip | null = null;
    let bestDist = SNAP_RADIUS;
    for (const t of snapTargets) {
      const d = Math.hypot(t.point.x - p.x, t.point.y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  function handleLinkDown(connectionId: string, e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('linkdown', { connectionId, event: e });
  }

  function handleLineDown(id: string, e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('linedown', { id, event: e });
  }

  function handleVertexDown(id: string, index: number, e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    // A handle gesture re-renders the chrome; swallow the trailing background
    // click so it can't clear the current line selection.
    suppressNextClick = true;
    dispatch('linevertexdown', { id, index, event: e });
  }

  function handleVertexDblClick(id: string, index: number, e: MouseEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('linevertexdelete', { id, index });
  }

  function handleSegmentDown(id: string, index: number, point: Point, e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    suppressNextClick = true;
    dispatch('linesegmentdown', { id, index, point, event: e });
  }

  const pz = createPanZoom(
    () => svgEl,
    () => layout.bounds
  );
  const viewBox = pz.viewBox;
  const spaceDown = pz.spaceDown;
  const panning = pz.panning;

  $: selectedChild = selectedId ? layout.children.find((c) => c.instance.id === selectedId) ?? null : null;

  export function clientToSvg(clientX: number, clientY: number): Point {
    return pz.clientToSvg(clientX, clientY);
  }

  export function zoomToFit() {
    pz.zoomToFit();
  }

  function handlePointerDown(e: PointerEvent) {
    if (pz.tryStartPan(e)) return;
  }

  function handlePointerMove(e: PointerEvent) {
    pz.movePan(e);
  }

  function handlePointerUp(e: PointerEvent) {
    const res = pz.endPan(e);
    if (res.wasPanning) suppressNextClick = res.moved;
  }

  function handleClick(e: MouseEvent) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (drawMode && interactive) {
      const p = pz.clientToSvg(e.clientX, e.clientY);
      const snap = nearestSnap(p);
      dispatch('canvaspoint', {
        point: snap ? snap.point : p,
        snap: snap ? { instanceId: snap.instanceId, connectionId: snap.connectionId } : null
      });
      return;
    }
    if (e.target === svgEl) dispatch('clearselection');
  }

  function handleDblClick() {
    if (drawMode && interactive) dispatch('drawcommit');
  }

  $: cursorClass = $panning
    ? 'cursor-grabbing'
    : $spaceDown
      ? 'cursor-grab'
      : drawMode && interactive
        ? 'cursor-crosshair'
        : '';

  onMount(() => {
    pz.zoomToFit();
  });
</script>

<svelte:window on:keydown={(e) => pz.handleKey(e, true)} on:keyup={(e) => pz.handleKey(e, false)} />

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<svg
  bind:this={svgEl}
  class="h-full w-full touch-none {cursorClass}"
  viewBox="{$viewBox.x} {$viewBox.y} {$viewBox.w} {$viewBox.h}"
  on:wheel|preventDefault={pz.handleWheel}
  on:pointerdown={handlePointerDown}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
  on:pointerenter={() => pz.setPointerInside(true)}
  on:pointerleave={() => pz.setPointerInside(false)}
  on:click={handleClick}
  on:dblclick={handleDblClick}
>
  <!-- Inter-diagram auto-links (dashed), underneath the children. -->
  {#each layout.links as link (link.connectionId)}
    <polyline
      points={link.points.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      class="stroke-primary/70"
      stroke-width={cs.linkStrokeWidth}
      stroke-dasharray={cs.linkDashArray}
    />
    {#each link.points as p}
      <circle cx={p.x} cy={p.y} r={SLD_LAYOUT.nodeDotRadius} class="fill-primary/70" />
    {/each}
    <!-- Wide transparent hit target: select an auto-link to convert it to a manual line. -->
    <polyline
      points={link.points.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke="transparent"
      stroke-width={style.hitStrokeWidth}
      class:pointer-events-auto={interactive && !drawMode}
      class:cursor-pointer={interactive && !drawMode}
      on:pointerdown={(e) => handleLinkDown(link.connectionId, e)}
    />
  {/each}

  <!-- Manual lines (solid), underneath the children — matches the SVG export.
       Colored by the consumer's `lineColorClass` (e.g. a voltage bucket) exactly
       like a child's connections; falls back to the neutral primary stroke. -->
  {#each layout.lines as ln (ln.line.id)}
    {@const cls = lineColorClass(ln)}
    <polyline
      points={ln.points.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke={cls ? 'currentColor' : undefined}
      class={cls ?? 'stroke-primary'}
      style={cls ? 'color: hsl(var(--sld-pos))' : ''}
      stroke-width={ln.line.id === selectedLineId ? cs.lineSelectedStrokeWidth : cs.lineStrokeWidth}
    />
  {/each}

  <!-- Children in z-order. -->
  {#each layout.children as child (child.instance.id)}
    <ChildDiagramView
      {child}
      {interactive}
      {tokens}
      colorClass={childColorClass(child)}
      {formatResolver}
      {style}
      {showPositionLabels}
      {showBusBarLabels}
      {showConnectionLabels}
      {showChildNames}
      {notFoundLabel}
      on:childdown
      on:labeldown
    />
  {/each}

  <!-- Selection + rotation chrome on top. -->
  {#if selectedChild}
    <SelectionFrame child={selectedChild} {interactive} on:rotatestart />
  {/if}

  <!-- Manual-line chrome on top: hit targets for selection + bend handles. -->
  {#if !drawMode}
    {#each layout.lines as ln (ln.line.id)}
      <polyline
        points={ln.points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="transparent"
        stroke-width={style.hitStrokeWidth}
        class:pointer-events-auto={interactive}
        class:cursor-pointer={interactive}
        on:pointerdown={(e) => handleLineDown(ln.line.id, e)}
      />
    {/each}
  {/if}

  {#if selectedLine && interactive && !drawMode}
    <!-- Hollow "add" handles at each segment midpoint: click-drag to insert a
         new bend. Shown only when every vertex resolved (points ↔ vertices 1:1),
         so the segment index maps straight to a vertex insert position. -->
    {#if selectedLine.points.length === selectedLine.line.vertices.length}
      {#each selectedLine.points.slice(0, -1) as p, i}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <circle
          cx={(p.x + selectedLine.points[i + 1].x) / 2}
          cy={(p.y + selectedLine.points[i + 1].y) / 2}
          r={cs.addHandleRadius}
          class="fill-background stroke-primary/50 pointer-events-auto cursor-copy"
          stroke-width={cs.handleStrokeWidth}
          stroke-dasharray={cs.addHandleDashArray}
          on:pointerdown={(e) =>
            handleSegmentDown(
              selectedLine.line.id,
              i,
              { x: (p.x + selectedLine.points[i + 1].x) / 2, y: (p.y + selectedLine.points[i + 1].y) / 2 },
              e
            )}
        >
          <title>Click to add a bend</title>
        </circle>
      {/each}
    {/if}

    <!-- Only free bend vertices are draggable; anchored ends follow their child.
         Double-click removes the bend. -->
    {#each selectedLine.line.vertices as v, i}
      {#if v.kind === 'point'}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <circle
          cx={v.x}
          cy={v.y}
          r={cs.vertexHandleRadius}
          class="fill-background stroke-primary pointer-events-auto cursor-grab"
          stroke-width={cs.handleStrokeWidth}
          on:pointerdown={(e) => handleVertexDown(selectedLine.line.id, i, e)}
          on:dblclick={(e) => handleVertexDblClick(selectedLine.line.id, i, e)}
        >
          <title>Drag to move · double-click to delete</title>
        </circle>
      {/if}
    {/each}
  {/if}

  <!-- Draw-mode overlay: snap targets + in-progress polyline. -->
  {#if drawMode && interactive}
    {#each snapTargets as t}
      <circle
        cx={t.point.x}
        cy={t.point.y}
        r={cs.snapHandleRadius}
        class="fill-background stroke-primary/60"
        stroke-width={cs.handleStrokeWidth}
      />
    {/each}
    {#if draftPoints.length > 0}
      {#if draftPoints.length > 1}
        <polyline
          points={draftPoints.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          class="stroke-primary"
          stroke-width={cs.draftStrokeWidth}
          stroke-dasharray={cs.draftDashArray}
        />
      {/if}
      {#each draftPoints as p}
        <circle cx={p.x} cy={p.y} r={cs.draftPointRadius} class="fill-primary" />
      {/each}
    {/if}
  {/if}

  <slot />
</svg>
