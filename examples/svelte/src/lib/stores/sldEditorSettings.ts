import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { PositionType } from '@sld-kit/core';

/**
 * Persisted SLD editor UI preferences (not diagram content): the position type
 * used by the "add position" tool, plus the display toggles (color mode,
 * label visibility and the composite asset legend). Follows the mapDrawingSettings localStorage store pattern.
 */
export interface SldEditorSettings {
  positionType: PositionType;
  /** Color positions/bars/lines by type or by the diagram's voltage. */
  colorMode: 'by-type' | 'by-voltage';
  /** Which labels to show; hiding position labels compacts the layout. */
  labelMode: 'all' | 'topology' | 'none';
  /** Show the composite editor's asset-count legend. */
  showLegend: boolean;
}

const STORAGE_KEY = 'sldEditorSettings';

const defaultSettings: SldEditorSettings = {
  positionType: 'line',
  colorMode: 'by-type',
  labelMode: 'all',
  showLegend: false
};

function createSldEditorSettingsStore() {
  let initial = defaultSettings;
  if (browser) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) initial = { ...defaultSettings, ...JSON.parse(stored) };
    } catch {
      // Corrupt storage — fall back to defaults.
    }
  }

  const store = writable<SldEditorSettings>(initial);

  store.subscribe((value) => {
    if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  });

  return store;
}

export const sldEditorSettings = createSldEditorSettingsStore();
