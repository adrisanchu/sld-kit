/**
 * Orthogonal routing now lives in `@sld-kit/core` (the layout applies it), so
 * the guarantee holds for authored *and* drawn lines, on screen and in export.
 * Re-exported here so the draw-mode draft preview (which renders outside the
 * layout) can use the exact same function.
 */
export { orthogonalizePolyline } from '@sld-kit/core';
