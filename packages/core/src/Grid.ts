import type { Cell, ElementId } from './types';
import { SldDocument } from './SldDocument';
import { Position } from './elements/Position';

/**
 * A move to apply as one atomic (and atomically undoable) operation.
 * When moving into an occupied slot the plan contains the whole
 * displacement chain, mover last.
 */
export interface MovePlan {
  moves: Array<{ id: ElementId; from: Cell; to: Cell }>;
}

/**
 * Occupancy index + reflow planner over a document's matrix.
 *
 * Derived on demand from the document (element counts are tiny, so O(n)
 * scans are fine — no cache invalidation to get wrong).
 */
export class Grid {
  constructor(private doc: SldDocument) {}

  /** Rows occupied by a bus bar. Bar rows are blocked for positions. */
  busBarRows(): Set<number> {
    return new Set(this.doc.busBars().map((b) => b.row));
  }

  rowKind(row: number): 'busbar' | 'slots' {
    return this.busBarRows().has(row) ? 'busbar' : 'slots';
  }

  inBounds(cell: Cell): boolean {
    const { rows, cols } = this.doc.grid;
    return cell.row >= 0 && cell.row < rows && cell.col >= 0 && cell.col < cols;
  }

  /** col → position id occupancy for one row, accounting for colSpan. */
  private occupancyRow(row: number, excludeId?: ElementId): Map<number, ElementId> {
    const map = new Map<number, ElementId>();
    for (const pos of this.doc.positions()) {
      if (pos.row !== row || pos.id === excludeId) continue;
      for (let c = pos.col; c < pos.col + pos.colSpan; c++) map.set(c, pos.id);
    }
    return map;
  }

  occupant(cell: Cell): ElementId | null {
    return this.occupancyRow(cell.row).get(cell.col) ?? null;
  }

  isFree(cell: Cell): boolean {
    return this.inBounds(cell) && this.rowKind(cell.row) === 'slots' && this.occupant(cell) === null;
  }

  /** No position overlaps this column (colSpan-aware). Bus bars are ignored. */
  isColEmpty(col: number): boolean {
    return !this.doc.positions().some((pos) => pos.col <= col && col < pos.col + pos.colSpan);
  }

  /** No position sits in this row AND no bus bar occupies it. */
  isRowEmpty(row: number): boolean {
    if (this.busBarRows().has(row)) return false;
    return !this.doc.positions().some((pos) => pos.row === row);
  }

  /** Ids of positions overlapping a column. */
  colOccupants(col: number): ElementId[] {
    return this.doc
      .positions()
      .filter((pos) => pos.col <= col && col < pos.col + pos.colSpan)
      .map((pos) => pos.id);
  }

  /** Ids of elements (positions + bars) in a row. */
  rowOccupants(row: number): ElementId[] {
    const ids: ElementId[] = [];
    for (const bar of this.doc.busBars()) {
      if (bar.row === row) ids.push(bar.id);
    }
    for (const pos of this.doc.positions()) {
      if (pos.row === row) ids.push(pos.id);
    }
    return ids;
  }

  freeCellsInRow(row: number): number[] {
    if (this.rowKind(row) !== 'slots') return [];
    const occ = this.occupancyRow(row);
    const free: number[] = [];
    for (let c = 0; c < this.doc.grid.cols; c++) if (!occ.has(c)) free.push(c);
    return free;
  }

  /** First free slot row scanning top-to-bottom, left-to-right; null if full. */
  firstFreeCell(): Cell | null {
    for (let r = 0; r < this.doc.grid.rows; r++) {
      const cols = this.freeCellsInRow(r);
      if (cols.length > 0) return { row: r, col: cols[0] };
    }
    return null;
  }

  /**
   * Plan moving position `id` to `target` with list-reorder semantics:
   *
   *  - target free → single move.
   *  - target occupied, same row → the occupants between origin and target
   *    shift one slot toward the origin (classic list reordering; always
   *    fits because the mover vacates a slot in this row).
   *  - target occupied, different row → the occupant chain starting at the
   *    target shifts one slot away (rightward first, then leftward) until
   *    a free slot absorbs it.
   *  - target out of bounds, on a bus bar row, or the row cannot absorb
   *    the displacement → null (the UI shows the move as invalid).
   *
   * v0 plans single-slot movers only (colSpan > 1 positions are laid out
   * but not draggable through this planner).
   */
  planMove(id: ElementId, target: Cell): MovePlan | null {
    const mover = this.doc.getElement(id);
    if (!(mover instanceof Position) || mover.colSpan !== 1) return null;
    if (!this.inBounds(target) || this.rowKind(target.row) !== 'slots') return null;

    const from: Cell = { row: mover.row, col: mover.col };
    if (from.row === target.row && from.col === target.col) return { moves: [] };

    const occ = this.occupancyRow(target.row, id);
    const moves: MovePlan['moves'] = [];

    if (!occ.has(target.col)) {
      moves.push({ id, from, to: target });
      return { moves };
    }

    if (from.row === target.row) {
      // Shift everything strictly between target and origin toward the origin.
      const dir = from.col > target.col ? 1 : -1;
      for (let c = target.col; c !== from.col; c += dir) {
        const occupantId = occ.get(c);
        if (occupantId) {
          moves.push({ id: occupantId, from: { row: target.row, col: c }, to: { row: target.row, col: c + dir } });
        }
      }
      moves.push({ id, from, to: target });
      return { moves };
    }

    // Cross-row move: push the occupant chain away until a free slot absorbs it.
    for (const dir of [1, -1] as const) {
      let free = -1;
      for (let c = target.col + dir; c >= 0 && c < this.doc.grid.cols; c += dir) {
        if (!occ.has(c)) {
          free = c;
          break;
        }
      }
      if (free === -1) continue;
      for (let c = free - dir; (dir === 1 && c >= target.col) || (dir === -1 && c <= target.col); c -= dir) {
        const occupantId = occ.get(c);
        if (occupantId) {
          moves.push({ id: occupantId, from: { row: target.row, col: c }, to: { row: target.row, col: c + dir } });
        }
      }
      moves.push({ id, from, to: target });
      return { moves };
    }

    return null;
  }
}
