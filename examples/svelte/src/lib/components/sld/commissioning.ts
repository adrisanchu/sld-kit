/**
 * Commissioning — a **consumer-owned** domain concept, not part of `@sld-kit/core`.
 *
 * The core is domain-agnostic: it stores arbitrary `data` and exposes a single
 * generic styling seam, `SldTheme.resolveElementFormat(el) => ElementFormat`
 * (and the same shape as a `formatResolver` prop on the live views). This module
 * is the SLD app's *policy*: it reads a commissioning tag out of `data.sld` and
 * maps it to a generic `ElementFormat`. Swap this file to style by anything else
 * (a CIM class, a voltage, a date bucket) without touching the library.
 */
import type { SldElement, ElementFormat } from '@sld-kit/core';
import { COMMISSIONING_FORMATS } from './theme';

/**
 * Commissioning metadata for an element: *when* (an ISO date string) and/or
 * *from where* (an open category string, e.g. `'existing'`, `'decree-x'`,
 * `'future'`), stored in the reserved `data.sld` namespace.
 */
export interface CommissioningInfo {
  /** ISO date string (`YYYY-MM-DD`) — structured-cloneable, never a `Date`. */
  date?: string;
  /** Open-string origin category, mapped to formatting by `commissioningResolver`. */
  category?: string;
}

interface SldNamespaceData {
  commissioning?: CommissioningInfo;
}

/** Read an element's commissioning info from the reserved `data.sld` namespace. */
export function getCommissioning(el: SldElement): CommissioningInfo | undefined {
  return (el.data as { sld?: SldNamespaceData } | undefined)?.sld?.commissioning;
}

/**
 * Return a new `data` value with `commissioning` set under `data.sld`, preserving
 * every other namespace/key. Passing `undefined` (or an empty info) removes the
 * key. Pure — callers apply the result through an `UpdateElementCommand` so
 * undo/redo stays complete.
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

/**
 * The app's styling policy: map an element's commissioning category to an
 * `ElementFormat`. Passed to the core exporter (`theme.resolveElementFormat`)
 * and to the live views (`formatResolver`), so screen and export agree.
 */
export function commissioningResolver(el: SldElement): ElementFormat | undefined {
  const category = getCommissioning(el)?.category;
  return category ? COMMISSIONING_FORMATS[category] : undefined;
}
