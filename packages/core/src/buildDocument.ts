import type { DocumentMeta, ElementId, ExternalAssetKind, ExternalDirection, PositionType, SwitchState } from './types';
import { SldDocument } from './SldDocument';
import { BusBar } from './elements/BusBar';
import { Position } from './elements/Position';
import { Connection } from './elements/Connection';
import { element, external } from './elements/endpoints';
import { nextPositionLabel, POSITION_LABEL_PREFIX } from './naming';
import { autoWire } from './wiring';
import { DuplicateIdError, SldParseError } from './serialization/validate';
import { cloneData } from './elements/Element';

/** The outgoing line a position feeds out of the diagram, if any. */
export interface FeederSpec {
  asset: ExternalAssetKind;
  label: string;
  /** Arrow direction; omit to let the layout derive it (up toward the nearer bar). */
  direction?: ExternalDirection;
  /**
   * Explicit connection id; defaults to a fresh `newId()`. Set it to give a
   * feeder a stable, shareable id — e.g. a tie-line that a composite auto-links
   * by matching the same id across two diagrams.
   */
  id?: ElementId;
}

/** One bay position: its functional type + row. `label` is optional (auto-named). */
export interface BayPositionSpec {
  type: PositionType;
  row: number;
  /** Explicit element id; defaults to a fresh `newId()`. Set it to address the position later (e.g. switch state). */
  id?: ElementId;
  /** Opaque consumer metadata (see `SldElement.data`) — roundtripped, never read. */
  data?: unknown;
  /** Switching state; omit for `closed`. */
  state?: SwitchState;
  /** Explicit label; when omitted, auto-named `${prefix}-${n}` for the type. */
  label?: string;
  /** Columns the position spans (default 1). */
  colSpan?: number;
  /** The outgoing line this position feeds, if any. */
  feeder?: FeederSpec;
}

/**
 * A bay is one column: a stack of positions. Each position may feed its own
 * outgoing line, so a column can carry several feeders (e.g. one off the top
 * position toward the top bar and one off the bottom toward the bottom bar).
 */
export interface BaySpec {
  col: number;
  positions: BayPositionSpec[];
}

/** One busbar row. `id` / `data` are optional, like on positions. */
export interface BusBarSpec {
  label: string;
  row: number;
  /** Explicit element id; defaults to a fresh `newId()`. */
  id?: ElementId;
  /** Opaque consumer metadata (e.g. a bus number) — roundtripped, never read. */
  data?: unknown;
}

export interface BuildDocumentSpec {
  meta?: Partial<DocumentMeta>;
  busbars: BusBarSpec[];
  bays: BaySpec[];
  /** Naming-prefix overrides for auto-named positions (per position type). */
  prefixes?: Record<string, string>;
}

/**
 * Build a validated, fully-wired document from a small declarative spec —
 * describe *what you see* (bars, columns of bays, feeders) instead of placing
 * and wiring every element by hand. Composes the lower authoring tiers:
 * auto-names unlabeled positions ([[nextPositionLabel]]), sizes the grid and
 * series-wires every column ([[autoWire]] → `fitGrid`), attaches each position's
 * feeder, then runs `doc.validate()` and throws `SldParseError` if the result
 * is not internally consistent.
 *
 * `id` and `data` are optional everywhere: omit them for a quick first draft
 * (ids are generated, no data), then add them incrementally to enrich the
 * model. Explicit ids are checked up front — every clash in the spec (bars,
 * positions, feeders) is reported in one {@link DuplicateIdError} before
 * anything is built. Each spec's `data` is deep-copied, so elements never share
 * an object.
 *
 * Unlike `AddPositionCommand`, external feeders are **explicit**: a feeder hangs
 * off the specific position it leaves from (`position.feeder`), not implicitly
 * from a position's type — so the spec says exactly what leaves the diagram, and
 * a column can carry several feeders. Anything the spec can't express is still
 * reachable through the explicit element/command API.
 */
export function buildDocument(spec: BuildDocumentSpec): SldDocument {
  assertUniqueIds(spec);
  const doc = new SldDocument(spec.meta); // grid omitted → autoWire's fitGrid sizes it
  const prefixes = spec.prefixes ?? POSITION_LABEL_PREFIX;

  for (const bb of spec.busbars) {
    doc.addElement(BusBar.of({ id: bb.id, label: bb.label, row: bb.row, data: cloneData(bb.data) }));
  }

  // Place every bay's positions, auto-naming the unlabeled ones as we go so the
  // per-type counter (line-1, line-2, …) sees the labels already placed. Keep
  // each position paired with its feeder spec so we can wire it after autoWire.
  const feeders: Array<{ pos: Position; feeder: FeederSpec }> = [];
  for (const bay of spec.bays) {
    for (const p of bay.positions) {
      const pos = Position.of({
        id: p.id,
        data: cloneData(p.data),
        state: p.state,
        label: p.label ?? nextPositionLabel(doc, p.type, prefixes),
        type: p.type,
        row: p.row,
        col: bay.col,
        colSpan: p.colSpan
      });
      doc.addElement(pos);
      if (p.feeder) feeders.push({ pos, feeder: p.feeder });
    }
  }

  // Series-wire the columns (bar↔bay, bay↔bay). Feeders are added explicitly
  // below, so suppress autoWire's type-driven auto-spawning.
  autoWire(doc, { externals: false });

  for (const { pos, feeder } of feeders) {
    doc.addElement(
      Connection.of({
        id: feeder.id,
        from: element(pos.id),
        to: external({ asset: feeder.asset, label: feeder.label, direction: feeder.direction })
      })
    );
  }

  const errors = doc.validate();
  if (errors.length > 0) {
    throw new SldParseError(`buildDocument produced an invalid document: ${errors.map((e) => e.message).join('; ')}`);
  }

  return doc;
}

/**
 * Reject a spec whose explicit ids clash, listing every duplicate and where it
 * is (`busbar "BB1"`, `position col 1 row 2`, `feeder "SOUTH 1"`), so a model
 * enriched step by step can be fixed in one pass. Generated ids never clash.
 */
function assertUniqueIds(spec: BuildDocumentSpec): void {
  const seen = new Map<ElementId, string[]>();
  const note = (id: ElementId | undefined, where: string) => {
    if (id === undefined) return;
    seen.set(id, [...(seen.get(id) ?? []), where]);
  };
  for (const bb of spec.busbars) note(bb.id, `busbar "${bb.label}"`);
  for (const bay of spec.bays) {
    for (const p of bay.positions) {
      note(p.id, `position col ${bay.col} row ${p.row}`);
      if (p.feeder) note(p.feeder.id, `feeder "${p.feeder.label}"`);
    }
  }
  const dups = [...seen].filter(([, where]) => where.length > 1);
  if (dups.length === 0) return;
  throw new DuplicateIdError(
    dups.map(([id]) => id),
    `buildDocument: ${dups.map(([id, where]) => `duplicate id "${id}" (${where.join(', ')})`).join('; ')}`
  );
}
