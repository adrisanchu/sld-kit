/**
 * A minimal observable, the React-side replacement for `svelte/store`'s
 * `writable`. `panzoom.ts` is otherwise framework-agnostic and needs somewhere
 * to keep `viewBox` / `spaceDown` / `panning`; this is that, in ~20 lines and
 * with no dependency.
 *
 * The shape (`subscribe` returning an unsubscribe) deliberately matches both
 * the Svelte store contract and what `useSyncExternalStore` wants, so the same
 * store can be read from a hook or imperatively via `get()`.
 */
export interface ReadableStore<T> {
  subscribe(fn: (value: T) => void): () => void;
  get(): T;
}

export interface WritableStore<T> extends ReadableStore<T> {
  set(value: T): void;
}

export function writable<T>(initial: T): WritableStore<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const fn of listeners) fn(next);
    },
    subscribe(fn: (value: T) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn) as unknown as void;
    }
  };
}
