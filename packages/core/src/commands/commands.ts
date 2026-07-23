import type { Command } from './Command';
import type { ElementId, ElementJson, ConnectionJson, SldDocumentJson } from '../types';
import type { MovePlan } from '../Grid';
import { SldDocument } from '../SldDocument';
import { SldElement } from '../elements/Element';
import { BusBar } from '../elements/BusBar';
import { Position } from '../elements/Position';
import { Connection } from '../elements/Connection';
import { elementFromJson } from '../elements/factory';
import { planPositionWiring, planPositionExternal } from '../wiring';
import { newId } from '../ids';

/** Add a single element (position, connection, …). */
export class AddElementCommand implements Command {
  readonly label: string;

  constructor(private element: SldElement) {
    this.label = `Add ${element.kind}`;
  }

  do(doc: SldDocument): void {
    doc.addElement(this.element);
  }

  undo(doc: SldDocument): void {
    doc.removeElement(this.element.id);
  }
}

/**
 * Delete a set of elements. Captures the full removal cascade (connections
 * of removed positions/bars) on every `do` so undo restores everything —
 * including when the selection contained both an element and one of its
 * own connections.
 */
export class DeleteElementsCommand implements Command {
  readonly label = 'Delete elements';
  private removed: ElementJson[] = [];

  constructor(private ids: ElementId[]) {}

  do(doc: SldDocument): void {
    this.removed = [];
    for (const id of this.ids) {
      for (const el of doc.removeElement(id)) this.removed.push(el.toJSON());
    }
  }

  undo(doc: SldDocument): void {
    // Restore in original order: non-connections first is guaranteed by
    // removeElement's return order (element, then its connections).
    for (const json of this.removed) doc.addElement(elementFromJson(json));
  }
}

/**
 * Add a position and auto-wire it into its column: it connects to the nearest
 * element above and below (bar or neighbouring bay position), and any direct
 * link it splits is removed. For an "external" position type (`line`,
 * `transformer`, `renewable`) it also creates the external asset arrow, so a
 * whole bay + its outgoing line appear (and undo) as one command. The wiring
 * plan + generated connection ids are computed once on the first `do` and
 * reused on redo, so undo/redo is stable. See planPositionWiring for the
 * model rules.
 */
export class AddPositionCommand implements Command {
  readonly label = 'Add position';
  private created: Connection[] | null = null;
  private toRemove: ElementId[] = [];
  private removed: ConnectionJson[] = [];

  constructor(private position: Position) {}

  do(doc: SldDocument): void {
    if (this.created === null) {
      // Plan before inserting — planPositionWiring reads the position's
      // row/col and scans the (not-yet-including-it) document for neighbours.
      const plan = planPositionWiring(doc, this.position);
      this.toRemove = plan.disconnect;
      this.created = plan.connect.map((c) => new Connection(newId(), '', c.from, c.to));
      // External-typed positions also spawn their outgoing asset arrow.
      const ext = planPositionExternal(doc, this.position);
      if (ext) this.created.push(new Connection(newId(), '', ext.from, ext.to));
    }
    doc.addElement(this.position);
    this.removed = [];
    for (const id of this.toRemove) {
      const el = doc.getElement(id);
      if (el instanceof Connection) {
        this.removed.push(el.toJSON());
        doc.removeElement(id);
      }
    }
    for (const conn of this.created) doc.addElement(conn);
  }

  undo(doc: SldDocument): void {
    if (this.created) for (const conn of this.created) doc.removeElement(conn.id);
    for (const json of this.removed) doc.addElement(elementFromJson(json));
    doc.removeElement(this.position.id);
  }
}

/** Apply a Grid.planMove result — the whole displacement chain, atomically. */
export class MoveElementCommand implements Command {
  readonly label = 'Move element';

  constructor(private plan: MovePlan) {}

  do(doc: SldDocument): void {
    for (const m of this.plan.moves) doc.moveElement(m.id, m.to);
  }

  undo(doc: SldDocument): void {
    for (let i = this.plan.moves.length - 1; i >= 0; i--) {
      const m = this.plan.moves[i];
      doc.moveElement(m.id, m.from);
    }
  }
}

/** Arbitrary element edit, captured as before/after JSON snapshots. */
export class UpdateElementCommand implements Command {
  readonly label = 'Edit element';

  constructor(
    private before: ElementJson,
    private after: ElementJson
  ) {}

  do(doc: SldDocument): void {
    doc.replaceElement(this.after);
  }

  undo(doc: SldDocument): void {
    doc.replaceElement(this.before);
  }
}

/**
 * Rename an element's id, repointing every connection endpoint that referenced
 * the old id (see `SldDocument.renameElement`). Used to give the same physical
 * asset one shared id across documents so the composite editor auto-links them.
 *
 * The rename is its own inverse, so undo simply renames back — no snapshot
 * capture. Callers should ensure `to` is non-empty and free (e.g. via
 * `doc.getElement(to)`); on a conflict `do` no-ops harmlessly.
 */
export class RenameElementCommand implements Command {
  readonly label = 'Rename element';

  constructor(
    private from: ElementId,
    private to: ElementId
  ) {}

  do(doc: SldDocument): void {
    doc.renameElement(this.from, this.to);
  }

  undo(doc: SldDocument): void {
    doc.renameElement(this.to, this.from);
  }
}

/**
 * Insert a bus bar. Bars always live in their own row, so this composite
 * inserts a new row at `at` and places the bar there.
 */
export class AddBusBarCommand implements Command {
  readonly label = 'Add bus bar';

  constructor(
    private busbar: BusBar,
    private at: number
  ) {
    busbar.row = at;
  }

  do(doc: SldDocument): void {
    doc.insertRow(this.at);
    doc.addElement(this.busbar);
  }

  undo(doc: SldDocument): void {
    doc.removeElement(this.busbar.id);
    doc.removeRow(this.at);
  }
}

export type LaneKind = 'row' | 'col';

/** Append an empty row/column at the end of the grid. */
export class AddLaneCommand implements Command {
  readonly label: string;
  private at = -1;

  constructor(private kind: LaneKind) {
    this.label = kind === 'row' ? 'Add row' : 'Add column';
  }

  do(doc: SldDocument): void {
    this.at = this.kind === 'row' ? doc.grid.rows : doc.grid.cols;
    if (this.kind === 'row') doc.insertRow(this.at);
    else doc.insertCol(this.at);
  }

  undo(doc: SldDocument): void {
    if (this.kind === 'row') doc.removeRow(this.at);
    else doc.removeCol(this.at);
  }
}

/** Remove an empty row/column. Caller ensures Grid.isRowEmpty/isColEmpty. */
export class RemoveLaneCommand implements Command {
  readonly label: string;

  constructor(
    private kind: LaneKind,
    private at: number
  ) {
    this.label = kind === 'row' ? 'Remove row' : 'Remove column';
  }

  do(doc: SldDocument): void {
    if (this.kind === 'row') doc.removeRow(this.at);
    else doc.removeCol(this.at);
  }

  undo(doc: SldDocument): void {
    if (this.kind === 'row') doc.insertRow(this.at);
    else doc.insertCol(this.at);
  }
}

/**
 * Full-document snapshot swap. Used for compound structural operations
 * (bulk re-scaffold, JSON import) where per-operation undo
 * bookkeeping would be fragile.
 */
export class SnapshotCommand implements Command {
  constructor(
    readonly label: string,
    private before: SldDocumentJson,
    private after: SldDocumentJson
  ) {}

  do(doc: SldDocument): void {
    doc.replaceContents(this.after);
  }

  undo(doc: SldDocument): void {
    doc.replaceContents(this.before);
  }
}
