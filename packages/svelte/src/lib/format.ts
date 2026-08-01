import type { SldElement, ElementFormat } from '@sld-kit/core';

/**
 * A per-element formatting overlay for the live views — the orthogonal
 * "commissioning" axis (new vs. existing assets). Mirrors the core theme's
 * `resolveElementFormat`: returns an `ElementFormat` (stroke width + fill
 * opacity) to layer on top of the type/voltage color, or `null`/`undefined`
 * to leave the element unchanged.
 *
 * Build one with `makeCommissioningResolver(map, fallback)` from `@sld-kit/core`
 * so the same config drives both the SVG export and the live canvas.
 */
export type FormatResolver = (el: SldElement) => ElementFormat | null | undefined;
