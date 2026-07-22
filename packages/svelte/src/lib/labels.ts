import type { ExternalAssetKind } from '@sld-kit/core';

/**
 * Injectable presentation strings and token maps for the SLD components.
 *
 * The library ships English defaults; every visible string is overridable via
 * a component's `labels` prop so consumers can localize without forking. The
 * `positionTokens` map is the class-per-type contract from the (headless)
 * theming model — the library only emits the class names; the consumer's CSS
 * (`.sld-pos-*` classes setting the `--sld-pos` custom property) supplies the
 * actual colors.
 */

/** CSS class applied per position type. */
export type PositionTokens = Record<string, string>;

export const DEFAULT_POSITION_TOKENS: PositionTokens = {
  line: 'sld-pos-line',
  transformer: 'sld-pos-transformer',
  central: 'sld-pos-central',
  renewable: 'sld-pos-renewable',
  reserve: 'sld-pos-reserve'
};

/** Human-readable label per position type (used in tooltips + the type picker). */
export const DEFAULT_POSITION_TYPE_LABELS: Record<string, string> = {
  line: 'Line position',
  transformer: 'Transformer position',
  central: 'Central position',
  renewable: 'Renewable position',
  reserve: 'Reserve position'
};

export interface SldToolbarLabels {
  fit: string;
  export: string;
  editMode: string;
  exitEditMode: string;
  select: string;
  matrix: string;
  addBusBar: string;
  addPosition: string;
  addConnection: string;
  delete: string;
  undo: string;
  redo: string;
  escKey: string;
  hintBusBar: string;
  hintConnection: string;
  /** Receives the active position type's label. */
  hintPosition: (typeLabel: string) => string;
}

export const DEFAULT_TOOLBAR_LABELS: SldToolbarLabels = {
  fit: 'Zoom to fit (Shift+1)',
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
  hintBusBar: 'Add bus bar: click a row edge',
  hintConnection: 'Connection: click source then target (or the margin from a position for an external asset)',
  hintPosition: (typeLabel) => `Add position (${typeLabel}): click an empty slot`
};

export interface PositionTypeFlyoutLabels {
  title: string;
  /** Label per position type shown in the picker. */
  types: Record<string, string>;
}

export const DEFAULT_POSITION_TYPE_FLYOUT_LABELS: PositionTypeFlyoutLabels = {
  title: 'Position type',
  types: DEFAULT_POSITION_TYPE_LABELS
};

export interface MatrixCreatorLabels {
  heading: string;
}

export const DEFAULT_MATRIX_LABELS: MatrixCreatorLabels = {
  heading: 'New grid (rows × columns)'
};

export interface ExportFlyoutLabels {
  json: string;
  svg: string;
}

export const DEFAULT_EXPORT_LABELS: ExportFlyoutLabels = {
  json: 'Export JSON',
  svg: 'Export SVG'
};

export interface ExternalAssetPopoverLabels {
  heading: string;
  placeholder: string;
  cancel: string;
  confirm: string;
  kinds: Record<ExternalAssetKind, string>;
}

export const DEFAULT_EXTERNAL_ASSET_LABELS: ExternalAssetPopoverLabels = {
  heading: 'External asset',
  placeholder: 'Label (optional)',
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

export interface LaneOverlayLabels {
  /** Tooltip for column `index1` (1-based). */
  columnTitle: (index1: number) => string;
  /** Tooltip for row `index1` (1-based). */
  rowTitle: (index1: number) => string;
  addColumn: string;
  addRow: string;
}

export const DEFAULT_LANE_OVERLAY_LABELS: LaneOverlayLabels = {
  columnTitle: (i) => `Column ${i}`,
  rowTitle: (i) => `Row ${i}`,
  addColumn: 'Add column',
  addRow: 'Add row'
};

export interface LaneActionChipLabels {
  columnTitle: (index1: number) => string;
  rowTitle: (index1: number) => string;
  empty: string;
  /** Pluralized position count, e.g. "3 positions" / "1 position". */
  positions: (count: number) => string;
  busBar: string;
  delete: string;
}

export const DEFAULT_LANE_ACTION_CHIP_LABELS: LaneActionChipLabels = {
  columnTitle: (i) => `Column ${i}`,
  rowTitle: (i) => `Row ${i}`,
  empty: 'Empty',
  positions: (n) => `${n} ${n !== 1 ? 'positions' : 'position'}`,
  busBar: '1 bus bar',
  delete: 'Delete'
};

export interface CompositeToolbarLabels {
  fit: string;
  export: string;
  select: string;
  import: string;
  delete: string;
  undo: string;
  redo: string;
}

export const DEFAULT_COMPOSITE_TOOLBAR_LABELS: CompositeToolbarLabels = {
  fit: 'Zoom to fit (Shift+1)',
  export: 'Export',
  select: 'Select',
  import: 'Import diagram',
  delete: 'Delete selected (Del)',
  undo: 'Undo (Ctrl+Z)',
  redo: 'Redo (Ctrl+Shift+Z)'
};

/** Fallback text for a composite child whose diagram can't be resolved. */
export const DEFAULT_CHILD_NOT_FOUND = 'Diagram not found';
