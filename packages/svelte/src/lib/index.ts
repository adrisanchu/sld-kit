/**
 * @sld-kit/svelte — Svelte 4 components for single-line diagrams.
 *
 * A headless pan/zoom canvas, element views and event-dispatching editor
 * chrome on top of `@sld-kit/core`. Components never open dialogs or persist
 * state themselves: they dispatch semantic events and accept injectable label
 * maps (English defaults) and a `positionTokens` class map, so the consuming
 * app owns theming, localization, dialogs and orchestration.
 */

// ── Canvas + element views ────────────────────────────────────────────────
export { default as SldCanvas } from './SldCanvas.svelte';
export { default as PositionView } from './elements/PositionView.svelte';
export { default as BusBarView } from './elements/BusBarView.svelte';
export { default as ConnectionView } from './elements/ConnectionView.svelte';
export { default as GhostPreview } from './elements/GhostPreview.svelte';
export { default as GridOverlay } from './elements/GridOverlay.svelte';
export { default as LaneOverlay } from './elements/LaneOverlay.svelte';

// ── Editor chrome (event-dispatching, no dialogs) ─────────────────────────
export { default as SldToolbar } from './SldToolbar.svelte';
export { default as PositionTypeFlyout } from './PositionTypeFlyout.svelte';
export { default as MatrixCreatorFlyout } from './MatrixCreatorFlyout.svelte';
export { default as ExportFlyout } from './ExportFlyout.svelte';
export { default as ExternalAssetPopover } from './ExternalAssetPopover.svelte';
export { default as LaneActionChip } from './LaneActionChip.svelte';

// ── Composite ("diagram of diagrams") canvas primitives ───────────────────
export { default as CompositeCanvas } from './composite/CompositeCanvas.svelte';
export { default as CompositeToolbar } from './composite/CompositeToolbar.svelte';
export { default as ChildDiagramView } from './composite/ChildDiagramView.svelte';
export { default as SelectionFrame } from './composite/SelectionFrame.svelte';

// ── Utilities ─────────────────────────────────────────────────────────────
export { createPanZoom, type PanZoom, type ViewBox, type ContentBounds } from './panzoom';
export { createDocStore, type Subscribable } from './docStore';
export { downloadText, slugify } from './download';

// ── Injectable labels + tokens ────────────────────────────────────────────
export {
  DEFAULT_POSITION_TOKENS,
  DEFAULT_POSITION_TYPE_LABELS,
  DEFAULT_TOOLBAR_LABELS,
  DEFAULT_POSITION_TYPE_FLYOUT_LABELS,
  DEFAULT_MATRIX_LABELS,
  DEFAULT_EXPORT_LABELS,
  DEFAULT_EXTERNAL_ASSET_LABELS,
  DEFAULT_LANE_OVERLAY_LABELS,
  DEFAULT_LANE_ACTION_CHIP_LABELS,
  DEFAULT_COMPOSITE_TOOLBAR_LABELS,
  DEFAULT_CHILD_NOT_FOUND,
  type PositionTokens,
  type SldToolbarLabels,
  type PositionTypeFlyoutLabels,
  type MatrixCreatorLabels,
  type ExportFlyoutLabels,
  type ExternalAssetPopoverLabels,
  type LaneOverlayLabels,
  type LaneActionChipLabels,
  type CompositeToolbarLabels
} from './labels';
