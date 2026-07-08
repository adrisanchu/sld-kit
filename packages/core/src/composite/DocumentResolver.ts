import type { SldDocumentJson } from '../types';

/**
 * How a composite finds the library JSON of one of its children. A consumer
 * injects an adapter over its own document store; tests use `MapResolver`.
 *
 * A resolver that returns JSON whose `kind` is `'composite'` is treated by the
 * caller (`DiagramInstance.resolve`) as unresolvable — this closes the
 * composite-in-composite door at the core level, not only at the import boundary.
 */
export interface DocumentResolver {
  resolve(libraryId: string): SldDocumentJson | null;
}

/** In-memory resolver for demos and tests. */
export class MapResolver implements DocumentResolver {
  constructor(private docs: Map<string, SldDocumentJson>) {}

  resolve(id: string): SldDocumentJson | null {
    return this.docs.get(id) ?? null;
  }
}
