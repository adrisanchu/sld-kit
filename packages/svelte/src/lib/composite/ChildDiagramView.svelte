<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChildLayout } from '@sld-kit/core';
  import BusBarView from '../elements/BusBarView.svelte';
  import PositionView from '../elements/PositionView.svelte';
  import ConnectionView from '../elements/ConnectionView.svelte';
  import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';

  /**
   * Renders one placed child as a rigid whole inside its `Transform2D` group:
   * the child's own element views (read-only, `interactive={false}`), with a
   * transparent full-frame rect on top capturing pointer events for whole-child
   * selection and dragging — the "rigid PNG" feel with zero per-element
   * handlers. Selection chrome lives OUTSIDE this transform (see SelectionFrame),
   * in world coordinates.
   */
  export let child: ChildLayout;
  export let interactive: boolean = true;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /** Fallback text when a child diagram can't be resolved. */
  export let notFoundLabel: string = DEFAULT_CHILD_NOT_FOUND;

  const dispatch = createEventDispatcher<{ childdown: { id: string; event: PointerEvent } }>();

  $: instance = child.instance;
  $: layout = child.layout;
  $: resolved = instance.resolved;
  // Labels ride with the diagram; the layout engine's {0,180} flip keeps them
  // aligned with the boxes while never leaving them upside-down.
  $: labelAngleDeg = child.labelAngleDeg;

  $: connectionItems =
    layout && resolved
      ? resolved.connections().flatMap((el) => {
          const geo = layout!.geometry.get(el.id);
          return geo?.kind === 'connection' ? [{ el, geo }] : [];
        })
      : [];
  $: busBarItems =
    layout && resolved
      ? resolved.busBars().flatMap((el) => {
          const geo = layout!.geometry.get(el.id);
          return geo?.kind === 'busbar' ? [{ el, geo }] : [];
        })
      : [];
  $: positionItems =
    layout && resolved
      ? resolved.positions().flatMap((el) => {
          const geo = layout!.geometry.get(el.id);
          return geo?.kind === 'position' ? [{ el, geo }] : [];
        })
      : [];

  function handleDown(e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    dispatch('childdown', { id: instance.id, event: e });
  }
</script>

<g transform={child.transform.toSvgTransform()}>
  {#if resolved && layout}
    {#each connectionItems as item (item.el.id)}
      <ConnectionView conn={item.el} geo={item.geo} interactive={false} {labelAngleDeg} />
    {/each}
    {#each busBarItems as item (item.el.id)}
      <BusBarView bar={item.el} geo={item.geo} interactive={false} {labelAngleDeg} />
    {/each}
    {#each positionItems as item (item.el.id)}
      <PositionView pos={item.el} geo={item.geo} interactive={false} {labelAngleDeg} {tokens} />
    {/each}
  {:else}
    <!-- Placeholder for a missing/corrupt child -->
    <rect
      x={child.frame.x}
      y={child.frame.y}
      width={child.frame.width}
      height={child.frame.height}
      rx="8"
      fill="none"
      class="stroke-muted-foreground"
      stroke-width="2"
      stroke-dasharray="8 6"
    />
    <text
      x={child.frame.x + child.frame.width / 2}
      y={child.frame.height / 2 - 8}
      text-anchor="middle"
      font-size="16"
      class="select-none fill-muted-foreground font-medium"
    >
      {notFoundLabel}
    </text>
    <text
      x={child.frame.x + child.frame.width / 2}
      y={child.frame.height / 2 + 14}
      text-anchor="middle"
      font-size="13"
      class="select-none fill-muted-foreground"
    >
      {instance.libraryId}
    </text>
  {/if}

  <!-- Transparent capture rect for whole-child pointer interaction. -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <rect
    x={child.frame.x}
    y={child.frame.y}
    width={child.frame.width}
    height={child.frame.height}
    fill="transparent"
    class:cursor-move={interactive}
    on:pointerdown={handleDown}
  />
</g>
