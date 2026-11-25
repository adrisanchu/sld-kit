import { BatchCommand, type Command } from '../commands/Command';
import { removeOverlaps } from './arrange';
import { TransformChildCommand } from './commands';
import type { CompositeDocument } from './CompositeDocument';
import type { CompositeLayoutEngine } from './CompositeLayoutEngine';

export interface TidyOptions {
  /**
   * Let the clean-up move locked placements too (default `false`: they stay
   * exactly where they are, and everything else is tidied around them). A
   * moved locked placement stays locked, at its new spot.
   */
  includeLocked?: boolean;
  /** Box view: clearance kept between boxes (default {@link TIDY_BOX_GAP}). */
  gap?: number;
}

/** Default clearance between boxes after a box-view tidy. */
export const TIDY_BOX_GAP = 40;

/**
 * "Tidy": an on-demand full clean-up of a composite's layout — the moment the
 * layout algorithms run on everything, as opposed to a frozen layout (see
 * `CompositeLayoutOptions.freeze`), where an edit only touches what changed.
 *
 * - Always: forgets `engine`'s frozen state for `doc`, so the next layout
 *   re-routes every line and re-solves the detail spread from scratch.
 * - Box view: pushes overlapping boxes apart (locked ones stay put unless
 *   `includeLocked`).
 * - Detail view with `includeLocked`: re-solves the spread with the locked
 *   drawings free to move too, and stores their new spots (they stay locked).
 *
 * Returns ONE undoable command for the position changes, or `null` when none
 * moved (re-solving routes and the spread is view state, nothing to undo).
 * Run it on the composite's `CommandStack` like any other command.
 */
export function tidyCommand(
  doc: CompositeDocument,
  engine: CompositeLayoutEngine,
  options: TidyOptions = {}
): Command<CompositeDocument> | null {
  const includeLocked = options.includeLocked ?? false;
  engine.invalidate(doc);
  const moves: Command<CompositeDocument>[] = [];
  const move = (id: string, dx: number, dy: number) => {
    const child = doc.getChild(id);
    if (!child || (!dx && !dy)) return;
    const before = { x: child.x, y: child.y, angleDeg: child.angleDeg };
    moves.push(new TransformChildCommand('Tidy', id, before, { ...before, x: child.x + dx, y: child.y + dy }));
  };

  if (doc.meta.boxMode) {
    const { children } = engine.layout(doc);
    const locked = includeLocked ? [] : children.filter((c) => c.instance.locked).map((c) => c.instance.id);
    // Smallest moves that clear every overlap (no crowd expansion: a clean-up,
    // not a re-arrangement).
    const offsets = removeOverlaps(
      children.map((c) => ({ id: c.instance.id, rect: c.worldBounds })),
      { gap: options.gap ?? TIDY_BOX_GAP, fixed: locked, expand: false }
    );
    for (const [id, d] of offsets) move(id, d.x, d.y);
  } else if (includeLocked) {
    // Locked drawings join the spread; keep the spots it gives them.
    for (const c of engine.layout(doc, { ignoreLocks: true }).children) {
      if (c.instance.locked && c.spreadOffset) move(c.instance.id, c.spreadOffset.x, c.spreadOffset.y);
    }
  }

  // The positions the commands set are solved afresh on the next layout.
  engine.invalidate(doc);
  return moves.length ? new BatchCommand('Tidy', moves) : null;
}
