import type { ElementJson } from '../types';
import { SldElement } from './Element';
import { BusBar } from './BusBar';
import { Position } from './Position';
import { Connection } from './Connection';

/** Reconstruct a concrete element from its persisted JSON shape. */
export function elementFromJson(json: ElementJson): SldElement {
  switch (json.kind) {
    case 'busbar':
      return BusBar.fromJSON(json);
    case 'position':
      return Position.fromJSON(json);
    case 'connection':
      return Connection.fromJSON(json);
  }
}
