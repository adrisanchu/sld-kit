import { SldElement, cloneData } from './Element';
import { newId } from '../ids';
import type { ElementId, PositionJson, PositionType, SubElementJson, SwitchState } from '../types';

/** Options for {@link Position.of} — the readable, id-optional way to author a position. */
export interface PositionOptions {
  type: PositionType;
  row: number;
  col: number;
  /** Human label; defaults to `''` (higher-level helpers auto-name). */
  label?: string;
  colSpan?: number;
  subElements?: SubElementJson[];
  /** Switching state; omit for `closed`. */
  state?: SwitchState;
  data?: unknown;
  /** Explicit id; defaults to a fresh `newId()`. */
  id?: ElementId;
}

/**
 * A position (posición): a typed, colored box occupying one slot of the
 * matrix. Its type describes its function (line bay, transformer bay,
 * central, renewables, reserve) and drives its color.
 *
 * `subElements` is the future home of breakers/disconnectors/CTs rendered
 * on the position's stems — persisted since schema v1, empty in v0.
 */
export class Position extends SldElement {
  readonly kind = 'position' as const;

  constructor(
    id: ElementId,
    label: string,
    public type: PositionType,
    public row: number,
    public col: number,
    public colSpan: number = 1,
    public subElements: SubElementJson[] = [],
    data?: unknown,
    /** Switching state; `undefined` = closed. Read it through {@link effectiveState}. */
    public state?: SwitchState
  ) {
    super(id, label, data);
  }

  /**
   * Options-object factory — sugar over the positional constructor that reads
   * clearly and mints an id for you (`id` defaults to `newId()`, `label` to
   * `''`). Prefer this for authoring; the positional constructor stays for
   * back-compat and hot paths.
   */
  static of(opts: PositionOptions): Position {
    return new Position(
      opts.id ?? newId(),
      opts.label ?? '',
      opts.type,
      opts.row,
      opts.col,
      opts.colSpan ?? 1,
      opts.subElements ?? [],
      opts.data,
      opts.state
    );
  }

  toJSON(): PositionJson {
    const json: PositionJson = {
      id: this.id,
      kind: 'position',
      label: this.label,
      type: this.type,
      row: this.row,
      col: this.col,
      colSpan: this.colSpan,
      subElements: this.subElements.map((s) => ({ ...s, props: s.props ? { ...s.props } : undefined }))
    };
    if (this.state !== undefined) json.state = this.state;
    if (this.data !== undefined) json.data = cloneData(this.data);
    return json;
  }

  static fromJSON(json: PositionJson): Position {
    return new Position(
      json.id,
      json.label,
      json.type,
      json.row,
      json.col,
      json.colSpan ?? 1,
      (json.subElements ?? []).map((s) => ({ ...s })),
      cloneData(json.data),
      json.state
    );
  }
}

/**
 * The switching state a position effectively has: its own `state`, defaulting
 * to `closed`. Single source of truth per bay — today the bay's own field;
 * once `subElements` carry breaker/disconnector state, this will derive the
 * bay's state from them (it conducts only if every series device is closed),
 * and `Position.state` is then not authored for that bay. Read state through
 * this, never `pos.state` directly, so that change stays invisible to callers.
 */
export function effectiveState(pos: Position): SwitchState {
  return pos.state ?? 'closed';
}
