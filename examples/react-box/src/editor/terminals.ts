/**
 * Box-view authoring helpers: which feeder terminals are free, what box a click
 * landed on, and the commands that grow a bay on demand. All app-side: core and
 * the adapter stay unchanged (they only see ordinary commands and anchors).
 *
 * A "terminal" is a child's external feeder connection — the bay-level endpoint
 * a `CompositeLine` anchor references by `(instanceId, connectionId)`. One line
 * per terminal: a feeder already anchored by a line is *used*.
 */
import {
  AddLaneCommand,
  AddLineCommand,
  AddPositionCommand,
  BatchCommand,
  CompositeLine,
  Grid,
  Position,
  nextPositionLabel,
  type ChildLayout,
  type Command,
  type CompositeDocument,
  type CompositeLayout,
  type CompositeLineKind,
  type ExternalConnectionTip,
  type LineVertexJson,
  type Point,
  type PositionType,
  type Rect,
  type SldDocument
} from '@sld-kit/core';
import { busTopology } from '../topology';

/** A feeder terminal of one child, for pickers. */
export interface Terminal {
  connectionId: string;
  /** Feeder label (the external arrow's label), else its bay's label. */
  label: string;
  /** Label of the bay the feeder hangs off. */
  bayLabel: string;
}

/** Is this feeder terminal already anchored by a line? */
export function isUsed(composite: CompositeDocument, instanceId: string, connectionId: string): boolean {
  return composite.linesAt(instanceId, connectionId).length > 0;
}

/** Snap targets for Draw: only the terminals no line uses yet. */
export function freeTips(layout: CompositeLayout, composite: CompositeDocument): ExternalConnectionTip[] {
  return layout.snapTips.filter((t) => !isUsed(composite, t.instanceId, t.connectionId));
}

/** Every external feeder of a document, in element order. */
export function terminalsOf(doc: SldDocument): Terminal[] {
  const out: Terminal[] = [];
  for (const conn of doc.connections()) {
    const ext = conn.to.kind === 'external' ? conn.to : conn.from.kind === 'external' ? conn.from : null;
    const bay = conn.from.kind === 'element' ? conn.from.id : conn.to.kind === 'element' ? conn.to.id : null;
    if (!ext) continue;
    const bayLabel = (bay && doc.getElement(bay)?.label) || '';
    out.push({ connectionId: conn.id, label: ext.label || bayLabel || 'feeder', bayLabel });
  }
  return out;
}

/** The free terminals of a child (optionally only those drawn from one section box). */
export function freeTerminals(
  composite: CompositeDocument,
  child: ChildLayout,
  sectionKey: string | null
): Terminal[] {
  const doc = child.instance.resolved;
  if (!doc) return [];
  let terms = terminalsOf(doc);
  if (sectionKey && child.boxes && child.boxes.length > 1) {
    // Unlisted feeders go to the first box (core's rule), so mirror it.
    const listed = new Set(child.boxes.flatMap((b) => b.section.connectionIds));
    const own = new Set(child.boxes.find((b) => b.key === sectionKey)?.section.connectionIds ?? []);
    const first = child.boxes[0].key === sectionKey;
    terms = terms.filter((t) => own.has(t.connectionId) || (first && !listed.has(t.connectionId)));
  }
  return terms.filter((t) => !isUsed(composite, child.instance.id, t.connectionId));
}

