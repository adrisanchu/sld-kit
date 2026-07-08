import type { ElementId, Endpoint, ExternalAssetKind, ExternalDirection, PositionType } from './types';
import { SldDocument } from './SldDocument';
import { Grid } from './Grid';
import { Position } from './elements/Position';
import { nextExternalLabel } from './naming';

/**
 * A wiring plan for a position: the connections to create so it joins its
 * column's series bay, plus any existing connection the position now splits.
 */
export interface WiringPlan {
  /** New connections (position ↔ neighbour), as endpoint pairs. */
  connect: Array<{ from: Endpoint; to: Endpoint }>;
  /** Existing connection ids made redundant by the insertion (to remove). */
  disconnect: ElementId[];
}

/**
 * Nearest element above (`dir = -1`) or below (`dir = +1`) a cell in the same
 * column: the first bus bar row or occupied position slot encountered while
 * scanning outward. Empty slots are skipped. Returns its element id, or null.
 */
function findNeighbour(doc: SldDocument, grid: Grid, row: number, col: number, dir: -1 | 1): ElementId | null {
  const rows = doc.grid.rows;
  const barRows = grid.busBarRows();
  for (let r = row + dir; r >= 0 && r < rows; r += dir) {
    if (barRows.has(r)) {
      return doc.busBars().find((b) => b.row === r)?.id ?? null;
    }
    const occupant = grid.occupant({ row: r, col });
    if (occupant) return occupant;
  }
  return null;
}

/**
 * Compute the connections needed to slot `position` into its column, using
 * only the existing classes: it connects to the nearest element above and
 * below in its column (a bus bar or the neighbouring bay position). If those
 * two neighbours were directly connected — i.e. the position is being dropped
 * into an empty gap between them — that now-redundant link is scheduled for
 * removal so the series chain stays clean (bar → … → bar).
 *
 * `position` need not be in the document yet; only its row/col are read, and
 * the document is scanned for its neighbours. This lets a command compute the
 * plan before inserting the element.
 */
export function planPositionWiring(doc: SldDocument, position: Position): WiringPlan {
  const plan: WiringPlan = { connect: [], disconnect: [] };
  const grid = new Grid(doc);

  const above = findNeighbour(doc, grid, position.row, position.col, -1);
  const below = findNeighbour(doc, grid, position.row, position.col, 1);

  const self: Endpoint = { kind: 'element', id: position.id };
  if (above) plan.connect.push({ from: self, to: { kind: 'element', id: above } });
  if (below) plan.connect.push({ from: self, to: { kind: 'element', id: below } });

  if (above && below) {
    for (const conn of doc.connections()) {
      const ids = conn.elementIds();
      if (ids.length === 2 && ids.includes(above) && ids.includes(below)) {
        plan.disconnect.push(conn.id);
      }
    }
  }

  return plan;
}

/** Position types that carry an external asset arrow, mapped 1:1 to its kind. */
const EXTERNAL_POSITION_TYPES: readonly PositionType[] = ['line', 'transformer', 'renewable'];

/**
 * Default direction for an external arrow leaving `position`: toward the
 * nearest bar (crossing it on the way out), matching the layout heuristic in
 * `LayoutEngine.externalDirection`. Kept core-side so the add-position command
 * can bake the direction without touching the layout engine.
 */
function externalDirectionFor(doc: SldDocument, position: Position): ExternalDirection {
  const barRows = [...new Grid(doc).busBarRows()].sort((a, b) => a - b);
  const rows = doc.grid.rows;
  if (barRows.length === 0) return position.row < rows / 2 ? 'up' : 'down';
  const top = barRows[0];
  const bottom = barRows[barRows.length - 1];
  if (position.row <= top) return 'up';
  if (position.row >= bottom) return 'down';
  return position.row - top <= bottom - position.row ? 'up' : 'down';
}

/**
 * The external connection an "external" position type (`line`, `transformer`,
 * `renewable`) auto-creates on insertion — an arrow toward the nearest bar,
 * auto-named. `tap` and `side` are left undefined (derived by the layout).
 * Returns null for `central`/`reserve`, which carry no external.
 */
export function planPositionExternal(doc: SldDocument, position: Position): { from: Endpoint; to: Endpoint } | null {
  if (!EXTERNAL_POSITION_TYPES.includes(position.type)) return null;
  const asset = position.type as ExternalAssetKind; // 1:1 for line/transformer/renewable
  return {
    from: { kind: 'element', id: position.id },
    to: {
      kind: 'external',
      asset,
      label: nextExternalLabel(doc, asset),
      direction: externalDirectionFor(doc, position)
    }
  };
}
