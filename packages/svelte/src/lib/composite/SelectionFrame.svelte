<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ChildLayout, Point } from '@sld-kit/core';
  import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
  import { bracketPaths, frameGeometry, type FrameCorners } from './frameGeometry';

  /**
   * Selection chrome for the active child, drawn in world coordinates (OUTSIDE
   * the child's transform): a rotated outline through `worldCorners`, corner
   * dots (visual only, no resize), and a Figma-style rotation handle — a small
   * circle offset from the top-edge midpoint along the rotated "up" direction.
   *
   * Styleable from the app (headless chrome):
   * - classes `sld-selection` (root, with `data-state="selected" | "hover"`,
   *   plus `data-hover="true"` / `data-section` while the pointer is over it),
   *   `sld-selection-outline`, `sld-selection-corner`, `sld-selection-rotate`;
   * - CSS custom properties `--sld-selection-stroke` (colour, default the
   *   `text-primary` currentColor), `--sld-selection-width`, `--sld-selection-dash`
   *   (default the `style` numbers). Custom properties cross Svelte's style
   *   scoping, so a plain global stylesheet can set them.
   */
  export let child: ChildLayout;
  export let interactive: boolean = true;
  /**
   * `selected` (default) draws the full chrome with the rotation handle;
   * `hover` draws the same frame without it, faded (`opacity` 0.55 — a
   * presentation attribute, so any CSS rule overrides it). Exposed as `data-state`.
   */
  export let state: 'selected' | 'hover' = 'selected';
  /** The selected child is also under the pointer: adds `data-hover="true"`. */
  export let hovered: boolean = false;
  /** Section box under the pointer (box view, split child): `data-section`. */
  export let section: string | undefined = undefined;
  /**
   * World corners to frame [TL, TR, BR, BL]; default `child.worldCorners`. Pass a
   * section box's (core `sectionWorldCorners`) to frame just that section.
   */
  export let frameCorners: readonly Point[] | undefined = undefined;
  /**
   * Corner treatment: `dots` (default), `brackets` (L-shaped arms of
   * `style.composite.selection.cornerArm`) or `none`. Both shapes carry
   * `sld-selection-corner`; `data-corners` on the root names the choice.
   */
  export let cornerStyle: FrameCorners = 'dots';
  /**
   * The child's colour class (e.g. a voltage bucket setting `--sld-pos`), put on
   * the root so a stylesheet can tint the frame — e.g.
   * `.sld-selection { --sld-selection-stroke: hsl(var(--sld-pos)) }`. Paint is
   * unchanged unless a rule uses it.
   */
  export let colorClass: string | null = null;
  /** Extra class(es) on the root `<g>`. */
  let className: string = '';
  export { className as class };
  /** Numbers come from `style.composite.selection`. */
  export let style: SldViewStyle = DEFAULT_VIEW_STYLE;

  const dispatch = createEventDispatcher<{ rotatestart: { event: PointerEvent } }>();

  const stroke = 'stroke: var(--sld-selection-stroke, currentColor)';

  $: sel = style.composite.selection;
  $: geo = frameGeometry(frameCorners ?? child.worldCorners, sel.padding, sel.rotateHandleOffset);
  $: outlineStyle = `${stroke}; stroke-width: var(--sld-selection-width, ${sel.strokeWidth}); stroke-dasharray: var(--sld-selection-dash, ${sel.dashArray})`;
  $: rootClass = ['sld-selection text-primary pointer-events-none', colorClass, className].filter(Boolean).join(' ');

  function handleRotateDown(e: PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    dispatch('rotatestart', { event: e });
  }
</script>

<g
  class={rootClass}
  data-state={state}
  data-hover={hovered ? 'true' : undefined}
  data-section={section}
  data-corners={cornerStyle === 'dots' ? undefined : cornerStyle}
  opacity={state === 'hover' ? 0.55 : undefined}
>
  <polygon points={geo.points} fill="none" class="sld-selection-outline" style={outlineStyle} />
  {#if cornerStyle === 'brackets'}
    {#each bracketPaths(geo.corners, sel.cornerArm) as d}
      <path
        {d}
        fill="none"
        class="sld-selection-corner"
        style={stroke}
        stroke-width={sel.strokeWidth * 2}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {/each}
  {:else if cornerStyle === 'dots'}
    {#each geo.corners as c}
      <circle
        cx={c.x}
        cy={c.y}
        r={sel.cornerRadius}
        class="sld-selection-corner fill-background"
        style={stroke}
        stroke-width={sel.strokeWidth}
      />
    {/each}
  {/if}

  <!-- Rotation handle (selected only) -->
  {#if state === 'selected'}
    <g class="sld-selection-rotate">
      <line
        x1={geo.topMid.x}
        y1={geo.topMid.y}
        x2={geo.handle.x}
        y2={geo.handle.y}
        style={stroke}
        stroke-width={sel.strokeWidth}
      />
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <circle
        cx={geo.handle.x}
        cy={geo.handle.y}
        r={sel.rotateHandleRadius}
        class="fill-background"
        class:pointer-events-auto={interactive}
        class:cursor-grab={interactive}
        style={stroke}
        stroke-width={sel.strokeWidth}
        on:pointerdown={handleRotateDown}
      />
    </g>
  {/if}
</g>
