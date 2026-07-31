import type { ElementId, Endpoint, ExternalAssetKind, ExternalDirection, PositionType } from './types';
import { SldDocument } from './SldDocument';
import { Grid } from './Grid';
import { Position } from './elements/Position';
import { Connection } from './elements/Connection';
import { nextExternalLabel } from './naming';
import { newId } from './ids';

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
const EXTERNAL_POSITION_TYPES: readonly PositionType[] = ['line', 'transformer', 'renewable', 'storage', 'demand'];

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
 * `renewable`, `storage`, `demand`) auto-creates on insertion — an arrow toward
 * the nearest bar, auto-named. `tap` and `side` are left undefined (derived by
 * the layout). Returns null for `central`/`reserve`, which carry no external.
 */
export function planPositionExternal(doc: SldDocument, position: Position): { from: Endpoint; to: Endpoint } | null {
  if (!EXTERNAL_POSITION_TYPES.includes(position.type)) return null;
  const asset = position.type as ExternalAssetKind; // 1:1 (each is a valid ExternalAssetKind)
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

export interface AutoWireOptions {
  /**
   * Spawn the outgoing feeder arrow for each external-typed position
   * (`line`/`transformer`/`renewable`/`storage`/`demand`). Default `true`.
   */
  externals?: boolean;
}

/** Unordered key for an element↔element link, so the same pair isn't wired twice. */
function elementPairKey(a: ElementId, b: ElementId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Wire an already-placed document in one call: add every series connection
 * (bar↔bay, bay↔bay) each bay needs to join its column, plus (by default) the
 * outgoing feeder for every external-typed position. This is the batch form of
 * what a series of `AddPositionCommand`s does — the same planners
 * (`planPositionWiring` / `planPositionExternal`), just looped over
 * `doc.positions()` — so a place-first author (or an LLM) can drop bars and
 * bays and get a fully-wired diagram without hand-authoring connections or
 * threading each one through a command.
 *
 * Expects bars + positions already placed and **no connections yet**; it never
 * duplicates a link, so any element↔element connection already present is left
 * intact. Mutates `doc` directly (construction-time, not an undoable edit).
 * Calls `fitGrid()` first, because neighbour scanning is bounded by the grid —
 * an unsized (0×0) grid would otherwise wire nothing.
 */
export function autoWire(doc: SldDocument, opts: AutoWireOptions = {}): void {
  const externals = opts.externals ?? true;
  // Neighbour scanning (findNeighbour / externalDirectionFor) is bounded by
  // grid.rows, so the grid must contain every element before we wire.
  doc.fitGrid();

  // Seed the de-dupe set with element↔element links already present, so a
  // partially-wired document is topped up rather than double-wired.
  const seen = new Set<string>();
  for (const conn of doc.connections()) {
    const ids = conn.elementIds();
    if (ids.length === 2) seen.add(elementPairKey(ids[0], ids[1]));
  }

  // Process one position at a time, adding its connections to the document as
  // we go: later positions see earlier links (matching the incremental
  // AddPositionCommand flow), and each spawned feeder is auto-named against the
  // feeders already present so labels don't collide.
  for (const position of doc.positions()) {
    const plan = planPositionWiring(doc, position);
    for (const id of plan.disconnect) {
      const conn = doc.getElement(id);
      if (conn instanceof Connection) {
        const ids = conn.elementIds();
        if (ids.length === 2) seen.delete(elementPairKey(ids[0], ids[1]));
      }
      doc.removeElement(id);
    }
    for (const pair of plan.connect) {
      if (pair.from.kind === 'element' && pair.to.kind === 'element') {
        const key = elementPairKey(pair.from.id, pair.to.id);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      doc.addElement(new Connection(newId(), '', pair.from, pair.to));
    }
    if (externals) {
      const ext = planPositionExternal(doc, position);
      if (ext) doc.addElement(new Connection(newId(), '', ext.from, ext.to));
    }
  }
}
