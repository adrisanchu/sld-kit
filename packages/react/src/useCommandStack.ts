import { useMemo, useSyncExternalStore } from 'react';

/**
 * Structural view of core's `CommandStack`, kept minimal (like `Subscribable`)
 * so this hook serves `CommandStack<SldDocument>` and
 * `CommandStack<CompositeDocument>` without a generic parameter.
 */
export interface CommandStackLike {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  subscribe(fn: () => void): () => void;
}

export interface UndoRedoState {
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Track a command stack's undo/redo availability, for wiring toolbar buttons.
 *
 * Two core details this handles:
 * - `CommandStack.subscribe` invokes its callback **immediately** on subscribe
 *   (unlike document `subscribe`, which does not). That extra notification is
 *   harmless here — it just re-reads the getters.
 * - `canUndo` / `canRedo` are getters on a stack that mutates in place, so the
 *   snapshot object is cached and only replaced when a value actually changes.
 *   Returning a fresh object every call would loop `useSyncExternalStore`.
 */
export function useCommandStack(stack: CommandStackLike): UndoRedoState {
  const store = useMemo(() => {
    let snapshot: UndoRedoState = { canUndo: stack.canUndo, canRedo: stack.canRedo };
    return {
      subscribe: (onStoreChange: () => void) => stack.subscribe(onStoreChange),
      getSnapshot(): UndoRedoState {
        if (snapshot.canUndo !== stack.canUndo || snapshot.canRedo !== stack.canRedo) {
          snapshot = { canUndo: stack.canUndo, canRedo: stack.canRedo };
        }
        return snapshot;
      }
    };
  }, [stack]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
