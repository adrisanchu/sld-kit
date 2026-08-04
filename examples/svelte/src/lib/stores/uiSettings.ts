import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Persisted app-shell UI state (chrome only, no diagram content): whether the
 * desktop sidebar is collapsed to an icon rail. Follows the sldEditorSettings
 * localStorage store pattern.
 */
const STORAGE_KEY = 'sldUiSettings';

interface UiSettings {
  sidebarCollapsed: boolean;
}

const defaults: UiSettings = { sidebarCollapsed: false };

function createUiSettingsStore() {
  let initial = defaults;
  if (browser) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) initial = { ...defaults, ...JSON.parse(stored) };
    } catch {
      // Corrupt storage — fall back to defaults.
    }
  }

  const store = writable<UiSettings>(initial);
  store.subscribe((value) => {
    if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  });
  return store;
}

export const uiSettings = createUiSettingsStore();
