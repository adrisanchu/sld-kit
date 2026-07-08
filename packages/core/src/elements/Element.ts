import type { ElementId, ElementJson, ElementKind } from '../types';

/**
 * Base class for every diagram element. Elements reference each other only
 * by id (see Connection endpoints) and never store pixel geometry — the
 * LayoutEngine derives all coordinates from matrix placement.
 *
 * `data` is an opaque, consumer-owned metadata channel: the library carries
 * it through serialization but never reads it (see the `data` docs and
 * `getElementData`). It is `unknown` inside the core; narrow it at the
 * consumer boundary.
 */
export abstract class SldElement {
  abstract readonly kind: ElementKind;

  constructor(
    public readonly id: ElementId,
    public label: string,
    public data?: unknown
  ) {}

  /** Serialize to the persisted JSON shape. Must return a fresh object. */
  abstract toJSON(): ElementJson;
}

/** Deep-copy an opaque `data` value for a fresh JSON snapshot, or omit it. */
export function cloneData(data: unknown): unknown {
  return data === undefined ? undefined : structuredClone(data);
}
