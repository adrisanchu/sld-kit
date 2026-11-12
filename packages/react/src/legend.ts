import type { ElementFormat, PositionTally } from '@sld-kit/core';

/**
 * One column of `AssetLegend`: a category key from the tally, its display
 * label, and the `ElementFormat` the canvas applies to it (drawn as the column's
 * swatch, so the legend doubles as a key). The array order is the column order.
 */
export interface AssetLegendCategory {
  key: string;
  label: string;
  format?: ElementFormat;
}

/** What `AssetLegend` renders: a core tally, optionally with a composite's unresolved count. */
export type AssetLegendTally = PositionTally & { unresolved?: number };

/** Own-property count lookup: open-string keys (e.g. `constructor`) must not hit the prototype. */
export function countOf(rec: Record<string, number> | undefined, key: string): number {
  return rec && Object.prototype.hasOwnProperty.call(rec, key) ? rec[key] : 0;
}

/**
 * The legend's columns: listed categories first (in the given order), then any
 * tally keys the consumer didn't list (labelled by their key). Columns with no
 * positions are dropped.
 */
export function legendColumns(
  tally: AssetLegendTally,
  categories: AssetLegendCategory[],
  uncategorised: string
): AssetLegendCategory[] {
  const listed = new Set(categories.map((c) => c.key));
  const extra = tally.categories
    .filter((key) => !listed.has(key))
    .map((key) => ({ key, label: key === '' ? uncategorised : key }));
  return [...categories, ...extra].filter((c) => countOf(tally.byCategory, c.key) > 0);
}
