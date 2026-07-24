/**
 * App-owned presentation maps for single-line diagrams. `@sld-kit/core` is
 * headless and `@sld-kit/svelte` ships English defaults for every visible
 * string, so a consumer injects its own copy + tokens here and passes them to
 * each component via its `labels` prop. This example keeps them in English;
 * swap the strings below to localise the editor.
 */
import type {
  SldToolbarLabels,
  MatrixCreatorLabels,
  ExportFlyoutLabels,
  ExternalAssetPopoverLabels,
  LaneOverlayLabels,
  LaneActionChipLabels,
  CompositeToolbarLabels
} from '@sld-kit/svelte';
import { SLD_LAYOUT, type SldLayoutConfig } from '@sld-kit/core';

/**
 * Maps a document's voltage (kV) to a CSS class from `app.css` used in the
 * "by-voltage" color mode. Thresholds are intentionally simple for now:
 * ≥ 400 kV reads red, 200–< 400 kV green, everything else gray.
 */
export function voltageToken(kv?: number): string {
  if (kv == null) return 'sld-volt-unknown';
  if (kv >= 400) return 'sld-volt-hv';
  if (kv >= 200) return 'sld-volt-mv';
  return 'sld-volt-unknown';
}

/**
 * Tighter layout used when position labels are hidden: with no name to read
 * inside a box, columns and boxes can shrink so a whole site fits at a glance.
 */
export const COMPACT_LAYOUT: SldLayoutConfig = {
  ...SLD_LAYOUT,
  cellWidth: 64,
  positionBoxWidth: 44,
  positionBoxHeight: 36,
  cellGapX: 16,
  cellHeight: 64
};

/**
 * CSS class per position type, used by the live Svelte views. The classes are
 * styled in `src/app.css` with CSS variables (`--sld-pos-*`) so dark mode
 * works; the SVG exporter never uses these — it bakes literal colours from the
 * package's `DEFAULT_THEME`.
 */
export const POSITION_TYPE_TOKENS: Record<string, string> = {
  line: 'sld-pos-line',
  transformer: 'sld-pos-transformer',
  central: 'sld-pos-central',
  renewable: 'sld-pos-renewable',
  reserve: 'sld-pos-reserve'
};

/** Human-readable labels for position types — UI + tooltips. */
export const POSITION_TYPE_LABELS: Record<string, string> = {
  line: 'Line position',
  transformer: 'Transformer position',
  central: 'Central position',
  renewable: 'Renewable position',
  reserve: 'Reserve position'
};

/** Strings for the `@sld-kit/svelte` editor toolbar. */
export const SLD_TOOLBAR_LABELS: SldToolbarLabels = {
  fit: 'Fit to view (Shift+1)',
  export: 'Export',
  editMode: 'Edit mode (Ctrl+E)',
  exitEditMode: 'Exit edit mode (Ctrl+E)',
  select: 'Select (V)',
  matrix: 'Create grid',
  addBusBar: 'Add bus bar (B)',
  addPosition: 'Add position (P)',
  addConnection: 'Add connection (C)',
  delete: 'Delete selection (Del)',
  undo: 'Undo (Ctrl+Z)',
  redo: 'Redo (Ctrl+Shift+Z)',
  escKey: 'Esc',
  colorMode: 'Color by voltage',
  labelMode: (mode) =>
    mode === 'all'
      ? 'Labels: all (click to hide names)'
      : mode === 'topology'
        ? 'Labels: bus bars & lines (click to hide all)'
        : 'Labels: hidden (click to show all)',
  hintBusBar: 'Add bus bar: click a row edge',
  hintConnection: 'Connection: click source then target (or click the margin from a position for an external asset)',
  hintPosition: (typeLabel) => `Add position (${typeLabel}): click an empty cell`
};

export const SLD_MATRIX_LABELS: MatrixCreatorLabels = {
  heading: 'New grid (rows × columns)'
};

export const SLD_EXPORT_LABELS: ExportFlyoutLabels = {
  json: 'Export JSON',
  svg: 'Export SVG'
};

export const SLD_EXTERNAL_ASSET_LABELS: ExternalAssetPopoverLabels = {
  heading: 'External asset',
  placeholder: 'Label (optional, e.g. FEEDER A)',
  cancel: 'Cancel',
  confirm: 'Add',
  kinds: {
    line: 'Line',
    transformer: 'Transformer',
    renewable: 'Renewable',
    storage: 'Storage',
    demand: 'Demand'
  }
};

export const SLD_LANE_OVERLAY_LABELS: LaneOverlayLabels = {
  columnTitle: (i) => `Column ${i}`,
  rowTitle: (i) => `Row ${i}`,
  addColumn: 'Add column',
  addRow: 'Add row'
};

export const SLD_LANE_ACTION_CHIP_LABELS: LaneActionChipLabels = {
  columnTitle: (i) => `Column ${i}`,
  rowTitle: (i) => `Row ${i}`,
  empty: 'Empty',
  positions: (n) => `${n} ${n !== 1 ? 'positions' : 'position'}`,
  busBar: '1 bus bar',
  delete: 'Delete'
};

export const SLD_COMPOSITE_TOOLBAR_LABELS: CompositeToolbarLabels = {
  fit: 'Fit to view (Shift+1)',
  export: 'Export',
  select: 'Select',
  import: 'Import diagram',
  delete: 'Delete selected (Del)',
  undo: 'Undo (Ctrl+Z)',
  redo: 'Redo (Ctrl+Shift+Z)'
};

/** Fallback text for an unresolved composite child. */
export const SLD_CHILD_NOT_FOUND = 'Diagram not found';
