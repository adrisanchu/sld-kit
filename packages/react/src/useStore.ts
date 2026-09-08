import { useSyncExternalStore } from 'react';
import type { ReadableStore } from './store';

/**
 * Read a `ReadableStore` (the panzoom stores) into React state.
 *
 * `get` is a valid `getSnapshot`: the store only replaces its value on `set`,
 * so the reference is stable between mutations and React's `Object.is` check
 * behaves. The third argument is the server snapshot — the same getter, since
 * these stores are seeded with a plain value and never touch the DOM.
 */
export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
