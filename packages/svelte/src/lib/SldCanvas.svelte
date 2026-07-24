<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { SldDocument, DiagramLayout, Point } from '@sld-kit/core';
  import BusBarView from './elements/BusBarView.svelte';
  import PositionView from './elements/PositionView.svelte';
  import ConnectionView from './elements/ConnectionView.svelte';
  import { createPanZoom } from './panzoom';
  import { DEFAULT_POSITION_TOKENS, type PositionTokens } from './labels';

  /**
   * SVG host of the diagram. Owns the viewBox (pan/zoom) and renders the
   * element views; all editing state lives in the parent editor, which
   * receives selection/drag intents as events and passes results back via
   * props. The default slot renders inside the SVG, on top of the
   * elements — the editor injects overlays (grid slots, ghost) there.
   */
  export let doc: SldDocument;
  export let layout: DiagramLayout;
  export let selectedIds: Set<string> = new Set();
  export let interactive: boolean = true;
  /** Id of the position currently being dragged (renders dimmed). */
  export let draggingId: string | null = null;
  /** Extra cursor override while a tool is active (e.g. 'crosshair'). */
  export let cursor: string = '';
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /**
   * Overrides the per-type token with a single color class for the whole
   * diagram (e.g. a voltage bucket). The class must set `--sld-pos`.
   */
  export let colorClass: string | null = null;
  /** Label-visibility toggles, mapped to each element view's `showLabel`. */
  export let showPositionLabels: boolean = true;
  export let showConnectionLabels: boolean = true;
  export let showBusBarLabels: boolean = true;

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    clearselection: void;
    elementdragstart: { id: string; event: PointerEvent };
    editlabel: { id: string };
    canvasdown: { point: Point; event: PointerEvent };
    canvasmove: { point: Point; event: PointerEvent };
    canvasup: { point: Point; event: PointerEvent };
  }>();

  let svgEl: SVGSVGElement;
  let suppressNextClick = false;

  const pz = createPanZoom(
    () => svgEl,
    () => layout.size
  );
  const viewBox = pz.viewBox;
  const spaceDown = pz.spaceDown;
  const panning = pz.panning;

  $: connectionItems = doc.connections().flatMap((el) => {
    const geo = layout.geometry.get(el.id);
    return geo?.kind === 'connection' ? [{ el, geo }] : [];
  });
  $: busBarItems = doc.busBars().flatMap((el) => {
    const geo = layout.geometry.get(el.id);
    return geo?.kind === 'busbar' ? [{ el, geo }] : [];
  });
  $: positionItems = doc.positions().flatMap((el) => {
    const geo = layout.geometry.get(el.id);
    return geo?.kind === 'position' ? [{ el, geo }] : [];
  });

  /** Convert client (mouse) coordinates to SVG user coordinates. */
  export function clientToSvg(clientX: number, clientY: number): Point {
    return pz.clientToSvg(clientX, clientY);
  }

  /** Convert SVG user coordinates to client (screen) coordinates. */
  export function svgToClient(svgX: number, svgY: number): Point {
    return pz.svgToClient(svgX, svgY);
  }

  /** Fit the whole diagram in view with 5% padding. */
  export function zoomToFit() {
    pz.zoomToFit();
  }

  /** Expose the viewBox store so callers can subscribe and react to pan/zoom. */
  export function getViewBox() {
    return viewBox;
  }

  function handlePointerDown(e: PointerEvent) {
    if (pz.tryStartPan(e)) return;
    if (e.button === 0) {
      dispatch('canvasdown', { point: pz.clientToSvg(e.clientX, e.clientY), event: e });
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (pz.movePan(e)) return;
    dispatch('canvasmove', { point: pz.clientToSvg(e.clientX, e.clientY), event: e });
  }

  function handlePointerUp(e: PointerEvent) {
    const res = pz.endPan(e);
    if (res.wasPanning) {
      // A drag-pan ends with a synthetic click on the background; swallow it
      // so the pan doesn't also clear the selection.
      suppressNextClick = res.moved;
      return;
    }
    dispatch('canvasup', { point: pz.clientToSvg(e.clientX, e.clientY), event: e });
  }

  /** Click on empty background clears the selection (unless we just panned). */
  function handleClick(e: MouseEvent) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (e.target === svgEl) dispatch('clearselection');
  }

  $: cursorClass = $panning
    ? 'cursor-grabbing'
    : $spaceDown
      ? 'cursor-grab'
      : cursor === 'crosshair'
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
>
  <slot name="background" />
  {#each connectionItems as item (item.el.id)}
    <ConnectionView
      conn={item.el}
      geo={item.geo}
      selected={selectedIds.has(item.el.id)}
      {interactive}
      {colorClass}
      showLabel={showConnectionLabels}
      on:select
      on:editlabel
    />
  {/each}
  {#each busBarItems as item (item.el.id)}
    <BusBarView
      bar={item.el}
      geo={item.geo}
      selected={selectedIds.has(item.el.id)}
      {interactive}
      {colorClass}
      showLabel={showBusBarLabels}
      on:select
      on:editlabel
    />
  {/each}
  {#each positionItems as item (item.el.id)}
    <PositionView
      pos={item.el}
      geo={item.geo}
      selected={selectedIds.has(item.el.id)}
      dragging={draggingId === item.el.id}
      {interactive}
      {tokens}
      {colorClass}
      showLabel={showPositionLabels}
      on:select
      on:dragstart={(e) => dispatch('elementdragstart', e.detail)}
      on:editlabel={(e) => dispatch('editlabel', e.detail)}
    />
  {/each}
  <slot />
</svg>
