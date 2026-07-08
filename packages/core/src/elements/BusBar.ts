import { SldElement, cloneData } from './Element';
import type { BusBarJson, ElementId } from '../types';

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

  toJSON(): BusBarJson {
    const json: BusBarJson = { id: this.id, kind: 'busbar', label: this.label, row: this.row };
    if (this.data !== undefined) json.data = cloneData(this.data);
    return json;
  }

  static fromJSON(json: BusBarJson): BusBar {
    return new BusBar(json.id, json.label, json.row, cloneData(json.data));
  }
}
