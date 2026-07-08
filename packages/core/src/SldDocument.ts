import type { Cell, DocumentChange, DocumentMeta, ElementId, ElementJson, GridDims, SldDocumentJson } from './types';
import { newId } from './ids';
import { SldElement } from './elements/Element';
import { BusBar } from './elements/BusBar';
import { Position } from './elements/Position';
import { Connection } from './elements/Connection';
import { elementFromJson } from './elements/factory';

/**
 * Root aggregate of a diagram: meta + grid dimensions + element map.
 *
 * Mutations are low-level and are meant to be called ONLY by commands
 * (see commands/) so every change is undoable. Each mutation bumps
 * `meta.updatedAt` and notifies subscribers — a renderer bridges those
 * notifications into its own store.
 *
 * Element insertion order is preserved by the Map and defines a stable
 * z-order (the renderer additionally groups by kind).
 */
export class SldDocument {
  meta: DocumentMeta;
  grid: GridDims;
  private elements = new Map<ElementId, SldElement>();
  private listeners = new Set<(change: DocumentChange) => void>();

  constructor(meta: Partial<DocumentMeta> = {}, grid: GridDims = { rows: 0, cols: 0 }) {
    const now = new Date().toISOString();
    this.meta = {
      id: newId(),
      name: 'New diagram',
      createdAt: now,
      updatedAt: now,
      ...meta
    };
    this.grid = { ...grid };
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getElement(id: ElementId): SldElement | undefined {
    return this.elements.get(id);
  }

  all(): SldElement[] {
    return [...this.elements.values()];
  }

  busBars(): BusBar[] {
    return this.all().filter((e): e is BusBar => e.kind === 'busbar');
  }

  positions(): Position[] {
    return this.all().filter((e): e is Position => e.kind === 'position');
  }

  connections(): Connection[] {
    return this.all().filter((e): e is Connection => e.kind === 'connection');
  }

  /** Connections that reference `id` on either endpoint. */
  connectionsOf(id: ElementId): Connection[] {
    return this.connections().filter((c) => c.elementIds().includes(id));
  }

  isEmpty(): boolean {
    return this.elements.size === 0 && this.grid.rows === 0 && this.grid.cols === 0;
  }

  // ── Mutations (called by commands) ─────────────────────────────────────────

  addElement(el: SldElement): void {
    this.elements.set(el.id, el);
    this.emit({ type: 'elements', ids: [el.id] });
  }

  /**
   * Remove an element. Removing a bus bar or position cascades to every
   * connection referencing it. Returns everything removed (element first,
   * then its connections) so a delete command can restore the full set on
   * undo. Removing an unknown id returns [].
   */
  removeElement(id: ElementId): SldElement[] {
    const el = this.elements.get(id);
    if (!el) return [];
    const removed: SldElement[] = [el];
    this.elements.delete(id);
    if (el.kind !== 'connection') {
      for (const conn of this.connectionsOf(id)) {
        this.elements.delete(conn.id);
        removed.push(conn);
      }
    }
    this.emit({ type: 'elements', ids: removed.map((e) => e.id) });
    return removed;
  }

  /** Move a position to a new cell, or a bus bar to a new row. */
  moveElement(id: ElementId, cell: Cell): void {
    const el = this.elements.get(id);
    if (!el) return;
    if (el instanceof Position) {
      el.row = cell.row;
      el.col = cell.col;
    } else if (el instanceof BusBar) {
      el.row = cell.row;
    } else {
      return;
    }
    this.emit({ type: 'elements', ids: [id] });
  }

  /**
   * Replace an element in place from its JSON shape (same id, same z-order
   * — Map.set on an existing key preserves insertion order). Used by
   * UpdateElementCommand for undoable arbitrary edits.
   */
  replaceElement(json: ElementJson): void {
    if (!this.elements.has(json.id)) return;
    this.elements.set(json.id, elementFromJson(json));
    this.emit({ type: 'elements', ids: [json.id] });
  }

  setGrid(rows: number, cols: number): void {
    this.grid = { rows, cols };
    this.emit({ type: 'grid' });
  }

  /** Insert an empty row at `at`, shifting every element at row >= at down. */
  insertRow(at: number): void {
    for (const el of this.elements.values()) {
      if ((el instanceof Position || el instanceof BusBar) && el.row >= at) el.row += 1;
    }
    this.grid = { ...this.grid, rows: this.grid.rows + 1 };
    this.emit({ type: 'grid' });
  }

  /** Remove row `at` (caller ensures it is empty), shifting rows above it up. */
  removeRow(at: number): void {
    for (const el of this.elements.values()) {
      if ((el instanceof Position || el instanceof BusBar) && el.row > at) el.row -= 1;
    }
    this.grid = { ...this.grid, rows: Math.max(0, this.grid.rows - 1) };
    this.emit({ type: 'grid' });
  }

  /** Insert an empty column at `at`, shifting positions with col >= at right. */
  insertCol(at: number): void {
    for (const el of this.elements.values()) {
      if (el instanceof Position && el.col >= at) el.col += 1;
    }
    this.grid = { ...this.grid, cols: this.grid.cols + 1 };
    this.emit({ type: 'grid' });
  }

  /** Remove column `at` (caller ensures Grid.isColEmpty(at)), shifting columns above it left. */
  removeCol(at: number): void {
    for (const el of this.elements.values()) {
      if (el instanceof Position && el.col > at) el.col -= 1;
    }
    this.grid = { ...this.grid, cols: Math.max(0, this.grid.cols - 1) };
    this.emit({ type: 'grid' });
  }

  updateMeta(patch: Partial<Omit<DocumentMeta, 'id' | 'createdAt' | 'updatedAt'>>): void {
    this.meta = { ...this.meta, ...patch };
    this.emit({ type: 'meta' });
  }

  /**
   * Replace grid + elements + meta from a JSON document, keeping this
   * document's identity (meta.id, createdAt). Used by SnapshotCommand
   * (matrix re-scaffold, JSON import) so compound operations undo in one
   * step.
   */
  replaceContents(json: SldDocumentJson): void {
    this.meta = { ...json.meta, id: this.meta.id, createdAt: this.meta.createdAt };
    this.grid = { ...json.grid };
    this.elements = new Map(json.elements.map((e) => [e.id, elementFromJson(e)]));
    this.emit({ type: 'replace' });
  }

  // ── Change notification ────────────────────────────────────────────────────

  subscribe(fn: (change: DocumentChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(change: DocumentChange): void {
    this.meta.updatedAt = new Date().toISOString();
    for (const fn of this.listeners) fn(change);
  }
}
