import type { ExternalAssetKind, PositionType } from './types';
import { SldDocument } from './SldDocument';

/**
 * Default label prefixes used for auto-naming. Users draw quickly without
 * naming anything, then rename later. Kept short and stable —
 * `line-1`, `trf-2`, … — matching how operators abbreviate bay functions.
 *
 * `PositionType` is open, so this is a plain string map of *defaults*, not an
 * exhaustive record: callers may pass their own map, and an unknown type falls
 * back to the type string itself as the prefix (`coupling` → `coupling-1`).
 */
export const POSITION_LABEL_PREFIX: Record<string, string> = {
  line: 'line',
  transformer: 'trf',
  central: 'central',
  renewable: 'ren',
  reserve: 'res'
};

export const EXTERNAL_LABEL_PREFIX: Record<ExternalAssetKind, string> = {
  line: 'line',
  transformer: 'trf',
  renewable: 'ren',
  storage: 'sto',
  demand: 'dem'
};

/** Escape a prefix for safe embedding in the suffix-matching RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Next free `${prefix}-${n}` given the labels already present. Uses the max
 * existing suffix + 1 (not a raw count) so deleting a middle position never
 * produces a duplicate name.
 */
function nextLabel(prefix: string, existing: Iterable<string>): string {
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`);
  let max = 0;
  for (const label of existing) {
    const m = re.exec(label);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${max + 1}`;
}

/**
 * Auto-name for a new position of `type` (e.g. "line-3", "trf-1"). `prefixes`
 * maps a position type to its label prefix; an unknown type falls back to the
 * type string itself, so custom bay types auto-name without a config change.
 */
export function nextPositionLabel(
  doc: SldDocument,
  type: PositionType,
  prefixes: Record<string, string> = POSITION_LABEL_PREFIX
): string {
  const prefix = prefixes[type] ?? type;
  return nextLabel(
    prefix,
    doc.positions().map((p) => p.label)
  );
}

/** Auto-name for a new external asset of `asset` kind. */
export function nextExternalLabel(doc: SldDocument, asset: ExternalAssetKind): string {
  const prefix = EXTERNAL_LABEL_PREFIX[asset];
  const labels: string[] = [];
  for (const conn of doc.connections()) {
    if (conn.from.kind === 'external') labels.push(conn.from.label);
    if (conn.to.kind === 'external') labels.push(conn.to.label);
  }
  return nextLabel(prefix, labels);
}
