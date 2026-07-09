/**
 * Shared types for the SLD (single-line diagram) core.
 *
 * The core is framework-agnostic: no UI-framework or bundler-specific imports.
 * Everything here doubles as the persisted JSON schema (see
 * `serialization/Serializer.ts`), so changes to these shapes are schema
 * changes and must go through a version bump + migration.
 */

export type ElementId = string;

/** A slot in the diagram matrix. Row 0 is the topmost row. */
export interface Cell {
  row: number;
  col: number;
}

/**
 * The five position types shipped as defaults. They seed IDE autocompletion
 * and the default theme / naming-prefix maps, but `PositionType` is open (see
 * below): consumers may use any string to model domain-specific bay types.
 */
export const DEFAULT_POSITION_TYPES = ['line', 'transformer', 'central', 'renewable', 'reserve'] as const;

/**
 * Functional type of a position (posición) — drives its export color and
 * auto-naming prefix. Open string: the five `DEFAULT_POSITION_TYPES` are
 * suggested in autocompletion, but any non-empty string is accepted. Unknown
 * types render with the theme's fallback palette and auto-name from the type
 * string itself. The `(string & {})` intersection keeps the literal
 * suggestions while widening the type to every string.
 */
export type PositionType = (typeof DEFAULT_POSITION_TYPES)[number] | (string & {});

/** Kind of asset an external connection arrow points to. */
export type ExternalAssetKind = 'line' | 'transformer' | 'renewable' | 'storage' | 'demand';

/** Which direction an external arrow leaves the diagram. */
export type ExternalDirection = 'up' | 'down' | 'left' | 'right';

/**
 * One end of a Connection.
 *
 * External assets (a transmission line leaving the diagram, the low-voltage
 * side of a transformer, …) are endpoints rather than standalone elements:
 * they occupy no slot and always hang off exactly one position's stem.
 * `direction` is optional — when omitted the layout derives it from the
 * position's row relative to the bus bars.
 *
 * `tap` (element endpoints) and `side` (external endpoints) are the v2
 * additions for virtual-node routing (see
 * `docs/requirements/sld-virtual-nodes.md`):
 *  - `tap` marks which row gap of the position the external arrow attaches
 *    to — the virtual junction node, between two positions, instead of the
 *    box edge. Only meaningful when the element is a `Position` and the
 *    connection's other endpoint is `external`; ignored on internal
 *    connections. When absent the layout derives it (opposite the arrow's
 *    direction, i.e. toward mid-bay).
 *  - `side` picks which side of the column the external's vertical lane runs
 *    on. Default `'right'`. Ignored (and greyed in the dialog) when `direction`
 *    is `'left'` or `'right'` — the direction itself says where the line goes.
 */
export type Endpoint =
  | { kind: 'element'; id: ElementId; tap?: 'above' | 'below' }
  | {
      kind: 'external';
      asset: ExternalAssetKind;
      label: string;
      direction?: ExternalDirection;
      side?: 'left' | 'right';
    };

export type ElementKind = 'busbar' | 'position' | 'connection';

/**
 * Future sub-element of a position (breaker, disconnector, CT…).
 * Persisted from v1 so adding those later is not a schema change.
 * `symbol` is a SymbolRegistry key; `slot` says where on the position's
 * stem the symbol renders.
 */
export interface SubElementJson {
  id: ElementId;
  symbol: string;
  slot: 'stem-top' | 'stem-bottom';
  props?: Record<string, unknown>;
}

// ── Persisted element shapes ─────────────────────────────────────────────────

/**
 * Opaque, JSON-serializable metadata a consumer may attach to any element or
 * to the document. The library carries it byte-for-byte through every
 * serialization roundtrip but NEVER reads it — it does not affect layout,
 * wiring, naming or export. Typed at the JSON boundary via the `TData`
 * parameter; `unknown` inside the core (see `getElementData` to narrow it).
 * Must be structured-cloneable (no functions, no `Date` — use ISO strings).
 */

export interface BusBarJson<TData = unknown> {
  id: ElementId;
  kind: 'busbar';
  label: string;
  /** The bus bar occupies this entire row (all columns). */
  row: number;
  /** Opaque consumer metadata, roundtripped untouched. */
  data?: TData;
}

export interface PositionJson<TData = unknown> {
  id: ElementId;
  kind: 'position';
  label: string;
  type: PositionType;
  row: number;
  col: number;
  colSpan: number;
  subElements: SubElementJson[];
  /** Opaque consumer metadata, roundtripped untouched. */
  data?: TData;
}

export interface ConnectionJson<TData = unknown> {
  id: ElementId;
  kind: 'connection';
  label: string;
  from: Endpoint;
  to: Endpoint;
  /** Opaque consumer metadata, roundtripped untouched. */
  data?: TData;
}

export type ElementJson<TData = unknown> = BusBarJson<TData> | PositionJson<TData> | ConnectionJson<TData>;

// ── Document ─────────────────────────────────────────────────────────────────

export interface DocumentMeta {
  id: string;
  name: string;
  /** Substation this voltage level belongs to (e.g. a substation name). */
  substation?: string;
  /** Voltage level, in kV (e.g. 400). */
  voltageKv?: number;
  createdAt: string;
  updatedAt: string;
  /** Opaque document-level metadata, roundtripped untouched. */
  data?: unknown;
}

export interface GridDims {
  rows: number;
  cols: number;
}

export interface SldDocumentJson<TData = unknown> {
  version: number;
  meta: DocumentMeta;
  grid: GridDims;
  elements: ElementJson<TData>[];
}

/** Change notifications emitted by SldDocument mutations. */
export type DocumentChange =
  { type: 'elements'; ids: ElementId[] } | { type: 'grid' } | { type: 'meta' } | { type: 'replace' };
