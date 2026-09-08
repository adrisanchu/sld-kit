/**
 * @sld-kit/react — React components for single-line diagrams.
 *
 * A headless pan/zoom canvas, element views and event-dispatching editor
 * chrome on top of `@sld-kit/core`. Components never open dialogs or persist
 * state themselves: they emit semantic callbacks and accept injectable label
 * maps (English defaults) and a `positionTokens` class map, so the consuming
 * app owns theming, localization, dialogs and orchestration.
 *
 * The sibling of `@sld-kit/svelte`; see `packages/README.md` for the component
 * parity table and the porting conventions.
 */

// ── Canvas + element views ────────────────────────────────────────────────
export { SldCanvas, type SldCanvasProps, type SldCanvasHandle } from './SldCanvas';
export { PositionView, type PositionViewProps } from './elements/PositionView';
export { BusBarView, type BusBarViewProps } from './elements/BusBarView';
export { ConnectionView, type ConnectionViewProps } from './elements/ConnectionView';
export { GhostPreview, type GhostPreviewProps } from './elements/GhostPreview';
export { GridOverlay, type GridOverlayProps } from './elements/GridOverlay';
export { LaneOverlay, type LaneOverlayProps, type Lane } from './elements/LaneOverlay';

// ── Editor chrome (event-dispatching, no dialogs) ─────────────────────────
// Pending — see packages/README.md for the port status.

// ── Composite ("diagram of diagrams") canvas primitives ───────────────────
// Pending — see packages/README.md for the port status.

// ── Flow overlay (generic animated lines; domain-agnostic) ────────────────
// Pending — see packages/README.md for the port status.

// ── Utilities ─────────────────────────────────────────────────────────────
export { createPanZoom, type PanZoom, type ViewBox, type ContentBounds } from './panzoom';
export { writable, type ReadableStore, type WritableStore } from './store';
export { useStore } from './useStore';
export { useSldDocument, type Subscribable } from './useSldDocument';
export { useCommandStack, type CommandStackLike, type UndoRedoState } from './useCommandStack';
export { downloadText, slugify } from './download';
export { type FormatResolver } from './format';
export { DEFAULT_VIEW_STYLE, resolveViewStyle, type SldViewStyle } from './style';

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
