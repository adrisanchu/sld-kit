import { SldDocument } from '../SldDocument';

/**
 * Undoable operation on a document. Commands are the ONLY code allowed to
 * call document mutations, so the CommandStack history is always complete and
 * undo/redo can never desync from the model.
 *
 * The document type is a parameter defaulting to `SldDocument`, so every
 * existing usage keeps compiling untouched while the composite editor reuses
 * the same stack with `Command<CompositeDocument>`.
 */
export interface Command<D = SldDocument> {
  /** Short human-readable label (for future history UI / debugging). */
  readonly label: string;
  do(doc: D): void;
  undo(doc: D): void;
}

/**
 * Classic undo/redo stack. `subscribe` notifies on every history change so
 * a UI can derive its undo/redo disabled states.
 */
export class CommandStack<D = SldDocument> {
  private undoStack: Command<D>[] = [];
  private redoStack: Command<D>[] = [];
  private listeners = new Set<() => void>();

  execute(cmd: Command<D>, doc: D): void {
    cmd.do(doc);
    this.undoStack.push(cmd);
    this.redoStack = [];
    this.notify();
  }

  undo(doc: D): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo(doc);
    this.redoStack.push(cmd);
    this.notify();
  }

  redo(doc: D): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do(doc);
    this.undoStack.push(cmd);
    this.notify();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    fn();
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
