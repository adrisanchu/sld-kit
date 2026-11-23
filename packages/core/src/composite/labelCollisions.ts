import type { Point, Rect } from '../layout/geometry';

/**
 * Where a line's text sits along it: `fraction` of the arc length (in the
 * placer's own order) and which side of the line. `side` is `1` for the
 * placer's default side and `-1` for the opposite one. `offset` (world px,
 * default 0) sets the text further from the line as a **callout**, joined back
 * to it by a leader: for a line whose neighbours leave no room beside it.
 */
export interface TextSlot {
  fraction: number;
  side: 1 | -1;
  offset?: number;
}

/** Everything a placed label or name must keep clear of. */
export interface LabelObstacles {
  /** Polylines the text shouldn't sit on: every line, link and hanging lead. */
  polylines: Point[][];
  /** Boxes the text shouldn't cover: child boxes, line glyphs. */
  rects: Rect[];
}

/** A text placed in a slot: its box and, for a callout, its leader polyline. */
export interface PlacedText {
  box: Rect;
  leader?: { points: Point[] };
}

/** One text item to place: its default slot and a placer for any other slot. */
export interface LabelCandidate {
  slot: TextSlot;
  place: (slot: TextSlot) => PlacedText | null;
  /** Called with the slot that was chosen, when it isn't the default one. */
  apply: (slot: TextSlot) => void;
}

/** Fraction steps tried around the default slot, nearest first (each both ways). */
const SLIDE_STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
/** Slots never get closer to a line's ends than this fraction (they'd sit on the boxes). */
const END_MARGIN = 0.08;
/** Distance between callout rows (world px), and how many rows out are tried. */
export const CALLOUT_STEP = 8;
const CALLOUT_ROWS = 12;
/** Callout spots along the line are this many hundredths of its length apart. */
const CALLOUT_SPREAD = 10;
/**
 * Room kept between a text and any line or leader: half a thick box-view
 * stroke plus a little air, so a text never visually touches a line it
 * doesn't belong to.
 */
const LINE_CLEARANCE = 3;

/** Costs of what a candidate overlaps: another text is far worse than a line under it. */
const TEXT_COST = 3;
const RECT_COST = 2;
const LINE_COST = 1;
/**
 * A callout costs a little on its own, so a clear spot beside the line always
 * wins over one, plus a hair per row out, so the nearest clear row wins. Its
 * leader crossing a neighbouring line is nearly free (that's what it's for),
 * so between two clear rows the side with fewer crossings wins.
 */
const CALLOUT_COST = 0.5;
const CALLOUT_ROW_COST = 0.01;
const LEADER_CROSSING_COST = 0.02;

/**
 * The slots tried for a text whose default slot collides, in order: the
 * default, the same spot on the other side, then sliding along the line by
 * {@link SLIDE_STEPS} (before, then after), each on the default side first;
 * then **callouts**: the same spots one {@link CALLOUT_STEP} further out at a
 * time, nearest row first. Spreading callouts along the line (rather than
 * stacking them at one spot) keeps each next to its own leader.
 */
export function candidateSlots(slot: TextSlot): readonly TextSlot[] {
  const key = `${slot.fraction}:${slot.side}:${slot.offset ?? 0}`;
  let slots = SLOT_CACHE.get(key);
  if (!slots) {
    slots = buildCandidateSlots(slot);
    SLOT_CACHE.set(key, slots);
  }
  return slots;
}

/** Candidate lists depend only on the default slot, of which there are a handful. */
const SLOT_CACHE = new Map<string, readonly TextSlot[]>();

function buildCandidateSlots(slot: TextSlot): readonly TextSlot[] {
  const adjacent: TextSlot[] = [];
  const seen = new Set<string>();
  const fractions = [slot.fraction];
  for (const step of SLIDE_STEPS) fractions.push(slot.fraction - step, slot.fraction + step);
  for (const f of fractions) {
    if (f !== slot.fraction && (f < END_MARGIN || f > 1 - END_MARGIN)) continue;
    for (const side of [slot.side, -slot.side as 1 | -1]) {
      const key = `${f.toFixed(4)}:${side}`;
      if (seen.has(key)) continue;
      seen.add(key);
      adjacent.push({ fraction: f, side });
    }
  }
  // Callouts spread more coarsely (every other slide step): plenty to keep
  // them apart along the line, at half the search.
  const spots = adjacent.filter((a) => Math.round(Math.abs(a.fraction - slot.fraction) * 100) % CALLOUT_SPREAD === 0);
  const callouts: TextSlot[] = [];
  for (let row = 1; row <= CALLOUT_ROWS; row++) {
    for (const s of spots) callouts.push({ ...s, offset: row * CALLOUT_STEP });
  }
  return [...adjacent, ...callouts];
}

