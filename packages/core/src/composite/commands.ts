import type { Command } from '../commands/Command';
import type { SldDocument } from '../SldDocument';
import type { ExternalDirection } from '../types';
import { CompositeDocument } from './CompositeDocument';
import { CompositeLine, type CompositeLineJson, type CompositeLineKind, type LineVertexJson } from './CompositeLine';
import { DiagramInstance, type DiagramInstanceJson, type LabelPlacement } from './DiagramInstance';

export type { LabelPlacement };

/** Add a placed child to the composite. */
export class AddChildCommand implements Command<CompositeDocument> {
  readonly label = 'Add diagram';

  constructor(private instance: DiagramInstance) {}

  do(doc: CompositeDocument): void {
    doc.addChild(this.instance);
  }

  undo(doc: CompositeDocument): void {
    doc.removeChild(this.instance.id);
  }
}

/**
 * Remove a child. Captures its JSON and its already-resolved document on the
 * first `do`, so undo restores the exact instance without needing a resolver.
 */
export class RemoveChildCommand implements Command<CompositeDocument> {
  readonly label = 'Remove diagram';
  private snapshot: DiagramInstanceJson | null = null;
  private resolved: SldDocument | null = null;
  private resolveAttempted = false;

  constructor(private id: string) {}

  do(doc: CompositeDocument): void {
    const child = doc.getChild(this.id);
    if (!child) return;
    this.snapshot = child.toJSON();
    this.resolved = child.resolved;
    this.resolveAttempted = child.resolveAttempted;
    doc.removeChild(this.id);
  }

  undo(doc: CompositeDocument): void {
    if (!this.snapshot) return;
    const inst = DiagramInstance.fromJSON(this.snapshot);
    inst.resolved = this.resolved;
    inst.resolveAttempted = this.resolveAttempted;
    doc.addChild(inst);
  }
}

/**
 * Covers both move and rotate via before/after transform snapshots; the label
 * distinguishes the two ('Mover esquema' | 'Rotar esquema'). Committed once at
 * pointer-up after the gesture is applied transiently to the instance.
 */
export class TransformChildCommand implements Command<CompositeDocument> {
  constructor(
    readonly label: string,
    private id: string,
    private before: { x: number; y: number; angleDeg: number },
    private after: { x: number; y: number; angleDeg: number }
  ) {}

  do(doc: CompositeDocument): void {
    doc.setChildTransform(this.id, this.after.x, this.after.y, this.after.angleDeg);
  }

  undo(doc: CompositeDocument): void {
    doc.setChildTransform(this.id, this.before.x, this.before.y, this.before.angleDeg);
  }
}

/**
 * Reposition a child's name label (slot + quarter-turn direction) via
 * before/after snapshots — a discrete, single-step edit, undoable like a move.
 */
export class SetChildLabelCommand implements Command<CompositeDocument> {
  readonly label = 'Move diagram name';

  constructor(
    private id: string,
    private before: LabelPlacement,
    private after: LabelPlacement
  ) {}

  do(doc: CompositeDocument): void {
    doc.setChildLabel(this.id, this.after.anchor, this.after.direction);
  }

  undo(doc: CompositeDocument): void {
    doc.setChildLabel(this.id, this.before.anchor, this.before.direction);
  }
}

/** Add a manually-drawn line to the composite. */
export class AddLineCommand implements Command<CompositeDocument> {
  readonly label = 'Add line';

  constructor(private line: CompositeLine) {}

  do(doc: CompositeDocument): void {
    doc.addLine(this.line);
  }

  undo(doc: CompositeDocument): void {
    doc.removeLine(this.line.id);
  }
}

/** Remove a line, snapshotting its JSON on the first `do` so undo restores it exactly. */
export class RemoveLineCommand implements Command<CompositeDocument> {
  readonly label = 'Remove line';
  private snapshot: CompositeLineJson | null = null;

  constructor(private id: string) {}

  do(doc: CompositeDocument): void {
    const line = doc.getLine(this.id);
    if (!line) return;
    this.snapshot = line.toJSON();
    doc.removeLine(this.id);
  }

  undo(doc: CompositeDocument): void {
    if (!this.snapshot) return;
    doc.addLine(CompositeLine.fromJSON(this.snapshot));
  }
}

/**
 * Replace a line's vertices via before/after snapshots — covers adding a bend,
 * moving a vertex, and re-anchoring an endpoint; the label distinguishes them.
 * Committed once at pointer-up after the gesture is applied transiently.
 */
