import { SldElement, cloneData } from './Element';
import { newId } from '../ids';
import type { ElementId, PositionJson, PositionType, SubElementJson } from '../types';

/** Options for {@link Position.of} — the readable, id-optional way to author a position. */
export interface PositionOptions {
  type: PositionType;
  row: number;
  col: number;
  /** Human label; defaults to `''` (higher-level helpers auto-name). */
  label?: string;
  colSpan?: number;
  subElements?: SubElementJson[];
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
    data?: unknown
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
      opts.data
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
      cloneData(json.data)
    );
  }
}
