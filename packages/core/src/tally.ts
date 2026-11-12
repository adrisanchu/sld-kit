import type { SldDocument } from './SldDocument';
import type { Position } from './elements/Position';
import { DEFAULT_POSITION_TYPES } from './types';

/**
 * How `tallyPositions` buckets positions on its second (category) axis.
 *
 * The library never reads `data` itself: the consumer decides what a category
 * is (a commissioning tag, an owner, a date bucket…) and returns its key.
 */
export interface TallyOptions {
  /**
   * Category key per position. `undefined` (or no callback at all) puts the
   * position in the `''` (uncategorised) bucket.
   */
  category?: (pos: Position) => string | undefined;
}

/** Position counts by type, by category, and their cross-tab. */
export interface PositionTally {
  /** Positions counted. */
  total: number;
  /** type → count. */
  byType: Record<string, number>;
  /** category key → count (`''` = uncategorised). */
  byCategory: Record<string, number>;
  /** type → category → count (the cross-tab). */
  cells: Record<string, Record<string, number>>;
  /** Types present: `DEFAULT_POSITION_TYPES` order first, then first-seen. */
  types: string[];
  /** Category keys present, first-seen order. */
  categories: string[];
}

const DEFAULT_TYPE_ORDER = new Map<string, number>(DEFAULT_POSITION_TYPES.map((t, i) => [t, i]));

/**
 * Count the positions of one or more diagrams by type and by a consumer-defined
 * category. Pure: reads `doc.positions()` only, never mutates.
 *
 * ```ts
 * const t = tallyPositions([doc], { category: (p) => myTag(p) ?? 'existing' });
 * t.cells.renewable?.future; // renewables tagged "future"
 * ```
 */
export function tallyPositions(docs: Iterable<SldDocument>, opts: TallyOptions = {}): PositionTally {
  // Maps, not plain objects: open-string keys (e.g. `constructor`) must not hit the prototype.
  const byType = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const cells = new Map<string, Map<string, number>>();
  let total = 0;

  for (const doc of docs) {
    for (const pos of doc.positions()) {
      const type = pos.type;
      const cat = opts.category?.(pos) ?? '';
      byType.set(type, (byType.get(type) ?? 0) + 1);
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      let row = cells.get(type);
      if (!row) cells.set(type, (row = new Map()));
      row.set(cat, (row.get(cat) ?? 0) + 1);
      total++;
    }
  }

  // Stable sort: defaults keep their canonical order, custom types follow first-seen.
  const rank = (t: string) => DEFAULT_TYPE_ORDER.get(t) ?? DEFAULT_TYPE_ORDER.size;
  const types = [...byType.keys()].sort((a, b) => rank(a) - rank(b));

  return {
    total,
    byType: Object.fromEntries(byType),
    byCategory: Object.fromEntries(byCategory),
    cells: Object.fromEntries([...cells].map(([t, row]) => [t, Object.fromEntries(row)])),
    types,
    categories: [...byCategory.keys()]
  };
}