export class UpdateLineCommand implements Command<CompositeDocument> {
  constructor(
    readonly label: string,
    private id: string,
    private before: LineVertexJson[],
    private after: LineVertexJson[]
  ) {}

  do(doc: CompositeDocument): void {
    doc.setLineVertices(this.id, this.after);
  }

  undo(doc: CompositeDocument): void {
    doc.setLineVertices(this.id, this.before);
  }
}

/** Change a line's functional type (overhead ↔ cable ↔ transformer ↔ demand). */
export class UpdateLineKindCommand implements Command<CompositeDocument> {
  readonly label = 'Change line type';

  constructor(
    private id: string,
    private before: CompositeLineKind,
    private after: CompositeLineKind
  ) {}

  do(doc: CompositeDocument): void {
    doc.setLineKind(this.id, this.after);
  }

  undo(doc: CompositeDocument): void {
    doc.setLineKind(this.id, this.before);
  }
}

/**
 * Replace a line's opaque `data` via before/after snapshots (e.g. updated
 * ratings from the consumer's model). `undefined` clears it. Undoable.
 */
export class SetLineDataCommand implements Command<CompositeDocument> {
  readonly label = 'Update line data';

  constructor(
    private id: string,
    private before: unknown,
    private after: unknown
  ) {}

  do(doc: CompositeDocument): void {
    doc.setLineData(this.id, this.after);
  }

  undo(doc: CompositeDocument): void {
    doc.setLineData(this.id, this.before);
  }
}

/**
 * Pin (or clear) a feeder's exit direction on a child, via before/after
 * snapshots — a deliberate per-instance override that beats the auto-facing
 * policy and the child's authored direction. `undefined` clears the pin (back to
 * auto/authored). Undoable like any discrete edit.
 */
export class SetPortDirectionCommand implements Command<CompositeDocument> {
  constructor(
    readonly label: string,
    private instanceId: string,
    private connectionId: string,
    private before: ExternalDirection | undefined,
    private after: ExternalDirection | undefined
  ) {}

  do(doc: CompositeDocument): void {
    doc.setPortDirection(this.instanceId, this.connectionId, this.after);
  }

  undo(doc: CompositeDocument): void {
    doc.setPortDirection(this.instanceId, this.connectionId, this.before);
  }
}

/** Toggle the composite between the box (grid-level) view and the detailed view. */
export class SetBoxModeCommand implements Command<CompositeDocument> {
  readonly label = 'Toggle box view';

  constructor(
    private before: boolean,
    private after: boolean
  ) {}

  do(doc: CompositeDocument): void {
    doc.updateMeta({ boxMode: this.after });
  }

  undo(doc: CompositeDocument): void {
    doc.updateMeta({ boxMode: this.before });
  }
}

/**
 * Toggle the composite's auto-facing policy (strict ↔ flexible). Derived facing
 * sides aren't persisted, so this only flips the policy flag; the layout
 * re-derives every feeder's side on the next pass.
 */
export class SetAutoFacingCommand implements Command<CompositeDocument> {
  readonly label = 'Toggle auto-facing';

  constructor(
    private before: boolean,
    private after: boolean
  ) {}

  do(doc: CompositeDocument): void {
    doc.updateMeta({ autoFacing: this.after });
  }

  undo(doc: CompositeDocument): void {
    doc.updateMeta({ autoFacing: this.before });
  }
}

/**
 * Run a single-diagram command (e.g. an `UpdateElementCommand` toggling a bay's
 * `Position.state`) against one child's resolved document, as ONE step of the
 * composite's history — so a composite editor keeps a single undo/redo stack
 * while editing a child's internals. Notifies the composite (`touchChild`) so
 * views re-layout. No-op when the child is missing or unresolved.
 *
 * Note: instances placed from the same `libraryId` share one resolved document,
 * so an edit shows on all of them.
 */
export class ChildDocumentCommand implements Command<CompositeDocument> {
  readonly label: string;

  constructor(
    private instanceId: string,
    private inner: Command<SldDocument>
  ) {
    this.label = inner.label;
  }

  do(doc: CompositeDocument): void {
    const child = doc.getChild(this.instanceId)?.resolved;
    if (!child) return;
    this.inner.do(child);
    doc.touchChild(this.instanceId);
  }

  undo(doc: CompositeDocument): void {
    const child = doc.getChild(this.instanceId)?.resolved;
    if (!child) return;
    this.inner.undo(child);
    doc.touchChild(this.instanceId);
  }
}
