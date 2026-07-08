import type { Command } from '../commands/Command';
import type { SldDocument } from '../SldDocument';
import { CompositeDocument } from './CompositeDocument';
import { DiagramInstance, type DiagramInstanceJson } from './DiagramInstance';

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
