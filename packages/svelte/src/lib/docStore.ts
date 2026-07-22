import { readable, type Readable } from 'svelte/store';

/** Anything with a change-notification `subscribe` (SldDocument, CompositeDocument). */
export interface Subscribable {
  subscribe(fn: (change: unknown) => void): () => void;
}

/**
 * Bridge a core document's change events into a Svelte store.
 * `set(doc)` with the same reference still notifies subscribers (Svelte
 * treats objects as always-changed), so downstream `$:` blocks re-derive
 * layout/lists after every document mutation. Generic over the document type,
 * so it serves both single diagrams and composites.
 */
export function createDocStore<T extends Subscribable>(doc: T): Readable<T> {
  return readable(doc, (set) => doc.subscribe(() => set(doc)));
}
