import { useMemo, useSyncExternalStore } from 'react';

/** Anything with a change-notification `subscribe` (SldDocument, CompositeDocument). */
export interface Subscribable {
  subscribe(fn: (change: unknown) => void): () => void;
}

/**
 * Bridge a core document's change events into React — the analogue of the
 * Svelte adapter's `createDocStore`.
 *
 * **Why a counter and not the document itself.** `SldDocument` and
 * `CompositeDocument` mutate **in place**: `subscribe` fires, but the object
 * reference never changes. Svelte's `set(doc)` re-notifies anyway; React's
 * `Object.is` check on a snapshot would see no change and skip the re-render.
 * So the snapshot is a monotonic version number, and callers derive from it:
 *
 * ```tsx
 * const version = useSldDocument(doc);
 * const layout = useMemo(() => engine.layout(doc), [doc, engine, version]);
 * ```
 *
 * That chain is the React spelling of the Svelte editor's
 * `docStore → engine → layout → grid` derivation.
 *
 * Generic over the document type, so it serves single diagrams and composites
 * alike. A single core subscription is shared by every React subscriber and
 * released once the last one unsubscribes.
 */
export function useSldDocument<T extends Subscribable>(doc: T): number {
  const store = useMemo(() => {
    let version = 0;
    let unsubscribeDoc: (() => void) | null = null;
    const listeners = new Set<() => void>();

    return {
      subscribe(onStoreChange: () => void): () => void {
        listeners.add(onStoreChange);
        unsubscribeDoc ??= doc.subscribe(() => {
          version++;
          for (const fn of listeners) fn();
        });
        return () => {
          listeners.delete(onStoreChange);
          if (listeners.size === 0) {
            unsubscribeDoc?.();
            unsubscribeDoc = null;
          }
        };
      },
      getSnapshot(): number {
        return version;
      }
    };
  }, [doc]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
