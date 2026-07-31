import type { DocumentMeta, ExternalAssetKind, ExternalDirection, PositionType } from './types';
import { SldDocument } from './SldDocument';
import { BusBar } from './elements/BusBar';
import { Position } from './elements/Position';
import { Connection } from './elements/Connection';
import { element, external } from './elements/endpoints';
import { newId } from './ids';
import { nextPositionLabel, POSITION_LABEL_PREFIX } from './naming';
import { autoWire } from './wiring';
import { SldParseError } from './serialization/validate';

/** The outgoing line a position feeds out of the diagram, if any. */
export interface FeederSpec {
  asset: ExternalAssetKind;
  label: string;
  /** Arrow direction; omit to let the layout derive it (up toward the nearer bar). */
  direction?: ExternalDirection;
}

/** One bay position: its functional type + row. `label` is optional (auto-named). */
export interface BayPositionSpec {
  type: PositionType;
  row: number;
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

export interface BuildDocumentSpec {
  meta?: Partial<DocumentMeta>;
  busbars: Array<{ label: string; row: number }>;
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
 * Unlike `AddPositionCommand`, external feeders are **explicit**: a feeder hangs
 * off the specific position it leaves from (`position.feeder`), not implicitly
 * from a position's type — so the spec says exactly what leaves the diagram, and
 * a column can carry several feeders. Anything the spec can't express is still
 * reachable through the explicit element/command API.
 */
export function buildDocument(spec: BuildDocumentSpec): SldDocument {
  const doc = new SldDocument(spec.meta); // grid omitted → autoWire's fitGrid sizes it
  const prefixes = spec.prefixes ?? POSITION_LABEL_PREFIX;

  for (const bb of spec.busbars) {
    doc.addElement(new BusBar(newId(), bb.label, bb.row));
  }

  // Place every bay's positions, auto-naming the unlabeled ones as we go so the
  // per-type counter (line-1, line-2, …) sees the labels already placed. Keep
  // each position paired with its feeder spec so we can wire it after autoWire.
  const feeders: Array<{ pos: Position; feeder: FeederSpec }> = [];
  for (const bay of spec.bays) {
    for (const p of bay.positions) {
      const label = p.label ?? nextPositionLabel(doc, p.type, prefixes);
      const pos = new Position(newId(), label, p.type, p.row, bay.col, p.colSpan ?? 1);
      doc.addElement(pos);
      if (p.feeder) feeders.push({ pos, feeder: p.feeder });
    }
  }

  // Series-wire the columns (bar↔bay, bay↔bay). Feeders are added explicitly
  // below, so suppress autoWire's type-driven auto-spawning.
  autoWire(doc, { externals: false });

  for (const { pos, feeder } of feeders) {
    doc.addElement(
      new Connection(
        newId(),
        '',
        element(pos.id),
        external({ asset: feeder.asset, label: feeder.label, direction: feeder.direction })
      )
    );
  }

  const errors = doc.validate();
  if (errors.length > 0) {
    throw new SldParseError(`buildDocument produced an invalid document: ${errors.map((e) => e.message).join('; ')}`);
  }

  return doc;
}
