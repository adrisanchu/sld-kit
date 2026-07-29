import type { ElementId, Endpoint, ExternalAssetKind, ExternalDirection } from '../types';

/**
 * Typed constructors for the two `Endpoint` shapes, so authoring a `Connection`
 * reads cleanly instead of hand-building a discriminated union on each side:
 *
 * ```ts
 * new Connection(newId(), '', element('pos-1'), external({ asset: 'line', label: 'FEEDER A', direction: 'up' }));
 * ```
 *
 * Both omit optional fields when unset, matching the JSON the serializer
 * roundtrips (an absent `tap`/`side`/`direction` is derived by the layout).
 */

/** An endpoint that references an in-diagram element (bus bar or position). */
export function element(id: ElementId, tap?: 'above' | 'below'): Endpoint {
  return tap ? { kind: 'element', id, tap } : { kind: 'element', id };
}

/**
 * An endpoint that leaves the diagram toward an external asset (a feeder line,
 * a transformer's other side, …). `direction` and `side` are optional — the
 * layout derives them from the position's row and column when omitted.
 */
export function external(opts: {
  asset: ExternalAssetKind;
  label: string;
  direction?: ExternalDirection;
  side?: 'left' | 'right';
}): Endpoint {
  return {
    kind: 'external',
    asset: opts.asset,
    label: opts.label,
    ...(opts.direction !== undefined ? { direction: opts.direction } : {}),
    ...(opts.side !== undefined ? { side: opts.side } : {})
  };
}
