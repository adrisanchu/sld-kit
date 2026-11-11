import type { SldDocument } from '../SldDocument';
import { tallyPositions, type PositionTally, type TallyOptions } from '../tally';
import type { CompositeDocument } from './CompositeDocument';

/** A `PositionTally` over a whole composite, plus how many children it covers. */
export interface CompositeTally extends PositionTally {
  /** Resolved children whose positions were counted. */
  diagrams: number;
  /** Unresolved children (missing/corrupt → placeholder): excluded from every count. */
  unresolved: number;
}

/**
 * Count positions across every **resolved** child of a composite (see
 * `tallyPositions` for the axes). Each placed instance counts, so a library
 * diagram placed twice contributes twice. Unresolved children have no content
 * to count: they are left out and reported in `unresolved` instead.
 */
export function tallyComposite(doc: CompositeDocument, opts: TallyOptions = {}): CompositeTally {
  const resolved: SldDocument[] = [];
  let unresolved = 0;
  for (const child of doc.allChildren()) {
    if (child.resolved) resolved.push(child.resolved);
    else unresolved++;
  }
  return { ...tallyPositions(resolved, opts), diagrams: resolved.length, unresolved };
}