function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** World AABB of a child-local rect under the child's transform. */
function worldRect(child: ChildLayout, r: Rect): Rect {
  const pts = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x, y: r.y + r.height },
    { x: r.x + r.width, y: r.y + r.height }
  ].map((p) => child.transform.apply(p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The box a world point falls on: a child, plus its section box key when it's split. Topmost first. */
export function boxAt(
  layout: CompositeLayout,
  point: Point,
  boxMode: boolean
): { child: ChildLayout; sectionKey: string | null } | null {
  for (let i = layout.children.length - 1; i >= 0; i--) {
    const child = layout.children[i];
    if (boxMode && !child.expanded && child.boxes && child.boxes.length > 1) {
      const box = child.boxes.find((b) => contains(worldRect(child, b.frame), point));
      if (box) return { child, sectionKey: box.key };
      continue;
    }
    if (contains(child.worldBounds, point)) return { child, sectionKey: null };
  }
  return null;
}

/** The bar a new bay should hang off: the section's top bar, else the document's first bar. */
export function barFor(doc: SldDocument, sectionKey: string | null): string | null {
  if (sectionKey) {
    const section = busTopology(doc).sections.find((s) => s.key === sectionKey);
    if (section?.busbarIds.length) return section.busbarIds[0];
  }
  const bars = doc.busBars().slice().sort((a, b) => a.row - b.row);
  return bars[0]?.id ?? null;
}

/** Position type (and so feeder asset) for a line kind. */
export function bayTypeFor(kind: CompositeLineKind): PositionType {
  if (kind === 'demand') return 'demand';
  if (kind === 'transformer') return 'transformer';
  return 'line';
}

/**
 * Grow one bay + its feeder off a bar, as one undoable step on a child document.
 * The cell is planned on the first `do` (adding a column, or a row past the
 * grid's edge, when nothing fits) and replayed on redo, like
 * `AddPositionCommand`. `feederId` is the spawned external connection's id,
 * known after the first `do`.
 */
export class AutoBayCommand implements Command<SldDocument> {
  readonly label = 'Add bay';
  private inner: BatchCommand<SldDocument> | null = null;
  private positionId: string | null = null;
  feederId: string | null = null;

  constructor(
    private barId: string,
    private type: PositionType
  ) {}

  do(doc: SldDocument): void {
    if (!this.inner) this.inner = this.plan(doc);
    this.inner.do(doc);
    if (!this.feederId && this.positionId) {
      // AddPositionCommand spawns the external arrow for line/transformer/demand bays.
      const feeder = doc
        .connectionsOf(this.positionId)
        .find((c) => c.to.kind === 'external' || c.from.kind === 'external');
      this.feederId = feeder?.id ?? null;
    }
  }

  undo(doc: SldDocument): void {
    this.inner?.undo(doc);
  }

  private plan(doc: SldDocument): BatchCommand<SldDocument> {
    const bar = doc.busBars().find((b) => b.id === this.barId);
    if (!bar) return new BatchCommand('Add bay', []);
    const grid = new Grid(doc);
    const { rows, cols } = doc.grid;
    const barRows = grid.busBarRows();

    // A cell next to the bar wires to it alone when nothing sits beyond it in
    // its column (otherwise auto-wiring would chain it to that element).
    const clearBeyond = (row: number, col: number, step: 1 | -1) => {
      for (let r = row + step; r >= 0 && r < rows; r += step) {
        if (barRows.has(r) || grid.occupant({ row: r, col })) return false;
      }
      return true;
    };
    const sides: { row: number; step: 1 | -1 }[] = [
      { row: bar.row + 1, step: 1 },
      { row: bar.row - 1, step: -1 }
    ];
    const pre: Command<SldDocument>[] = [];
    let cell: { row: number; col: number } | null = null;
    for (let col = 0; col < cols && !cell; col++) {
      for (const s of sides) {
        if (s.row < 0 || s.row >= rows || barRows.has(s.row)) continue;
        if (grid.isFree({ row: s.row, col }) && clearBeyond(s.row, col, s.step)) {
          cell = { row: s.row, col };
          break;
        }
      }
    }
    if (!cell) {
      // Nothing free: a fresh column, on whichever side of the bar is a slot row.
      const side = sides.find((s) => s.row >= 0 && s.row < rows && !barRows.has(s.row));
      if (side) {
        pre.push(new AddLaneCommand('col'));
        cell = { row: side.row, col: cols };
      } else {
        // The bar is the grid's last row with no slot row around it: grow one below.
        pre.push(new AddLaneCommand('row'));
        if (cols === 0) pre.push(new AddLaneCommand('col'));
        cell = { row: rows, col: 0 };
      }
    }

    const position = Position.of({
      type: this.type,
      label: nextPositionLabel(doc, this.type),
      row: cell.row,
      col: cell.col
    });
    this.positionId = position.id;
    return new BatchCommand('Add bay', [...pre, new AddPositionCommand(position)]);
  }
}

/** One vertex of a line being drawn: a free point, a terminal, or a bay to create on commit. */
export type DraftVertex =
  | { kind: 'point'; point: Point }
  | { kind: 'anchor'; point: Point; instanceId: string; connectionId: string }
  | { kind: 'newBay'; point: Point; instanceId: string; barId: string };

export function sameVertex(a: DraftVertex, b: DraftVertex): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'point' && b.kind === 'point') return a.point.x === b.point.x && a.point.y === b.point.y;
  if (a.kind === 'anchor' && b.kind === 'anchor') return a.instanceId === b.instanceId && a.connectionId === b.connectionId;
  return false; // two new bays are always two different bays
}

