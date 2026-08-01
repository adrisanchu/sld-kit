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

/**
 * Commissioning metadata for an element: *when* (an ISO date string) and/or
 * *from where* (an open category string, e.g. `'existing'`, `'decree-X'`,
 * `'future'`). This is the SLD-native shape; a future `@sld-kit/cim` adapter
 * maps it onto `data.cim.asset.lifecycleDate` / `lifecycleState`.
 */
export interface CommissioningInfo {
  /** ISO date string (`YYYY-MM-DD`), structured-cloneable — never a `Date`. */
  date?: string;
  /** Open-string origin category; resolved to formatting by a theme. */
  category?: string;
}

/**
 * The reserved `data.sld` namespace (see ADR 0001 D2). Adapters and consumers
 * keep their own top-level keys under `data` so they never clobber each other.
 */
export interface SldNamespaceData {
  commissioning?: CommissioningInfo;
}

/** Read an element's commissioning info from the reserved `data.sld` namespace. */
export function getCommissioning(el: SldElement): CommissioningInfo | undefined {
  return (el.data as { sld?: SldNamespaceData } | undefined)?.sld?.commissioning;
}

/**
 * Return a new `data` value with `commissioning` set under `data.sld`, preserving
 * every other namespace/key. Passing `undefined` (or an empty info) removes the
 * key. Pure — does not mutate `data`; callers apply the result through a command
 * (e.g. `UpdateElementCommand`) so undo/redo stays complete.
 */
export function withCommissioning(data: unknown, info: CommissioningInfo | undefined): unknown {
  const base = (typeof data === 'object' && data !== null ? { ...data } : {}) as Record<string, unknown>;
  const sld = { ...(base.sld as SldNamespaceData | undefined) };
  const empty = !info || (info.date === undefined && info.category === undefined);
  if (empty) delete sld.commissioning;
  else sld.commissioning = info;
  if (Object.keys(sld).length === 0) delete base.sld;
  else base.sld = sld;
  return Object.keys(base).length === 0 ? undefined : base;
}
