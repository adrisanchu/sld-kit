<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChildLayout } from '@sld-kit/core';
  import BusBarView from '../elements/BusBarView.svelte';
  import PositionView from '../elements/PositionView.svelte';
  import ConnectionView from '../elements/ConnectionView.svelte';
  import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
  import type { FormatResolver } from '../format';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

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
  /**
   * Explore mode (read-only transforms, operable internals). When set, a click
   * on a non-focused child emits `childfocus`; a `focused` child's positions
   * become interactive and emit `elementactivate` instead of selecting the whole
   * child. Independent of the editor's `interactive` selection/drag path.
   */
  export let explore: boolean = false;
  /** In explore mode, this child is the one flown into — its internals are live. */
  export let focused: boolean = false;
  /** Fade this child back (e.g. it's not the one currently focused). */
  export let dimmed: boolean = false;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;
  /**
   * Overrides the per-type token with a single color class for this child (e.g.
   * a voltage bucket). The class must set `--sld-pos`.
   */
  export let colorClass: string | null = null;
  /** Commissioning overlay (stroke width + fill opacity), forwarded to each view. */
  export let formatResolver: FormatResolver | null = null;
  /** Numeric presentation config, forwarded to each element view. */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;
  /** Label-visibility toggles, forwarded to each element view. */
  export let showPositionLabels: boolean = true;
  export let showBusBarLabels: boolean = true;
  export let showConnectionLabels: boolean = true;
  /**
   * The always-on diagram name at the child's top-left. Independent of the
   * label-visibility toggles above (issue #17); on by default.
   */
  export let showChildNames: boolean = true;
  /** Fallback text when a child diagram can't be resolved. */
  export let notFoundLabel: string = DEFAULT_CHILD_NOT_FOUND;

  const dispatch = createEventDispatcher<{
    childdown: { id: string; event: PointerEvent };
    /** Explore mode: the user clicked this (non-focused) child to fly into it. */
    childfocus: { id: string; event: PointerEvent };
    /** Explore mode: the user clicked an operable element inside the focused child. */
    elementactivate: { instanceId: string; elementId: string };
  }>();

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
    if (explore) dispatch('childfocus', { id: instance.id, event: e });
    else dispatch('childdown', { id: instance.id, event: e });
  }

  function handleElementActivate(elementId: string) {
    dispatch('elementactivate', { instanceId: instance.id, elementId });
  }
</script>

<g transform={child.transform.toSvgTransform()} opacity={dimmed ? 0.3 : 1} class="sld-child">
  {#if resolved && layout}
    {#each connectionItems as item (item.el.id)}
      <ConnectionView
        conn={item.el}
        geo={item.geo}
        interactive={false}
        {labelAngleDeg}
        {colorClass}
        {formatResolver}
        {style}
        showLabel={showConnectionLabels}
      />
    {/each}
    {#each busBarItems as item (item.el.id)}
      <BusBarView
        bar={item.el}
        geo={item.geo}
        interactive={false}
        {labelAngleDeg}
        {colorClass}
        {formatResolver}
        {style}
        showLabel={showBusBarLabels}
      />
    {/each}
    {#each positionItems as item (item.el.id)}
      <PositionView
        pos={item.el}
        geo={item.geo}
        interactive={explore && focused}
        {labelAngleDeg}
        {tokens}
        {colorClass}
        {formatResolver}
        {style}
        showLabel={showPositionLabels}
        on:select={() => handleElementActivate(item.el.id)}
      />
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

  <!-- Always-on diagram name at its chosen slot, larger + bold so it stands
       apart from the element labels. Rides with the child's orientation plus the
       label's own rotation (direction + {0,180} readability flip). Independent
       of the label-visibility toggles (issue #17). Placement is edited from the
       toolbar (pointer-transparent so clicking it just selects the diagram). -->
  {#if showChildNames}
    <text
      x={child.nameLabel.x}
      y={child.nameLabel.y}
      text-anchor={child.nameLabel.textAnchor}
      font-size={child.nameLabel.fontSize}
      transform="rotate({child.nameLabel.rotation} {child.nameLabel.x} {child.nameLabel.y})"
      class="pointer-events-none select-none fill-foreground font-bold"
    >
      {child.name}
    </text>
  {/if}

  <!-- Transparent capture rect for whole-child pointer interaction. In explore
       mode it selects the child to fly into (childfocus); the editor uses it for
       select/drag (childdown). Dropped for the focused child so its internal
       positions receive the clicks directly. -->
  {#if !(explore && focused)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <rect
      x={child.frame.x}
      y={child.frame.y}
      width={child.frame.width}
      height={child.frame.height}
      fill="transparent"
      class:cursor-move={interactive && !explore}
      class:cursor-pointer={interactive && explore}
      on:pointerdown={handleDown}
    />
  {/if}
</g>

<style>
  /* Smooth the dim/undim as focus flies between children. */
  .sld-child {
    transition: opacity 0.3s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .sld-child {
      transition: none;
    }
  }
</style>
