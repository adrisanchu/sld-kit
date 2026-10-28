<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { SldDocument, DiagramLayout, Point } from '@sld-kit/core';
  import BusBarView from './elements/BusBarView.svelte';
  import PositionView from './elements/PositionView.svelte';
  import ConnectionView from './elements/ConnectionView.svelte';
  import { createPanZoom } from './panzoom';
  import { DEFAULT_POSITION_TOKENS, type PositionTokens } from './labels';
  import type { FormatResolver } from './format';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from './style';
  import type { ElementHover } from './hover';
  import type { FrameCorners } from './composite/frameGeometry';

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
  /**
   * Whether a plain drag pans the canvas: mouse left-drag on empty background,
   * or a single finger on touch. Set to `false` while a placement tool is
   * active so taps/clicks reach the tool instead of panning. Middle-button,
   * space+left, wheel, and two-finger pinch pan/zoom regardless.
   */
  export let panOnDrag: boolean = true;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /**
   * Overrides the per-type token with a single color class for the whole
   * diagram (e.g. a voltage bucket). The class must set `--sld-pos`.
   */
  export let colorClass: string | null = null;
  /**
   * Generic per-element formatting overlay: `(el) => ElementFormat` (stroke
   * width / dash / fill opacity), threaded to every element view. The app owns
   * the policy (e.g. style by a `data` field); `null` (default) leaves rendering
   * unchanged. Pass the same function as the exporter's `theme.resolveElementFormat`.
   */
  export let formatResolver: FormatResolver | null = null;
  /**
   * Numeric presentation config (stroke widths, opacities, selection halo),
   * forwarded to every element view. Defaults reproduce today's look; override
   * via `resolveViewStyle({...})`.
   */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;
  /** Label-visibility toggles, mapped to each element view's `showLabel`. */
  export let showPositionLabels: boolean = true;
  export let showConnectionLabels: boolean = true;
  export let showBusBarLabels: boolean = true;
  /**
   * Draw the selection halo (`sld-halo`, `data-state="hover"`, faded) around the
   * bus bar or position under the pointer too. Default `false`.
   */
  export let hoverHalo: boolean = false;
  /**
   * Corner brackets on the bus bar / position halos (`brackets`, sized by
   * `style.selection.cornerArm` / `hoverCornerArm`); `none` (default) = plain dashes.
   */
  export let haloCorners: FrameCorners = 'none';
  /** Widen each bus bar's hit area by this many px (bars are thin). Default 0. */
  export let busBarHitSlop: number = 0;

  const dispatch = createEventDispatcher<{
    select: { id: string; shiftKey: boolean };
    /**
     * The element under the pointer changed; `null` when it leaves every
     * element. Cleared while a button is held (dragging, panning).
     */
    elementhover: ElementHover | null;
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

  /** Zoom in/out one step about the current view centre (toolbar buttons). */
  export function zoomIn() {
    pz.zoomIn();
  }
  export function zoomOut() {
    pz.zoomOut();
  }

  /** Expose the viewBox store so callers can subscribe and react to pan/zoom. */
  export function getViewBox() {
    return viewBox;
  }

  function handlePointerDown(e: PointerEvent) {
    if (pz.tryStartPan(e, { panOnDrag, background: e.target === svgEl })) return;
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
    : cursor === 'crosshair'
      ? 'cursor-crosshair'
      : $spaceDown || panOnDrag
        ? 'cursor-grab'
        : '';

  onMount(() => {
    pz.zoomToFit();
  });

  // ── Hover ─────────────────────────────────────────────────────────────────
  // Element views report enter/leave; the canvas keeps the latest and masks it
  // while a button is down (drag, pan), like `CompositeCanvas`.
  let rawHover: ElementHover | null = null;
  let pressed = false;
  function reportHover(kind: ElementHover['kind'], { id, hovered }: { id: string; hovered: boolean }) {
    if (hovered) {
      if (rawHover?.id !== id) rawHover = { id, kind };
    } else if (rawHover?.id === id) rawHover = null;
  }
  $: masked = pressed || $panning;
  $: hover = masked ? null : rawHover;
  let lastHoverId: string | null = null;
  $: if ((hover?.id ?? null) !== lastHoverId) {
    lastHoverId = hover?.id ?? null;
    dispatch('elementhover', hover);
  }
  $: haloOnHover = hoverHalo && !masked;
</script>

<svelte:window
  on:keydown={(e) => pz.handleKey(e, true)}
  on:keyup={(e) => pz.handleKey(e, false)}
  on:pointerup={() => (pressed = false)}
  on:pointercancel={() => (pressed = false)}
/>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
<svg
  bind:this={svgEl}
  class="h-full w-full touch-none {cursorClass}"
  viewBox="{$viewBox.x} {$viewBox.y} {$viewBox.w} {$viewBox.h}"
  on:wheel|preventDefault={pz.handleWheel}
  on:pointerdown={handlePointerDown}
  on:pointerdown|capture={() => (pressed = true)}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
  on:pointercancel={handlePointerUp}
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
      {formatResolver}
      {doc}
      {style}
      showLabel={showConnectionLabels}
      on:hover={(e) => reportHover('connection', e.detail)}
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
      {formatResolver}
      {style}
      showLabel={showBusBarLabels}
      hoverHalo={haloOnHover}
      {haloCorners}
      hitSlop={busBarHitSlop}
      on:hover={(e) => reportHover('busbar', e.detail)}
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
      {formatResolver}
      {style}
      showLabel={showPositionLabels}
      hoverHalo={haloOnHover}
      {haloCorners}
      on:hover={(e) => reportHover('position', e.detail)}
      on:select
      on:dragstart={(e) => dispatch('elementdragstart', e.detail)}
      on:editlabel={(e) => dispatch('editlabel', e.detail)}
    />
  {/each}
  <slot />
</svg>