/** Collapse consecutive duplicates (a finishing double-click also fires two clicks). */
export function dedupe(draft: DraftVertex[]): DraftVertex[] {
  return draft.filter((v, i) => i === 0 || !sameVertex(v, draft[i - 1]));
}

/**
 * Adds a line whose new-bay ends resolve to the feeders their `AutoBayCommand`s
 * spawned — known only once those ran earlier in the same batch.
 */
class AddDraftLineCommand implements Command<CompositeDocument> {
  readonly label = 'Add line';
  private inner: AddLineCommand | null = null;

  constructor(
    private id: string,
    private draft: DraftVertex[],
    private bays: Map<number, AutoBayCommand>,
    private kind: CompositeLineKind
  ) {}

  do(doc: CompositeDocument): void {
    if (!this.inner) {
      const vertices: LineVertexJson[] = [];
      this.draft.forEach((v, i) => {
        if (v.kind === 'anchor') vertices.push({ kind: 'anchor', instanceId: v.instanceId, connectionId: v.connectionId });
        else if (v.kind === 'newBay') {
          const feederId = this.bays.get(i)?.feederId;
          vertices.push(
            feederId ? { kind: 'anchor', instanceId: v.instanceId, connectionId: feederId } : { kind: 'point', ...v.point }
          );
        } else vertices.push({ kind: 'point', x: v.point.x, y: v.point.y });
      });
      this.inner = new AddLineCommand(new CompositeLine(this.id, vertices, this.kind));
    }
    this.inner.do(doc);
  }

  undo(doc: CompositeDocument): void {
    this.inner?.undo(doc);
  }
}

/** Why a draft can't become a line (a user-facing hint), or `null` when it can. */
export function draftProblem(composite: CompositeDocument, draft: DraftVertex[]): string | null {
  if (draft.length < 2) return 'A line needs at least two points';
  const anchors = draft.filter((v): v is Extract<DraftVertex, { kind: 'anchor' }> => v.kind === 'anchor');
  for (const a of anchors) {
    if (isUsed(composite, a.instanceId, a.connectionId)) return 'That feeder already has a line — pick a free one';
  }
  if (anchors.length === 2 && sameVertex(anchors[0], anchors[1])) return 'Both ends are the same feeder';
  return null;
}

/**
 * The whole draw as ONE composite step: grow any new bays (each in its child's
 * history via `wrap`), then add the line anchored to them.
 */
export function draftCommand(
  draft: DraftVertex[],
  kind: CompositeLineKind,
  lineId: string,
  wrap: (instanceId: string, cmd: Command<SldDocument>) => Command<CompositeDocument>
): Command<CompositeDocument> {
  const bays = new Map<number, AutoBayCommand>();
  const steps: Command<CompositeDocument>[] = [];
  draft.forEach((v, i) => {
    if (v.kind !== 'newBay') return;
    const cmd = new AutoBayCommand(v.barId, bayTypeFor(kind));
    bays.set(i, cmd);
    steps.push(wrap(v.instanceId, cmd));
  });
  steps.push(new AddDraftLineCommand(lineId, draft, bays, kind));
  return new BatchCommand('Add line', steps);
}
