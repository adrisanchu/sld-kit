import type { Command } from '../commands/Command';
import type { SldDocument } from '../SldDocument';
import { CompositeDocument } from './CompositeDocument';
import { CompositeLine, type CompositeLineJson, type LineVertexJson } from './CompositeLine';
import { DiagramInstance, type DiagramInstanceJson, type LabelAnchor } from './DiagramInstance';

/** Slot + quarter-turn direction of a child's name label. */
export interface LabelPlacement {
  anchor: LabelAnchor;
  direction: number;
}

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
