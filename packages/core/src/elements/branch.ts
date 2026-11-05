import type { ExternalBranch } from '../types';
import type { SldDocument } from '../SldDocument';
import { Connection } from './Connection';

/**
 * A connection's three-winding branch (its third winding's end), if it has
 * one. Only a `transformer3w` external carries a branch.
 */
export function externalBranch(conn: Connection): ExternalBranch | undefined {
  const ext = conn.to.kind === 'external' ? conn.to : conn.from.kind === 'external' ? conn.from : null;
  return ext?.branch;
}

/**
 * The connection owning an **external id**: a feeder's own connection id, or
 * the id of a three-winding branch. Both kinds of id name an external end that
 * a composite can snap to, anchor a line on, or auto-link across children.
 */
export function connectionForExternalId(doc: SldDocument, id: string): Connection | undefined {
  const el = doc.getElement(id);
  if (el instanceof Connection) return el;
  return doc.connections().find((c) => externalBranch(c)?.id === id);
}