/**
 * Keep line texts (numeric labels and names) readable: place each in turn and,
 * when its default slot overlaps another text, a line or a box, move it to the
 * cheapest candidate slot (see {@link candidateSlots}): beside its line when a
 * clear spot exists there, else as a callout with a leader back to it. Nothing
 * is ever hidden; a text whose default slot is clear stays exactly where it
 * was, and ties keep the earliest candidate. Visit order is the caller's
 * (document order), which makes it deterministic.
 */
export function resolveLabelCollisions(texts: LabelCandidate[], obstacles: LabelObstacles): void {
  const index = new SpatialIndex();
  obstacles.polylines.forEach((line, id) => index.addPolyline('line', id, line));
  for (const rect of obstacles.rects) index.add({ kind: 'rect', rect }, rect);
  let leaderId = 0;
  for (const text of texts) {
    const placeAt = calloutPlacer(text);
    const initial = text.place(text.slot);
    if (!initial) continue;
    let best = initial;
    let bestCost = cost(initial, text.slot, index);
    if (bestCost > 0) {
      let bestSlot = text.slot;
      /** The row of the first clear callout: rows further out can't do better. */
      let clearRow = Infinity;
      const slots = candidateSlots(text.slot);
      for (let i = 1; i < slots.length; i++) {
        const slot = slots[i];
        // No callout can beat a candidate already at most a clear callout's cost.
        if (slot.offset && bestCost <= CALLOUT_COST) break;
        if ((slot.offset ?? 0) > clearRow) break;
        const at = placeAt(slot);
        if (!at) continue;
        const c = cost(at, slot, index);
        if (slot.offset && c < CALLOUT_COST + LINE_COST) clearRow = Math.min(clearRow, slot.offset);
        if (c < bestCost) {
          bestCost = c;
          best = at;
          bestSlot = slot;
          if (c === 0) break;
        }
      }
      if (bestSlot !== text.slot) text.apply(bestSlot);
    }
    index.add({ kind: 'text', rect: best.box }, best.box);
    if (best.leader) index.addPolyline('leader', leaderId++, best.leader.points);
  }
}

/**
 * `text.place`, but a callout beyond the first row is derived from that row by
 * translation: moving a callout one row out shifts its box and its leader's far
 * end along the line's normal (the leader's direction), with nothing else
 * changing. Saves re-running the placer for every row.
 */
function calloutPlacer(text: LabelCandidate): (slot: TextSlot) => PlacedText | null {
  const firstRow = new Map<string, PlacedText | null>();
  return (slot) => {
    if (!slot.offset || slot.offset === CALLOUT_STEP) return text.place(slot);
    const key = `${slot.fraction}:${slot.side}`;
    let row1 = firstRow.get(key);
    if (row1 === undefined) {
      row1 = text.place({ ...slot, offset: CALLOUT_STEP });
      firstRow.set(key, row1);
    }
    const leader = row1?.leader?.points;
    if (!row1 || !leader) return text.place(slot);
    const dot = leader[0];
    const end = leader[leader.length - 1];
    const len = Math.hypot(end.x - dot.x, end.y - dot.y);
    if (len === 0) return text.place(slot);
    const k = slot.offset - CALLOUT_STEP;
    const dx = ((end.x - dot.x) / len) * k;
    const dy = ((end.y - dot.y) / len) * k;
    return {
      box: { ...row1.box, x: row1.box.x + dx, y: row1.box.y + dy },
      leader: { points: [dot, { x: end.x + dx, y: end.y + dy }] }
    };
  };
}

function cost(text: PlacedText, slot: TextSlot, index: SpatialIndex): number {
  // Texts and boxes may touch (a hairline inset); lines keep their stroke's room.
  const r = inset(text.box, 1);
  const wide = inset(text.box, -LINE_CLEARANCE);
  // Pulled in at both ends, so its own line and its own text don't count.
  const inner = text.leader ? shorten(text.leader.points, 1.5) : null;
  const items = index.query(inner ? union(wide, segmentBounds(inner[0], inner[1])) : wide);

  let c = 0;
  const linesHit = new Set<number>();
  const leadersHit = new Set<number>();
  const linesCrossed = new Set<number>();
  for (const it of items) {
    if (it.kind === 'text') {
      if (rectsOverlap(r, it.rect)) c += TEXT_COST;
      if (inner && segmentHitsRect(inner[0], inner[1], it.rect)) c += TEXT_COST;
    } else if (it.kind === 'rect') {
      if (rectsOverlap(r, it.rect)) c += RECT_COST;
      if (inner && segmentHitsRect(inner[0], inner[1], it.rect)) c += RECT_COST;
    } else if (it.kind === 'line') {
      if (!linesHit.has(it.id) && segmentHitsRect(it.a, it.b, wide)) linesHit.add(it.id);
      if (inner && segmentsCross(inner[0], inner[1], it.a, it.b)) linesCrossed.add(it.id);
    } else {
      if (segmentHitsRect(it.a, it.b, wide)) leadersHit.add(it.id);
      if (inner && segmentsCross(inner[0], inner[1], it.a, it.b)) leadersHit.add(it.id);
    }
  }
  c += (linesHit.size + leadersHit.size) * LINE_COST;
  if (text.leader) {
    c += CALLOUT_COST + (CALLOUT_ROW_COST * (slot.offset ?? 0)) / CALLOUT_STEP;
    c += linesCrossed.size * LEADER_CROSSING_COST;
  }
  return c;
}

