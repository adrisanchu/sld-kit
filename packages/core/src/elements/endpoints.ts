import type {
  ElementId,
  Endpoint,
  ExternalAssetKind,
  ExternalBranch,
  ExternalDirection,
  ExternalEndpoint
} from '../types';
import { newId } from '../ids';

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
  /** The third winding's end — only on a `transformer3w`. */
  branch?: ExternalBranch;
}): Endpoint {
  return {
    kind: 'external',
    asset: opts.asset,
    label: opts.label,
    ...(opts.direction !== undefined ? { direction: opts.direction } : {}),
    ...(opts.side !== undefined ? { side: opts.side } : {}),
    ...(opts.branch !== undefined ? { branch: { ...opts.branch } } : {})
  };
}

/**
 * Rewrite an existing external endpoint from edited fields — what a properties
 * dialog does on save — keeping the document valid across asset changes:
 *
 *  - staying a `transformer3w` keeps the third winding's `branch.id` (other
 *    diagrams may link to it) and its label unless `branchLabel` is given;
 *  - switching *to* `transformer3w` mints a branch (fresh id; label from
 *    `branchLabel`, else `${label}-3`);
 *  - switching *away* drops the branch, which any other asset rejects.
 *
 * Pass `prev = undefined` to create one from scratch. `direction` / `side` are
 * taken as given (omit them to let the layout derive them), like `external()`.
 */
export function updateExternal(
  prev: ExternalEndpoint | undefined,
  next: {
    asset: ExternalAssetKind;
    label: string;
    direction?: ExternalDirection;
    side?: 'left' | 'right';
    /** The third winding's label (`transformer3w` only); blank keeps the previous one. */
    branchLabel?: string;
  }
): Endpoint {
  const branch: ExternalBranch | undefined =
    next.asset === 'transformer3w'
      ? {
          id: prev?.branch?.id ?? newId(),
          label: next.branchLabel?.trim() || prev?.branch?.label || `${next.label}-3`
        }
      : undefined;
  return external({ asset: next.asset, label: next.label, direction: next.direction, side: next.side, branch });
}
