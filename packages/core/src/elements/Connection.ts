import { SldElement, cloneData } from './Element';
import type { ConnectionJson, ElementId, Endpoint } from '../types';

function cloneEndpoint(e: Endpoint): Endpoint {
  return { ...e };
}

/**
 * A connection between two endpoints:
 *  - position ↔ bus bar (vertical stem)
 *  - position ↔ position (vertical stems + orthogonal jog if columns differ)
 *  - position ↔ external asset (stem leaving the diagram with an arrowhead,
 *    a label, and an asset glyph for non-line assets)
 */
export class Connection extends SldElement {
  readonly kind = 'connection' as const;

  constructor(
    id: ElementId,
    label: string,
    public from: Endpoint,
    public to: Endpoint,
    data?: unknown
  ) {
    super(id, label, data);
  }

  /** Ids of the elements this connection references (0–2 entries). */
  elementIds(): ElementId[] {
    const ids: ElementId[] = [];
    if (this.from.kind === 'element') ids.push(this.from.id);
    if (this.to.kind === 'element') ids.push(this.to.id);
    return ids;
  }

  toJSON(): ConnectionJson {
    const json: ConnectionJson = {
      id: this.id,
      kind: 'connection',
      label: this.label,
      from: cloneEndpoint(this.from),
      to: cloneEndpoint(this.to)
    };
    if (this.data !== undefined) json.data = cloneData(this.data);
    return json;
  }

  static fromJSON(json: ConnectionJson): Connection {
    return new Connection(json.id, json.label, cloneEndpoint(json.from), cloneEndpoint(json.to), cloneData(json.data));
  }
}
