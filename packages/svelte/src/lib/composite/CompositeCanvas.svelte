<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { SLD_LAYOUT, type CompositeLayout, type ChildLayout, type Point } from '@sld-kit/core';
  import { createPanZoom } from '../panzoom';
  import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
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
  export let interactive: boolean = true;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /**
   * Per-child color class override (e.g. a voltage bucket). Stays agnostic: the
   * consumer decides the class from the child's resolved document.
   */
  export let childColorClass: (child: ChildLayout) => string | null = () => null;
  /** Label-visibility toggles, forwarded to every child. */
  export let showPositionLabels: boolean = true;
  export let showBusBarLabels: boolean = true;
  export let showConnectionLabels: boolean = true;
  /** Fallback text when a child diagram can't be resolved. */
  export let notFoundLabel: string = DEFAULT_CHILD_NOT_FOUND;

  const dispatch = createEventDispatcher<{
    childdown: { id: string; event: PointerEvent };
    rotatestart: { event: PointerEvent };
    clearselection: void;
  }>();

  let svgEl: SVGSVGElement;
  let suppressNextClick = false;

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
    if (e.target === svgEl) dispatch('clearselection');
  }

  $: cursorClass = $panning ? 'cursor-grabbing' : $spaceDown ? 'cursor-grab' : '';

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
  <!-- Inter-diagram links, underneath the children. -->
  {#each layout.links as link (link.connectionId)}
    <polyline
      points={link.points.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      class="stroke-primary/70"
      stroke-width="2"
      stroke-dasharray="6 4"
    />
    {#each link.points as p}
      <circle cx={p.x} cy={p.y} r={SLD_LAYOUT.nodeDotRadius} class="fill-primary/70" />
    {/each}
  {/each}

  <!-- Children in z-order. -->
  {#each layout.children as child (child.instance.id)}
    <ChildDiagramView
      {child}
      {interactive}
      {tokens}
      colorClass={childColorClass(child)}
      {showPositionLabels}
      {showBusBarLabels}
      {showConnectionLabels}
      {notFoundLabel}
      on:childdown
    />
  {/each}

  <!-- Selection + rotation chrome on top. -->
  {#if selectedChild}
    <SelectionFrame child={selectedChild} {interactive} on:rotatestart />
  {/if}

  <slot />
</svg>
