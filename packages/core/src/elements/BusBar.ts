import { SldElement, cloneData } from './Element';
import { newId } from '../ids';
import type { BusBarJson, ElementId } from '../types';

/** Options for {@link BusBar.of} — the readable, id-optional way to author a bus bar. */
export interface BusBarOptions {
  row: number;
  /** Human label; defaults to `''`. */
  label?: string;
  data?: unknown;
  /** Explicit id; defaults to a fresh `newId()`. */
  id?: ElementId;
}

/**
 * A bus bar (e.g. "BB1"/"BB2"): a thick horizontal line spanning the
 * full diagram width. It occupies its entire row — no positions can share
 * a bus bar row.
 */
export class BusBar extends SldElement {
  readonly kind = 'busbar' as const;

  constructor(
    id: ElementId,
    label: string,
    public row: number,
    data?: unknown
  ) {
    super(id, label, data);
  }

  /**
   * Options-object factory — sugar over the positional constructor that mints
   * an id for you (`id` defaults to `newId()`, `label` to `''`).
   */
  static of(opts: BusBarOptions): BusBar {
    return new BusBar(opts.id ?? newId(), opts.label ?? '', opts.row, opts.data);
  }

  toJSON(): BusBarJson {
    const json: BusBarJson = { id: this.id, kind: 'busbar', label: this.label, row: this.row };
    if (this.data !== undefined) json.data = cloneData(this.data);
    return json;
  }

  static fromJSON(json: BusBarJson): BusBar {
    return new BusBar(json.id, json.label, json.row, cloneData(json.data));
  }
}
