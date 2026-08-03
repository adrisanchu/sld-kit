import type { SldElement } from './elements/Element';

/**
 * Read an element's opaque `data` channel, narrowed to `T`.
 *
 * This is a cast, not a validated conversion: the library never inspects
 * `data`, so `T` reflects the shape the consumer *wrote*, not a guarantee.
 * Apps that need guarantees should validate at their own boundary (e.g. zod).
 *
 * ```ts
 * interface BayData { ratingA: number; owner: string }
 * const info = getElementData<BayData>(position);
 * info?.ratingA; // number | undefined
 * ```
 */
export function getElementData<T>(el: SldElement): T | undefined {
  return el.data as T | undefined;
}
