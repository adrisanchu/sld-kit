<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CompositeLayout, ChildLayout } from '@sld-kit/core';
  import CompositeCanvas from './CompositeCanvas.svelte';
  import FlowOverlay from '../flow/FlowOverlay.svelte';
  import LineLabelOverlay from '../flow/LineLabelOverlay.svelte';
  import { worldLines } from '../flow/worldLines';
  import type { FlowResolver, LineLabelResolver } from '../flow/flow';
  import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
  import type { FormatResolver } from '../format';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

  /**
   * A read-only, "operate & watch" view of a composite: pan/zoom the whole grid,
   * click a diagram to *fly into* it, then click its operable elements — all on
   * one seamless canvas (no route change, no dialog). A generic `FlowOverlay`
   * animates travelling dots along every line via the consumer's `resolveFlow`.
   *
   * Domain-agnostic: it emits `elementactivate {instanceId, elementId}` and
   * `focuschange {id|null}`; what an activation *means* (open a switch, …) and
   * what a line's flow *is* are entirely the consumer's policy.
   */
  export let layout: CompositeLayout;
  /** Maps a `worldLines` key to its animated style; `null` hides that line's flow. */
  export let resolveFlow: FlowResolver = () => null;
  /** Maps a `worldLines` key to a dynamic text label (e.g. MW / rating); `null` = none. */
  export let resolveLineLabel: LineLabelResolver = () => null;
  /** Element `data` → `ElementFormat` overlay (e.g. overloaded = red), like the editor. */
  export let formatResolver: FormatResolver | null = null;
  /** Freeze all flow motion (e.g. offscreen / reduced-motion handled by consumer). */
  export let paused: boolean = false;
  /** Fly duration in ms for both fly-in and fly-out. */
  export let flyDurationMs: number = 450;

  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  export let childColorClass: (child: ChildLayout) => string | null = () => null;
  /** Per-child connection-only colour override (e.g. leave lines neutral for the flow overlay). */
  export let childConnectionColorClass: ((child: ChildLayout) => string | null) | undefined = undefined;
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;
  export let showPositionLabels: boolean = true;
  export let showBusBarLabels: boolean = true;
  export let showConnectionLabels: boolean = true;
  export let showChildNames: boolean = true;
  export let notFoundLabel: string = DEFAULT_CHILD_NOT_FOUND;

  /** The child currently flown into, or `null` at the grid-overview level. Bindable. */
  export let focusedId: string | null = null;

  const dispatch = createEventDispatcher<{
    elementactivate: { instanceId: string; elementId: string };
    focuschange: { id: string | null };
  }>();

  let canvas: CompositeCanvas;

  $: lines = worldLines(layout);

  function focusChild(id: string) {
    const child = layout.children.find((c) => c.instance.id === id);
    if (!child) return;
    focusedId = id;
    canvas?.flyTo(child.worldBounds, { durationMs: flyDurationMs });
    dispatch('focuschange', { id });
  }

  /** Fly back out to the whole-grid overview. Also bound to an external back control. */
  export function blur() {
    if (focusedId === null) return;
    focusedId = null;
    canvas?.flyToFit({ durationMs: flyDurationMs });
    dispatch('focuschange', { id: null });
  }

  export function zoomToFit() {
    canvas?.zoomToFit();
  }
</script>

<CompositeCanvas
  bind:this={canvas}
  {layout}
  explore
  {focusedId}
  {tokens}
  {childColorClass}
  {childConnectionColorClass}
  {formatResolver}
  {style}
  {showPositionLabels}
  {showBusBarLabels}
  {showConnectionLabels}
  {showChildNames}
  {notFoundLabel}
  on:childfocus={(e) => focusChild(e.detail.id)}
  on:elementactivate={(e) => dispatch('elementactivate', e.detail)}
  on:clearselection={() => blur()}
>
  <!-- On top of the children, sharing the same world viewBox. Pointer-transparent
       so clicks still reach the diagrams underneath. -->
  <FlowOverlay {lines} {resolveFlow} {paused} />
  <LineLabelOverlay {lines} resolveLabel={resolveLineLabel} />
</CompositeCanvas>
