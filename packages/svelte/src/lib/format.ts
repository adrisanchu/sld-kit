import type { SldElement, ElementFormat } from '@sld-kit/core';

/**
 * A generic per-element formatting overlay for the live views. Mirrors the core
 * theme's `resolveElementFormat`: returns an `ElementFormat` (stroke width /
 * dash / fill opacity) to layer on top of the type/voltage color, or
 * `null`/`undefined` to leave the element unchanged.
 *
 * The consumer owns the policy (e.g. read a `data.sld.commissioning` tag). Pass
 * the same function to the exporter's `theme.resolveElementFormat` so the live
 * canvas and the SVG export agree.
 */
export type FormatResolver = (el: SldElement) => ElementFormat | null | undefined;