type IndexItem =
  | { kind: 'text'; rect: Rect }
  | { kind: 'rect'; rect: Rect }
  | { kind: 'line'; id: number; a: Point; b: Point }
  | { kind: 'leader'; id: number; a: Point; b: Point };

/**
 * A uniform grid over everything placed so far, so a candidate is only tested
 * against what's near it. Query order doesn't matter: a cost is a sum.
 */
class SpatialIndex {
  private readonly cells = new Map<number, IndexItem[]>();
  /** Per-item visit marks, so a query returns each item once without a Set. */
  private readonly seen = new WeakMap<IndexItem, number>();
  private stamp = 0;

  constructor(private readonly size = 64) {}

  add(item: IndexItem, bounds: Rect): void {
    this.each(bounds, (key) => {
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    });
  }

  addPolyline(kind: 'line' | 'leader', id: number, points: Point[]): void {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.add({ kind, id, a, b }, segmentBounds(a, b));
    }
  }

  query(bounds: Rect): IndexItem[] {
    const stamp = ++this.stamp;
    const found: IndexItem[] = [];
    this.each(bounds, (key) => {
      const cell = this.cells.get(key);
      if (!cell) return;
      for (const it of cell) {
        if (this.seen.get(it) === stamp) continue;
        this.seen.set(it, stamp);
        found.push(it);
      }
    });
    return found;
  }

  private each(r: Rect, fn: (key: number) => void): void {
    const x0 = Math.floor(r.x / this.size);
    const x1 = Math.floor((r.x + r.width) / this.size);
    const y0 = Math.floor(r.y / this.size);
    const y1 = Math.floor((r.y + r.height) / this.size);
    // One number per cell: world coordinates stay far inside ±2^20 cells.
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) fn(x * 2097152 + y);
  }
}

/** Bounds of a segment. */
function segmentBounds(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y
  };
}

function inset(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, width: Math.max(0, r.width - 2 * d), height: Math.max(0, r.height - 2 * d) };
}

/** A two-point leader pulled in by `d` at each end. */
function shorten(points: Point[], d: number): Point[] {
  const a = points[0];
  const b = points[points.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len <= 2 * d) return [a, a];
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return [
    { x: a.x + ux * d, y: a.y + uy * d },
    { x: b.x - ux * d, y: b.y - uy * d }
  ];
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether any segment of `points` passes through `r` (Liang–Barsky clip). */
export function polylineHitsRect(points: Point[], r: Rect): boolean {
  for (let i = 1; i < points.length; i++) if (segmentHitsRect(points[i - 1], points[i], r)) return true;
  return false;
}

/** Whether two polylines meet anywhere (touching counts). */
export function polylinesCross(p: Point[], q: Point[]): boolean {
  for (let i = 1; i < p.length; i++) {
    for (let j = 1; j < q.length; j++) if (segmentsCross(p[i - 1], p[i], q[j - 1], q[j])) return true;
  }
  return false;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  // Collinear: touching or overlapping.
  const on = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return (
    (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b))
  );
}

function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  const rx1 = r.x + r.width;
  const ry1 = r.y + r.height;
  // Axis-aligned segments (nearly all of them): a span test.
  if (a.x === b.x) return a.x >= r.x && a.x <= rx1 && Math.max(a.y, b.y) >= r.y && Math.min(a.y, b.y) <= ry1;
  if (a.y === b.y) return a.y >= r.y && a.y <= ry1 && Math.max(a.x, b.x) >= r.x && Math.min(a.x, b.x) <= rx1;
  // Otherwise clip the segment against the rect (Liang–Barsky).
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    return t0 <= t1;
  };
  return clip(-dx, a.x - r.x) && clip(dx, rx1 - a.x) && clip(-dy, a.y - r.y) && clip(dy, ry1 - a.y);
}
