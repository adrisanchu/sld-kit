/**
 * Floating-connector box router (example-local; not yet promoted to
 * `@sld-kit/core`). Resolves a composite's line endpoints to the active view's
 * frame — box perimeter or SLD arrow tip — and routes the bends orthogonally, so
 * the same document lays out cleanly in both the box and detail views. See
 * `docs/requirements/simplified-sld-box/floating-connectors-plan.md`.
 */
export { BoxLayoutEngine, type BoxLayoutResult } from './BoxLayoutEngine';
export { OrthogonalRouter } from './OrthogonalRouter';
export { PortResolver } from './PortResolver';
export { Port } from './Port';
export { SIDE_VECTORS, sideAxis, sideFromAngle, type BoxSide } from './side';
export * from './constants';
