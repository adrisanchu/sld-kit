<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChildLayout, Point } from '@sld-kit/core';

  /**
   * Selection chrome for the active child, drawn in world coordinates (OUTSIDE
   * the child's transform): a rotated outline through `worldCorners`, corner
   * dots (visual only, no resize), and a Figma-style rotation handle — a small
   * circle offset from the top-edge midpoint along the rotated "up" direction.
   */
  export let child: ChildLayout;
  export let interactive: boolean = true;

  const dispatch = createEventDispatcher<{ rotatestart: { event: PointerEvent } }>();

  const HANDLE_OFFSET = 28;

  $: corners = child.worldCorners; // [TL, TR, BR, BL]
  $: polyPoints = corners.map((p) => `${p.x},${p.y}`).join(' ');

  $: center = {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  } as Point;
  $: topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 } as Point;
  $: up = normalize({ x: topMid.x - center.x, y: topMid.y - center.y });
  $: handle = { x: topMid.x + up.x * HANDLE_OFFSET, y: topMid.y + up.y * HANDLE_OFFSET } as Point;

  function normalize(v: Point): Point {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
  }

  function handleRotateDown(e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    dispatch('rotatestart', { event: e });
  }
</script>

<g class="pointer-events-none">
  <polygon points={polyPoints} fill="none" class="stroke-primary" stroke-width="1.5" stroke-dasharray="6 4" />
  {#each corners as c}
    <circle cx={c.x} cy={c.y} r="3.5" class="fill-background stroke-primary" stroke-width="1.5" />
  {/each}

  <!-- Rotation handle -->
  <line x1={topMid.x} y1={topMid.y} x2={handle.x} y2={handle.y} class="stroke-primary" stroke-width="1.5" />
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <circle
    cx={handle.x}
    cy={handle.y}
    r="6"
    class="fill-background stroke-primary"
    class:pointer-events-auto={interactive}
    class:cursor-grab={interactive}
    stroke-width="1.5"
    on:pointerdown={handleRotateDown}
  />
</g>
