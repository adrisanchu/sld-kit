import { Connection } from '../elements/Connection';
import { connectionForExternalId, externalBranch } from '../elements/branch';
import { SldDocument } from '../SldDocument';
import { Serializer } from '../serialization/Serializer';
import type { ExternalDirection } from '../types';
import { SLD_LAYOUT, type SldLayoutConfig } from '../layout';
import { LayoutEngine, type DiagramLayout } from '../layout/LayoutEngine';
import { Transform2D } from '../layout/Transform2D';
import type { Point, Rect } from '../layout/geometry';
import { CompositeDocument } from './CompositeDocument';
import {
  CompositeLine,
  DEFAULT_LINE_NAME_PLACEMENT,
  type CompositeLineKind,
  type LineNamePlacement,
  type LineNameSide,
  type LineVertexJson
} from './CompositeLine';
import { isOrthogonalRouting, routePolyline, type LineRouting } from './routing';
import { chordFrame } from './lineFrame';
import { DiagramInstance, normalizeQuarterTurn, type LabelAnchor } from './DiagramInstance';
import { OrthogonalRouter } from './OrthogonalRouter';
import { laneOffsets, sideKey, type BundleMember } from './bundles';
import { PortResolver, feederKey } from './PortResolver';
import { facingSide, rotateSide, type BoxSide, type Port } from './ports';
import {
  BOX_SIZE,
  CABLE_DASH_ARRAY,
  CURVE_RADIUS,
  DEMAND_LEAD_LENGTH,
  DEMAND_SYMBOL,
  HANGING_ASSETS,
  HANGING_LABEL_GAP,
  LINE_LABEL_FONT_SIZE,
  LINE_LABEL_GLYPH_CLEARANCE,
  LINE_LABEL_LINE_HEIGHT,
  LINE_LABEL_OFFSET,
  LINE_LABEL_PAD,
  LINE_NAME_ALONG_FRACTION,
  LINE_NAME_FONT_SIZE,
  LINE_NAME_MAX_LINE_FRACTION,
  LINE_NAME_MIN_SCALE,
  LINE_NAME_OFFSET,
  TRANSFORMER_SYMBOL,
  TRANSFORMER3W_SYMBOL
} from './layout-constants';
import { arcMidpoint, pointAtFraction, readableAngle, roomyPointAtFraction, segmentAngleDeg, simplify } from './polyline';
import { resolveLabelCollisions, type LabelCandidate, type TextSlot } from './labelCollisions';
import { resolveFormat, type ElementFormat, type ElementFormatResolver, type FormatContext } from '../theme';
import { feederBoxCenter, layoutSectionBoxes, type BoxSectionsResolver, type SectionBox, type SectionTie } from './sections';

/** Fixed frame for an unresolved child, so it stays selectable and movable. */
export const PLACEHOLDER_FRAME = { width: 360, height: 240 } as const;

/**
 * Compact single-diagram layout used for box-mode children. It hides feeder
 * labels (box mode never shows them), so margins, stems and `externalLabelRoom`
 * shrink and the child frame hugs its connection tips — the box then wraps the
 * bus tightly while lines still anchor to the real, non-overlapping SLD tips.
 */
export const BOX_CHILD_LAYOUT: SldLayoutConfig = {
  ...SLD_LAYOUT,
  margin: 30,
  cellWidth: 74,
  cellHeight: 34,
  cellGapX: 16,
  cellGapY: 16,
  busBarRowHeight: 14,
  busBarThickness: 4,
  busBarOverhang: 10,
  positionBoxWidth: 56,
  positionBoxHeight: 28,
  externalStemLength: 16,
  arrowSize: 6,
  symbolSize: 12,
  externalLabelRoom: 8
};

/** Gap kept between the name label and the frame edge it hugs, in child-local units. */
export const NAME_LABEL_PAD = 6;

/** Name-label font size — larger than element labels, rendered bold, so the
 *  diagram name stands out from the position/bus/connection labels. */
export const NAME_LABEL_FONT_SIZE = 20;

export interface ChildLayout {
  instance: DiagramInstance;
  /** Child-local layout; null when the child is unresolved (placeholder). */
  layout: DiagramLayout | null;
  /** pivot = child layout center. */
  transform: Transform2D;
  /** Child-local frame: { 0, 0, size.width, size.height }. */
  frame: Rect;
  /** AABB of the rotated frame (selection, fit). */
  worldBounds: Rect;
  /** The 4 rotated corners (outline, rotation handle). */
  worldCorners: Point[];
  /**
   * Local flip (0 or 180) applied to every label so it stays aligned with the
   * rotated diagram yet never reads upside-down: 180 when the child sits in the
   * upside-down half turn, 0 otherwise. Labels ride with the child transform,
   * only flipping to be read from the other side. See `labelFlipDeg`.
   */
  labelAngleDeg: number;
  /**
   * Always-on identifying label: the resolved diagram's `meta.name`, or the
   * `libraryId` when unresolved so a placeholder frame stays identifiable.
   */
  name: string;
  /** Resolved geometry of the `name` label — anchor slot, extra rotation, size. */
  nameLabel: NameLabelLayout;
  /**
   * Box view only, when a `boxSections` resolver returned sections: the child's
   * boxes (child-local), side by side inside `frame`. Absent → one box over `frame`.
   */
  boxes?: SectionBox[];
  /** Box view only: muted ties between section boxes (child-local), e.g. an open coupler. */
  ties?: SectionTie[];
  /**
   * Box view only: this child is *expanded* (see `layout(doc, { expanded })`) —
   * drawn with its full detail layout, centred on where its box sits, with its
   * feeders attached at the drawing's tips instead of the box perimeter.
   */
  expanded?: boolean;
}

/** Per-call layout request (view state, not document state). */
export interface CompositeLayoutRequest {
  /**
   * Box view: instance ids to show **expanded** — their full detail drawing,
   * centred on their box, while every other child stays a box. Lets a UI open
   * one substation in place (e.g. to operate its switches). Ignored in detail view.
   */
  expanded?: Iterable<string>;
}

/**
 * Placement of a child's `name` label, in child-local coordinates. Drawn inside
 * the child's transform (so it rides the child's rotation) and additionally
 * rotated by `rotation` about `(x, y)`: the user's quarter-turn `labelDirection`
 * plus a `{0, 180}` readability flip so the text never reads upside-down.
 */
export interface NameLabelLayout {
  x: number;
  y: number;
  /** SVG `text-anchor` for the chosen slot (left→start, center→middle, right→end). */
  textAnchor: 'start' | 'middle' | 'end';
  /** Extra rotation about `(x, y)`, in degrees: `labelDirection` + readability flip. */
  rotation: number;
  fontSize: number;
}

/**
 * Resolve a name label to a placement that stays **inside** the child's frame at
 * any rotation. Slots are semantic to the child's own frame (they ride its
 * rotation); `direction` (quarter turns) plus a `{0, 180}` readability flip give
 * the on-screen rotation. Because the frame and label rotate together, staying
 * inside is a purely local problem: the anchor is pinned to the slot's edge and
 * the `text-anchor` is chosen so the text grows *into* the frame rather than out
 * of the corner. (Very long names may still overflow the far edge, exactly as a
 * horizontal label does today.)
 */
export function resolveNameLabelLayout(
  frame: Rect,
  anchor: LabelAnchor,
  direction: number,
  angleDeg: number
): NameLabelLayout {
  const fontSize = NAME_LABEL_FONT_SIZE;
  const capH = fontSize; // generous cap height incl. padding
  const desc = fontSize * 0.25; // descender / far-side breathing room
  const pad = NAME_LABEL_PAD;
  const ix = NAME_LABEL_PAD + 2; // slightly larger horizontal inset for left/right slots

  const dir = normalizeQuarterTurn(direction);
  const rotation = (dir + labelFlipDeg(angleDeg + dir)) % 360; // 0 | 90 | 180 | 270

  const hpos = anchor.endsWith('left') ? 'left' : anchor.endsWith('right') ? 'right' : 'center';
  const vpos = anchor.startsWith('top') ? 'top' : anchor.startsWith('bottom') ? 'bottom' : 'center';

  // Advance (text flow for anchor `start`) and up (baseline→cap) unit vectors
  // after applying `rotation`, in the child-local axes (y points down).
  const A = ({ 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] } as const)[rotation as 0 | 90 | 180 | 270];
  const U = ({ 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] } as const)[rotation as 0 | 90 | 180 | 270];

  const left = frame.x;
  const right = frame.x + frame.width;
  const topY = frame.y;
  const botY = frame.y + frame.height;
  const midX = (left + right) / 2;
  const midY = (topY + botY) / 2;

  // Pin the anchor along the text's advance axis (grow inward from the slot's
  // edge, or centered when the slot is centered on that axis) and center/inset
  // it along the perpendicular cap axis.
  let x: number;
  let y: number;
  let textAnchor: 'start' | 'middle' | 'end';

  if (A[1] === 0) {
    // Horizontal text: advance along x (pinned by hpos), caps along y (by vpos).
    if (hpos === 'left') {
      textAnchor = A[0] > 0 ? 'start' : 'end';
      x = left + ix;
    } else if (hpos === 'right') {
      textAnchor = A[0] > 0 ? 'end' : 'start';
      x = right - ix;
    } else {
      textAnchor = 'middle';
      x = midX;
    }

    if (vpos === 'top') y = topY + pad + (U[1] < 0 ? capH : desc);
    else if (vpos === 'bottom') y = botY - pad - (U[1] > 0 ? capH : desc);
    else y = midY - (U[1] * capH) / 2;
  } else {
    // Vertical text: advance along y (pinned by vpos), caps along x (by hpos).
    if (vpos === 'top') {
      textAnchor = A[1] > 0 ? 'start' : 'end';
      y = topY + pad;
    } else if (vpos === 'bottom') {
      textAnchor = A[1] > 0 ? 'end' : 'start';
      y = botY - pad;
    } else {
      textAnchor = 'middle';
      y = midY;
    }

    if (hpos === 'left') x = left + ix + (U[0] > 0 ? desc : capH);
    else if (hpos === 'right') x = right - ix - (U[0] > 0 ? capH : desc);
    else x = midX - (U[0] * capH) / 2;
  }

  return { x, y, textAnchor, rotation, fontSize };
}

/**
 * Local label flip keeping text aligned with the diagram axis but never
 * upside-down: 180° when the child's angle falls in the upside-down half
 * `(90, 270)`, else 0°. The label's on-screen orientation is therefore
 * `childAngle + labelAngleDeg`, i.e. always on the diagram's own axis.
 */
export function labelFlipDeg(angleDeg: number): number {
  const a = ((angleDeg % 360) + 360) % 360;
  return a > 90 && a < 270 ? 180 : 0;
}

export interface CompositeLink {
  /** The shared connection id that created the link. */
  connectionId: string;
  a: { instanceId: string; point: Point };
  b: { instanceId: string; point: Point };
  /** Polyline (v1: two points). */
  points: Point[];
  /**
   * Set only for `curved` routing: draw each bend as a circular arc of this
   * radius (pass it to `connectionPath`). `points` stay the sharp polyline.
   */
  cornerRadius?: number;
}

type Ref = { instanceId: string; connectionId: string };

/** Resolve child `Connection`s (with their owning document) from `(instanceId, connectionId)` references. */
function connectionRefs(refs: Ref[], children: ChildLayout[]): { conn: Connection; doc: SldDocument }[] {
  const out: { conn: Connection; doc: SldDocument }[] = [];
  for (const { instanceId, connectionId } of refs) {
    const doc = children.find((c) => c.instance.id === instanceId)?.instance.resolved;
    // A link / anchor id is an external id: a feeder's own id or a three-winding branch id.
    const el = doc ? connectionForExternalId(doc, connectionId) : undefined;
    if (doc && el) out.push({ conn: el, doc });
  }
  return out;
}

/** The external ids a connection exposes: its own id, plus a three-winding branch id. */
function externalIdsOf(conn: Connection): string[] {
  const branch = externalBranch(conn);
  return branch ? [conn.id, branch.id] : [conn.id];
}

/** Resolve child `Connection`s from `(instanceId, connectionId)` references. */
function connectionsFor(refs: Ref[], children: ChildLayout[]): Connection[] {
  return connectionRefs(refs, children).map((r) => r.conn);
}

const linkRefs = (link: CompositeLink): Ref[] => [
  { instanceId: link.a.instanceId, connectionId: link.connectionId },
  { instanceId: link.b.instanceId, connectionId: link.connectionId }
];

const lineRefs = (line: CompositeLine): Ref[] =>
  line.vertices.flatMap((v) => (v.kind === 'anchor' ? [{ instanceId: v.instanceId, connectionId: v.connectionId }] : []));

/** First format {@link resolveFormat} yields across the backing connections (each with its own document). */
function firstResolved(refs: Ref[], children: ChildLayout[], resolve?: ElementFormatResolver | null, theme?: FormatContext['theme']) {
  for (const { conn, doc } of connectionRefs(refs, children)) {
    const fmt = resolveFormat(conn, resolve, { doc, theme });
    if (fmt) return fmt;
  }
  return undefined;
}

/**
 * The format of an **auto-link**: the first of its backing child connections
 * that the consumer's resolver formats — or, failing that, the default
 * open-connection look when either end touches an open position. Shared by the
 * canvas (both adapters) and the exporter, so screen and export agree.
 */
export function linkFormat(
  link: CompositeLink,
  children: ChildLayout[],
  resolve?: ElementFormatResolver | null,
  theme?: FormatContext['theme']
): ElementFormat | undefined {
  return firstResolved(linkRefs(link), children, resolve, theme);
}

/** The format of a box-view **hanging tie**, from its child feeder (see {@link linkFormat}). */
export function hangerFormat(
  hanger: HangingTieLayout,
  children: ChildLayout[],
  resolve?: ElementFormatResolver | null,
  theme?: FormatContext['theme']
): ElementFormat | undefined {
  return firstResolved([{ instanceId: hanger.instanceId, connectionId: hanger.connectionId }], children, resolve, theme);
}

/**
 * Where a renderer draws an auto-link's node dots: every vertex of a sharp link,
 * but only the two ends of a `curved` one — its rounded bends leave the sharp
 * vertices off the drawn line. Shared by both adapters and the exporter.
 */
export function linkNodeDots(link: CompositeLink): Point[] {
  const pts = link.points;
  return link.cornerRadius && pts.length > 2 ? [pts[0], pts[pts.length - 1]] : pts;
}

/** The format of a **manual line**, from the child connections it anchors to (see {@link linkFormat}). */
export function lineFormat(
  line: CompositeLine,
  children: ChildLayout[],
  resolve?: ElementFormatResolver | null,
  theme?: FormatContext['theme']
): ElementFormat | undefined {
  return firstResolved(lineRefs(line), children, resolve, theme);
}

/**
 * The child `Connection`s behind an **auto-link** — both children share the
 * link's `connectionId`. Purely structural (no styling policy): a consumer runs
 * its own `resolveElementFormat` over these (see `firstFormat`) to style the
 * tie-line, so tagging *either* diagram is enough without the core knowing what
 * the tag means.
 */
export function linkConnections(link: CompositeLink, children: ChildLayout[]): Connection[] {
  return connectionsFor(linkRefs(link), children);
}

/**
 * The child `Connection`s a **hand-drawn manual line** anchors to. Its `anchor`
 * vertices reference the same shared `connectionId` (which also suppresses the
 * auto-link). A line with only free `point` vertices returns `[]`.
 */
export function lineConnections(line: CompositeLine, children: ChildLayout[]): Connection[] {
  return connectionsFor(lineRefs(line), children);
}

/** A structural glyph placed on a line: a `SymbolRegistry` key + a placement. */
export interface LineGlyph {
  /** `SymbolRegistry` key, e.g. `external:transformer` / `external:demand`. */
  key: string;
  /** Centre of the glyph box, in world coordinates. */
  at: Point;
  /** Orientation of the local segment the glyph sits on, in degrees. */
  angleDeg: number;
}

export interface CompositeLineLayout {
  line: CompositeLine;
  /**
   * Resolved world polyline. `point` vertices pass through; `anchor` vertices
   * resolve to their child's connection tip. Anchors that can't be resolved are
   * dropped; a line with fewer than two resolvable vertices is omitted entirely.
   */
  points: Point[];
  /** Functional type, mirrored from the line for renderers/exporters. */
  kind: CompositeLineKind;
  /** Structural default dash pattern for the kind (`cable` → dashed); else undefined. */
  dashArray?: string;
  /**
   * The transformer glyph at the polyline's arc-length midpoint — two circles
   * for `kind === 'transformer'`, three for `'transformer3w'`; absent otherwise.
   */
  glyph?: LineGlyph;
  /**
   * The demand triangle at the line's free (non-anchored) end, pointing outward —
   * present only for `kind === 'demand'` with a resolvable free end.
   */
  terminus?: LineGlyph;
  /** Stacked text label beside the line — present only when the `lineLabels` resolver returns rows. */
  label?: LineLabelLayout;
  /** The line's own name (`CompositeLine.name`), placed per its `namePlacement` — present only when named. */
  nameLabel?: LineNameLayout;
  /**
   * Set only when the collision pass moved `label` off its default slot (the
   * arc midpoint, above / right): where it went instead.
   */
  labelSlot?: TextSlot;
  /**
   * Set only when the collision pass moved the name off its stored
   * `namePlacement`: the arc fraction (reading order) and side it went to, and
   * for a callout its `offset` from the line.
   * {@link lineNameLayout} honours it, so a zoom-aware re-placement keeps it.
   */
  nameSlot?: { fraction: number; side: LineNameSide; offset?: number };
  /**
   * Set only for `curved` routing: draw each bend as a circular arc of this
   * radius (pass it to `connectionPath`). `points` stay the sharp polyline, so
   * glyphs, labels and handles sit exactly where they do for `orthogonal`.
   */
  cornerRadius?: number;
}

/**
 * A line's resolved text label: rows of horizontal text (never rotated, like
 * the reference drawings) beside the line's arc-length midpoint — to the right
 * of a vertical run, centred above a horizontal one — plus a backing box.
 * Renderers draw `box` then each row at its baseline; nothing to compute.
 */
export interface LineLabelLayout {
  rows: { text: string; x: number; y: number }[];
  textAnchor: 'start' | 'middle';
  fontSize: number;
  /** Backing box (world), sized from an estimated text width. */
  box: Rect;
  /** Present only for a callout (a label set away from its line): the leader back to it. */
  leader?: TextLeader;
}

/**
 * The leader of a callout: a text the collision pass set away from its line
 * (no clear spot beside it, e.g. a line sandwiched in a tight parallel group).
 * Renderers draw `points` as a thin, subtle stroke and a small dot at `dot`,
 * the point on the text's own line it belongs to.
 */
export interface TextLeader {
  points: Point[];
  dot: Point;
}

/**
 * Consumer hook turning a line into label rows (e.g. `['510/575', '455/370']`
 * formatted from `line.data`). Core never interprets the values — `null`,
 * `undefined` or `[]` means no label ("exceptions are the norm").
 */
export type LineLabelResolver = (line: CompositeLine) => readonly string[] | null | undefined;

/**
 * Place label rows beside a polyline (see {@link LineLabelLayout}): by default
 * at its arc-length midpoint, above a horizontal run or right of a vertical one.
 * `slot` moves it to another `fraction` of the arc length (in point order),
 * the other side (`side: -1`: below / left) and/or out as a callout (`offset`,
 * adding a {@link TextLeader}), as the collision pass does.
 */
export function placeLineLabel(
  points: Point[],
  rows: readonly string[],
  clearance = 0,
  slot: TextSlot = DEFAULT_LABEL_SLOT
): LineLabelLayout | null {
  if (rows.length === 0) return null;
  const mid = slot.fraction === DEFAULT_LABEL_SLOT.fraction ? arcMidpoint(points) : arcPointAt(points, slot.fraction);
  if (!mid) return null;
  const rad = (mid.angleDeg * Math.PI) / 180;
  const horizontal = Math.abs(Math.cos(rad)) >= Math.abs(Math.sin(rad));
  const flipped = slot.side === -1;
  const fontSize = LINE_LABEL_FONT_SIZE;
  const lh = LINE_LABEL_LINE_HEIGHT;
  const width = Math.max(...rows.map((r) => r.length)) * fontSize * 0.6;
  const height = rows.length * lh;
  const offset = slot.offset ?? 0;
  const gap = LINE_LABEL_OFFSET + LINE_LABEL_PAD + clearance + offset;
  // Block top-left (text area, before padding).
  const left = horizontal ? mid.at.x - width / 2 : flipped ? mid.at.x - gap - width : mid.at.x + gap;
  const top = horizontal ? (flipped ? mid.at.y + gap : mid.at.y - gap - height) : mid.at.y - height / 2;
  const x = horizontal ? mid.at.x : left;
  // Baseline of row i: centred in its row pitch (≈0.35em below the row centre).
  const baseline = (i: number) => top + i * lh + lh / 2 + fontSize * 0.35;
  const box = { x: left - LINE_LABEL_PAD, y: top - LINE_LABEL_PAD, width: width + 2 * LINE_LABEL_PAD, height: height + 2 * LINE_LABEL_PAD };
  const label: LineLabelLayout = {
    rows: rows.map((text, i) => ({ text, x, y: baseline(i) })),
    textAnchor: horizontal ? 'middle' : 'start',
    fontSize,
    box
  };
  if (offset > 0) {
    // A callout: a straight leader from the line to the box's near edge.
    const end = horizontal
      ? { x: mid.at.x, y: flipped ? box.y : box.y + box.height }
      : { x: flipped ? box.x + box.width : box.x, y: mid.at.y };
    label.leader = { points: [mid.at, end], dot: mid.at };
  }
  return label;
}

/** A label's default slot: the arc-length midpoint, above / right of the line. */
const DEFAULT_LABEL_SLOT: TextSlot = { fraction: 0.5, side: 1 };

/** Point at `fraction` of the arc length with its segment angle (like `arcMidpoint`). */
function arcPointAt(points: Point[], fraction: number): { at: Point; angleDeg: number } | null {
  const p = pointAtFraction(points, fraction);
  return p ? { at: p.at, angleDeg: (Math.atan2(p.dy, p.dx) * 180) / Math.PI } : null;
}

/**
 * A line's resolved name label. Renderers draw one `<text>` at `(x, y)` (its
 * baseline origin) with `textAnchor`, rotated by `rotation` degrees about
 * `(x, y)` — nothing to compute. `rotation` is always in `[-100, 80)` (see
 * `readableAngle`), so the name reads left→right — bottom→top on a (near-)
 * vertical run — whichever way the line was drawn.
 */
export interface LineNameLayout {
  text: string;
  x: number;
  y: number;
  /** Rotation about `(x, y)`, degrees: 0 for `horizontal`, else along/across the line. */
  rotation: number;
  textAnchor: 'start' | 'middle' | 'end';
  fontSize: number;
  /**
   * The largest size this name may take on its line — where its estimated width
   * reaches {@link LINE_NAME_MAX_LINE_FRACTION} of the line's longest straight
   * run (never below `fontSize`). A zoom-aware renderer grows the name up to it
   * and no further (see {@link readableLineNameSize}).
   */
  maxFontSize: number;
  /** World AABB of the (estimated) rotated text — for bounds/fit, not hit-testing. */
  box: Rect;
  /** Present only for a callout (a name set away from its line): the leader back to it. */
  leader?: TextLeader;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Estimated advance of one character, in ems (no DOM to measure in; errs wide). */
const NAME_CHAR_WIDTH = 0.6;

/**
 * The font size at which `text` is {@link LINE_NAME_MAX_LINE_FRACTION} (or
 * `fraction`) of the polyline's longest straight run — bends are ignored, so a
 * name always fits on one run. `0` for an empty name or a degenerate line.
 */
export function lineNameFitSize(points: Point[], text: string, fraction: number = LINE_NAME_MAX_LINE_FRACTION): number {
  if (!text) return 0;
  let longest = 0;
  for (let i = 1; i < points.length; i++) {
    longest = Math.max(longest, Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return (fraction * longest) / (text.length * NAME_CHAR_WIDTH);
}

/**
 * A line name's layout size: `baseSize`, shrunk so the name never exceeds
 * {@link LINE_NAME_MAX_LINE_FRACTION} of its line's longest straight run, but
 * never below `baseSize × LINE_NAME_MIN_SCALE` — on a very short line the name
 * overhangs rather than becoming unreadable.
 */
export function fittedLineNameSize(points: Point[], text: string, baseSize: number = LINE_NAME_FONT_SIZE): number {
  return Math.max(Math.min(baseSize, lineNameFitSize(points, text)), baseSize * LINE_NAME_MIN_SCALE);
}

/**
 * Place a line's name. Everything is measured in the line's **reading frame** —
 * the polyline walked left→right (bottom→top when vertical), regardless of
 * vertex order — so swapping the two diagrams a line joins re-derives the same
 * visual spot and keeps the text readable:
 *
 *  - `along` picks the point at 20% / 50% / 80% of the arc length in reading order,
 *    slid onto the nearest segment long enough to hold the name (so it never sits
 *    on a short jog of an orthogonal route);
 *  - `side` picks the normal pointing *above* the text read along the local
 *    segment (up on a horizontal run, left on a vertical one) or its opposite;
 *  - `orientation` rotates the text along the segment (`parallel`), across it
 *    (`perpendicular`) or not at all (`horizontal`).
 *
 * The text keeps `LINE_NAME_OFFSET + clearance` between the stroke and its
 * nearest edge (pass `clearance` to clear a glyph at that point). Text width is
 * estimated (no DOM), so a `parallel` name is centred on its point while the
 * other orientations anchor the edge nearest the line, keeping the gap exact.
 *
 * `fontSize` (world units, default {@link LINE_NAME_FONT_SIZE}) scales the name
 * and its gap together, so a larger name keeps the same proportions — what a
 * zoom-aware renderer passes (see {@link readableLineNameSize}). It is used as
 * given; the layout picks it with {@link fittedLineNameSize}.
 */
export function placeLineName(
  points: Point[],
  text: string,
  placement: LineNamePlacement = DEFAULT_LINE_NAME_PLACEMENT,
  clearance = 0,
  fontSize: number = LINE_NAME_FONT_SIZE,
  /** Arc fraction (reading order) overriding `placement.along` — a collision-resolved slot. */
  fraction?: number,
  /** Extra distance from the line for a callout; > 0 adds a {@link TextLeader} back to it. */
  offset = 0
): LineNameLayout | null {
  if (!text || points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const cdx = last.x - first.x;
  const cdy = last.y - first.y;
  // Reading order: left→right; a vertical chord reads bottom→top.
  const reversed = Math.abs(cdx) > 1e-6 ? cdx < 0 : cdy > 0;
  const reading = reversed ? [...points].reverse() : points;

  const w = text.length * fontSize * NAME_CHAR_WIDTH;
  const h = fontSize;
  const lineGap = (LINE_NAME_OFFSET * fontSize) / LINE_NAME_FONT_SIZE;
  // Sit on a segment with room for the name (never on a short orthogonal jog):
  // its full length when it runs along the line, a few gaps' worth otherwise.
  const need = placement.orientation === 'parallel' ? w + 2 * lineGap : 4 * lineGap;
  const at = roomyPointAtFraction(reading, fraction ?? LINE_NAME_ALONG_FRACTION[placement.along], need);
  if (!at) return null;

  const toRad = Math.PI / 180;
  const segDeg = (Math.atan2(at.dy, at.dx) * 180) / Math.PI;
  // "Above" = the up vector of text read along the local segment.
  const along = readableAngle(segDeg) * toRad;
  const above = { x: Math.sin(along), y: -Math.cos(along) };
  const n = placement.side === 'above' ? above : { x: -above.x, y: -above.y };

  const rotation =
    placement.orientation === 'horizontal' ? 0 : placement.orientation === 'perpendicular' ? readableAngle(segDeg + 90) : readableAngle(segDeg);
  const r = rotation * toRad;
  const adv = { x: Math.cos(r), y: Math.sin(r) }; // text advance
  const up = { x: Math.sin(r), y: -Math.cos(r) }; // baseline → cap

  const gap = lineGap + clearance + offset;
  const advN = adv.x * n.x + adv.y * n.y;
  const upN = Math.abs(up.x * n.x + up.y * n.y);

  // Mostly-across-the-line text anchors its near edge at the gap (exact even if
  // the width estimate is off); mostly-along text is centred on its point.
  const centred = Math.abs(advN) < 0.5;
  const reach = gap + (upN * h) / 2 + (centred ? (Math.abs(advN) * w) / 2 : 0);
  const textAnchor: LineNameLayout['textAnchor'] = centred ? 'middle' : advN > 0 ? 'start' : 'end';
  const q = { x: at.at.x + n.x * reach, y: at.at.y + n.y * reach }; // text centre (cap axis) at the anchor
  // Baseline sits ≈0.35em below the glyph centre, along the text's own up axis.
  const x = q.x - up.x * fontSize * 0.35;
  const y = q.y - up.y * fontSize * 0.35;

  // Estimated rotated text rect → world AABB.
  const a0 = textAnchor === 'start' ? 0 : textAnchor === 'end' ? -w : -w / 2;
  const corners = [a0, a0 + w].flatMap((s) =>
    [-h / 2, h / 2].map((u) => ({ x: q.x + adv.x * s + up.x * u, y: q.y + adv.y * s + up.y * u }))
  );
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  const layout: LineNameLayout = {
    text,
    x: round2(x),
    y: round2(y),
    rotation: round2(rotation) || 0,
    textAnchor,
    fontSize,
    maxFontSize: Math.max(fontSize, lineNameFitSize(points, text)),
    box: { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
  };
  if (offset > 0) {
    // A callout: a straight leader from the line to the text's near edge.
    const end = { x: at.at.x + n.x * gap, y: at.at.y + n.y * gap };
    layout.leader = { points: [at.at, end], dot: at.at };
  }
  return layout;
}

/**
 * (Re-)place a laid-out line's name at `fontSize` — exactly what the layout does
 * (same placement, same transformer-glyph clearance), at another size. Lets a
 * renderer resize names with the zoom without re-running the whole layout.
 * Without `fontSize`, the layout size: {@link fittedLineNameSize} of the default
 * {@link LINE_NAME_FONT_SIZE}. `null` when the line has no name.
 */
export function lineNameLayout(line: CompositeLineLayout, fontSize?: number): LineNameLayout | null {
  const { name, namePlacement } = line.line;
  if (!name) return null;
  const stored = namePlacement ?? DEFAULT_LINE_NAME_PLACEMENT;
  // A collision-resolved slot (see `nameSlot`) moves the name off its stored spot.
  const slot = line.nameSlot;
  const placement = slot ? { ...stored, side: slot.side } : stored;
  const atMiddle = slot ? slot.fraction === LINE_NAME_ALONG_FRACTION.middle : placement.along === 'middle';
  const clearance = line.glyph && atMiddle ? LINE_LABEL_GLYPH_CLEARANCE : 0;
  const size = fontSize ?? fittedLineNameSize(line.points, name);
  return placeLineName(line.points, name, placement, clearance, size, slot?.fraction, slot?.offset ?? 0);
}

/**
 * The world size a zoom-aware renderer draws a placed name at: grown so it is at
 * least `minPx` on screen (readable from afar), but never past its line's
 * `maxFontSize` (never wider than {@link LINE_NAME_MAX_LINE_FRACTION} of its
 * line), and never below its layout size (in sync with the drawing up close).
 * Falls back to the layout size when the scale is unknown (e.g. SSR).
 */
export function readableLineNameSize(label: LineNameLayout, pxPerUnit: number, minPx: number): number {
  if (!(pxPerUnit > 0) || !Number.isFinite(pxPerUnit)) return label.fontSize;
  return Math.min(label.maxFontSize, Math.max(label.fontSize, minPx / pxPerUnit));
}

/**
 * A hanging tie's label, just beyond its glyph along the lead: centred above or
 * below a vertical lead, left- or right-aligned past a horizontal one.
 */
function hangingLabel(text: string, end: Point, side: BoxSide): NonNullable<HangingTieLayout['label']> {
  const reach = SLD_LAYOUT.symbolSize / 2 + HANGING_LABEL_GAP;
  const fs = SLD_LAYOUT.labelFontSize;
  if (side === 'up') return { text, at: { x: end.x, y: end.y - reach }, textAnchor: 'middle' };
  if (side === 'down') return { text, at: { x: end.x, y: end.y + reach + fs * 0.8 }, textAnchor: 'middle' };
  if (side === 'right') return { text, at: { x: end.x + reach, y: end.y + fs * 0.35 }, textAnchor: 'start' };
  return { text, at: { x: end.x - reach, y: end.y + fs * 0.35 }, textAnchor: 'end' };
}

/** Estimated extent of a hanging tie's label (no DOM to measure in), for bounds. */
function hangingLabelBox(label: NonNullable<HangingTieLayout['label']>): Rect {
  const fs = SLD_LAYOUT.labelFontSize;
  const width = label.text.length * fs * 0.62;
  const left = label.textAnchor === 'start' ? label.at.x : label.textAnchor === 'end' ? label.at.x - width : label.at.x - width / 2;
  return { x: left, y: label.at.y - fs, width, height: fs * 1.25 };
}

/** Point at the polyline's arc-length midpoint, plus the angle of the segment it lies on. */
function polylineMidpoint(points: Point[], key: string = TRANSFORMER_SYMBOL): LineGlyph | null {
  const mid = arcMidpoint(points);
  return mid ? { key, at: mid.at, angleDeg: mid.angleDeg } : null;
}

/** The mid-line glyph a line kind carries: two circles (`transformer`) or three (`transformer3w`). */
function midGlyphKey(kind: CompositeLineKind): string | null {
  if (kind === 'transformer') return TRANSFORMER_SYMBOL;
  if (kind === 'transformer3w') return TRANSFORMER3W_SYMBOL;
  return null;
}

/** An external connection tip in world coordinates — snap/convert targets for the UI. */
export interface ExternalConnectionTip {
  instanceId: string;
  connectionId: string;
  point: Point;
}

/**
 * Box view: a tie to an asset that ends at a child diagram (see
 * {@link HANGING_ASSETS}) drawn leaving its box — a lead off the feeder's port,
 * the asset glyph at its free end and the feeder label beyond it. Derived from
 * the child's own feeders every layout; nothing is stored in the composite.
 */
export interface HangingTieLayout {
  instanceId: string;
  /** The child's feeder connection id. */
  connectionId: string;
  /** The feeder's asset kind (drives the glyph). */
  asset: string;
  /** The lead, from the box-perimeter port outward. */
  points: Point[];
  /** The asset glyph centred on the lead's free end. */
  terminus: LineGlyph;
  /** The feeder label beyond the glyph; absent when the feeder has none. */
  label?: { text: string; at: Point; textAnchor: 'start' | 'middle' | 'end' };
}

export interface CompositeLayout {
  children: ChildLayout[];
  links: CompositeLink[];
  /** Manually-drawn lines, resolved to world polylines. */
  lines: CompositeLineLayout[];
  /**
   * Box view only: every hanging-asset feeder no line or auto-link takes, drawn
   * leaving its box. Empty in detail view, where each child's own drawing shows
   * its feeders.
   */
  hangers: HangingTieLayout[];
  /** Union of every child's worldBounds, every link point and every line point. */
  bounds: Rect;
  /**
   * The active view's draw-mode snap targets — one per resolvable external
   * feeder. Each sits exactly where a line anchored to that feeder attaches: a
   * box-perimeter point in box mode, the SLD arrow tip in detail mode, on the
   * feeder's effective side (`pin ?? facing ?? authored`). Rebuilt every layout.
   */
  snapTips: ExternalConnectionTip[];
}

/** A resolved floating-line endpoint: a floating port (anchored) or a free point. */
type BoxEnd = { port: Port; point?: undefined } | { port?: undefined; point: Point } | null;

/** An auto-link to draw: a shared external id with its two floating ports. */
interface FloatingLinkPair {
  connectionId: string;
  firstId: string;
  secondId: string;
  pa: Port;
  pb: Port;
}

/** The world point a resolved floating endpoint attaches at (port attach point or free point). */
const floatingEndPoint = (e: NonNullable<BoxEnd>): Point => (e.port ? e.port.point : e.point);

/**
 * Lays out a composite by reusing the existing single-diagram `LayoutEngine`
 * per child, unchanged: each resolved child is laid out in its own local
 * coordinate space exactly as the single-diagram editor would, and the
 * composite merely wraps that geometry in the instance's `Transform2D`.
 */
export interface CompositeLayoutOptions {
  /**
   * Box-view frame size. Defaults to {@link BOX_SIZE} so every box is uniform;
   * `null` keeps the content-derived compact frame (the child's own layout size).
   */
  boxSize?: { width: number; height: number } | null;
  /** Numeric/text labels per line (see {@link LineLabelResolver}); placed by the layout so screen and export agree. */
  lineLabels?: LineLabelResolver;
  /**
   * Split a child into several boxes in box view (see {@link BoxSectionsResolver}),
   * e.g. one per electrically separate bus section. Feeders attach to their own
   * section's box. Ignored in detail view.
   */
  boxSections?: BoxSectionsResolver;
  /** Corner radius of `curved` lines and links (default {@link CURVE_RADIUS}). */
  cornerRadius?: number;
  /**
   * Normal font size of line names (`CompositeLine.name`), world units (default
   * {@link LINE_NAME_FONT_SIZE}) — match it to the labels around the lines. A
   * name shrinks below it only to stay within its line (see
   * {@link fittedLineNameSize}); the export uses the result, and a zoom-aware
   * canvas starts from it (see {@link readableLineNameSize}).
   */
  lineNameFontSize?: number;
}

export class CompositeLayoutEngine {
  private boxChildEngine: LayoutEngine;
  private readonly boxSize: { width: number; height: number } | null;
  private readonly lineLabels?: LineLabelResolver;
  private readonly boxSections?: BoxSectionsResolver;
  private readonly cornerRadius: number;
  private readonly lineNameFontSize: number;
  /** Detail-view child layouts with swapped directions, keyed by `(libraryId, dir signature)`. */
  private detailLayoutCache = new Map<string, DiagramLayout>();

  constructor(
    private childEngine: LayoutEngine = new LayoutEngine(),
    boxChildEngine?: LayoutEngine,
    /** Floating-connector router used for the box view's `orthogonal`/auto lines. */
    private readonly router: OrthogonalRouter = new OrthogonalRouter(),
    options: CompositeLayoutOptions = {}
  ) {
    this.boxChildEngine = boxChildEngine ?? new LayoutEngine(BOX_CHILD_LAYOUT);
    this.boxSize = options.boxSize === undefined ? BOX_SIZE : options.boxSize;
    this.lineLabels = options.lineLabels;
    this.boxSections = options.boxSections;
    this.cornerRadius = options.cornerRadius ?? CURVE_RADIUS;
    this.lineNameFontSize = options.lineNameFontSize ?? LINE_NAME_FONT_SIZE;
  }

  layout(doc: CompositeDocument, request: CompositeLayoutRequest = {}): CompositeLayout {
    const boxMode = doc.meta.boxMode ?? false;
    const defaultRouting = doc.meta.defaultRouting;
    // Box mode lays children out compactly so the box hugs its connection tips.
    const engine = boxMode ? this.boxChildEngine : this.childEngine;
    // Box view can expand some children in place: their detail drawing, centred
    // on the box they replace (so the camera can fly onto the same spot).
    const expanded = new Set(boxMode ? (request.expanded ?? []) : []);
    let children = doc.allChildren().map((instance) => {
      if (expanded.has(instance.id) && instance.resolved) {
        return this.makeChildLayout(instance, this.childEngine.layout(instance.resolved), false, this.boxFrameSize(instance));
      }
      return this.makeChildLayout(instance, instance.resolved ? engine.layout(instance.resolved) : null, boxMode);
    });

    // The floating-connector model (attach-per-view, node-relative leads,
    // orthogonal auto-routing) runs whenever the composite shows boxes OR uses
    // orthogonal (or curved) routing — the box epic. `boxMode` then only selects perimeter
    // (box) vs SLD-tip (detail) attach, so a box composite stays consistent
    // across the box↔detail toggle. Plain composites (straight routing, no box
    // mode) keep the legacy fixed-connector path untouched.
    const floating = boxMode || isOrthogonalRouting(defaultRouting);
    if (floating) {
      const autoFacing = doc.meta.autoFacing ?? false;
      const peerCenterOf = autoFacing ? this.buildPeerCenters(doc, children) : undefined;
      // Detail view renders real child geometry, so a feeder whose effective
      // direction differs from its authored one needs the child *re-laid-out* with
      // that endpoint swapped — physically moving the arrow tip. Box view keeps
      // the rectangle and only re-picks the perimeter side, so it is untouched.
      if (!boxMode) children = this.applyEffectiveDirections(doc, children, engine, autoFacing, peerCenterOf);
      // An expanded child is real detail geometry too: same arrow re-layout.
      else if (expanded.size) children = this.applyEffectiveDirections(doc, children, this.childEngine, autoFacing, peerCenterOf, expanded);
      return this.layoutFloating(doc, children, boxMode, defaultRouting, autoFacing, peerCenterOf);
    }

    const lines = this.resolveLines(doc.allLines(), children, defaultRouting);
    // A manual line for a shared id takes precedence: suppress its auto-link.
    const claimed = new Set<string>();
    for (const l of doc.allLines()) for (const id of l.anchoredConnectionIds()) claimed.add(id);
    const links = this.detectLinks(children, claimed, defaultRouting);
    this.resolveTextCollisions(lines, links, [], children);
    const bounds = this.unionBounds(children, links, lines, []);
    return { children, links, lines, hangers: [], bounds, snapTips: this.externalConnectionTips(children) };
  }

  /**
   * Wrap a child's (possibly null) diagram layout in its instance transform +
   * frame. In box mode a resolved child gets the uniform `boxSize` frame (when
   * set); its compact layout is still kept, since the port resolver reads the
   * feeder tips from it to order same-side slots along the box edge.
   */
  /**
   * `centreOn`: lay the frame out centred on a box of this size at the instance
   * position (an expanded child replacing its box) instead of at its top-left.
   */
  private makeChildLayout(
    instance: DiagramInstance,
    layout: DiagramLayout | null,
    boxMode = false,
    centreOn?: { width: number; height: number }
  ): ChildLayout {
    const size = !layout ? PLACEHOLDER_FRAME : boxMode && this.boxSize ? this.boxSize : layout.size;
    let frame: Rect = { x: 0, y: 0, width: size.width, height: size.height };
    // Box view: a consumer split lays several same-size boxes side by side; the
    // child's frame becomes their union (so selection, drag and bounds still work).
    let boxes: SectionBox[] | undefined;
    let ties: SectionTie[] | undefined;
    const split = boxMode && layout && instance.resolved ? this.boxSections?.(instance) : undefined;
    if (split?.sections.length) {
      const laid = layoutSectionBoxes(split, size);
      ({ boxes, ties, frame } = laid);
    }
    const pivot: Point = { x: frame.width / 2, y: frame.height / 2 };
    // Centring keeps the world centre where the box's was: (x + bw/2, y + bh/2).
    const dx = centreOn ? (centreOn.width - frame.width) / 2 : 0;
    const dy = centreOn ? (centreOn.height - frame.height) / 2 : 0;
    const transform = new Transform2D(instance.x + dx, instance.y + dy, instance.angleDeg, pivot);
    return {
      instance,
      layout,
      transform,
      frame,
      worldBounds: transform.boundsOf(frame),
      worldCorners: transform.applyRect(frame),
      labelAngleDeg: labelFlipDeg(instance.angleDeg),
      name: instance.resolved?.meta.name || instance.libraryId,
      nameLabel: resolveNameLabelLayout(frame, instance.labelAnchor, instance.labelDirection, instance.angleDeg),
      ...(boxes ? { boxes, ties } : {}),
      ...(centreOn ? { expanded: true } : {})
    };
  }

  /** The frame size a child has as a (single) box: the uniform `boxSize`, else its compact layout's. */
  private boxFrameSize(instance: DiagramInstance): { width: number; height: number } {
    if (this.boxSize) return this.boxSize;
    return instance.resolved ? this.boxChildEngine.layout(instance.resolved).size : PLACEHOLDER_FRAME;
  }

  /**
   * Detail-view effective directions: for each child whose feeders' effective
   * exit directions differ from what the child authored, re-lay-out the child
   * from a clone with those endpoint `direction`s swapped — physically moving the
   * arrow tips so the SLD matches the composition (a pin, or the auto-facing
   * side). Children with no effective change keep their original layout (shared,
   * zero cost); the swapped ones are memoised per `(libraryId, direction
   * signature)` so repeated identical instances and repeated drag frames reuse
   * one child layout.
   */
  private applyEffectiveDirections(
    doc: CompositeDocument,
    children: ChildLayout[],
    engine: LayoutEngine,
    autoFacing: boolean,
    peerCenterOf: Map<string, Point> | undefined,
    /** Restrict to these instance ids (box view: just the expanded children). */
    only?: ReadonlySet<string>
  ): ChildLayout[] {
    return children.map((child) => {
      const { instance, layout, worldBounds } = child;
      if (!layout || !instance.resolved) return child;
      if (only && !only.has(instance.id)) return child;

      const childCenter = { x: worldBounds.x + worldBounds.width / 2, y: worldBounds.y + worldBounds.height / 2 };
      const overrides = new Map<string, ExternalDirection>();
      for (const conn of instance.resolved.connections()) {
        if (!(conn instanceof Connection)) continue;
        if (conn.from.kind !== 'external' && conn.to.kind !== 'external') continue;
        const peerCenter = peerCenterOf?.get(feederKey(instance.id, conn.id)) ?? null;
        const facing = autoFacing && peerCenter ? rotateSide(facingSide(childCenter, peerCenter), -instance.angleDeg) : null;
        const effective = instance.effectiveDirection(conn.id, { facing });
        if (effective && effective !== instance.authoredDirection(conn.id)) overrides.set(conn.id, effective);
      }
      if (overrides.size === 0) return child; // no effective change → share the cached layout

      const relaid = this.relaidChildLayout(instance.libraryId, instance.resolved, engine, overrides);
      return this.makeChildLayout(instance, relaid, false, child.expanded ? this.boxFrameSize(instance) : undefined);
    });
  }

  /** Lay out a child with swapped endpoint directions, memoised by `(libraryId, dir signature)`. */
  private relaidChildLayout(
    libraryId: string,
    resolved: SldDocument,
    engine: LayoutEngine,
    overrides: Map<string, ExternalDirection>
  ): DiagramLayout {
    const signature = [...overrides.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, dir]) => `${id}=${dir}`).join(',');
    const key = `${libraryId}\u0000${signature}`;
    const cached = this.detailLayoutCache.get(key);
    if (cached) return cached;

    const clone = Serializer.fromJSON(Serializer.toJSON(resolved));
    for (const conn of clone.connections()) {
      const dir = overrides.get(conn.id);
      if (!dir) continue;
      const ext = conn.from.kind === 'external' ? conn.from : conn.to.kind === 'external' ? conn.to : null;
      if (ext) ext.direction = dir;
    }
    const relaid = engine.layout(clone);
    this.detailLayoutCache.set(key, relaid);
    return relaid;
  }

  /**
   * Floating-connector layout (the box epic, both views): resolve every line/link
   * endpoint to a floating {@link Port} on the active view's frame — box perimeter
   * when `boxMode`, else the SLD arrow tip — and route the bends orthogonally, so
   * the same document lays out cleanly in both views with no stored pixel
   * geometry. `straight` lines still draw their resolved points as-is.
   */
  private layoutFloating(
    doc: CompositeDocument,
    children: ChildLayout[],
    boxMode: boolean,
    defaultRouting: LineRouting | undefined,
    autoFacing: boolean,
    peerCenterOf: Map<string, Point> | undefined
  ): CompositeLayout {
    const resolver = new PortResolver(children, boxMode, { autoFacing, peerCenterOf });
    const routingDefault = defaultRouting ?? 'straight';
    // Every child box is an obstacle the auto router keeps its lines out of.
    const obstacles = this.obstacles(children);

    // A manual line for a shared id takes precedence: suppress its auto-link.
    const claimed = new Set<string>();
    for (const l of doc.allLines()) for (const id of l.anchoredConnectionIds()) claimed.add(id);
    const linkPairs = this.floatingLinkPairs(children, resolver, claimed);

    // Parallel routes joining the same two box sides each get their own lane
    // for the mid-line jog, so they don't overlap (lines and auto-links alike).
    const offsets = this.bundleOffsets(doc, resolver, linkPairs, routingDefault, obstacles);

    const lines: CompositeLineLayout[] = [];
    for (const line of doc.allLines()) {
      const routed = this.routeFloatingLine(line, resolver, line.routing ?? routingDefault, obstacles, offsets.get(`line:${line.id}`) ?? 0);
      if (routed) lines.push(routed);
    }

    // The remaining auto-links go through the same floating router.
    const links = this.routeFloatingLinks(linkPairs, routingDefault, obstacles, offsets);
    const hangers = boxMode ? this.hangingTies(children, resolver, claimed, links) : [];
    this.resolveTextCollisions(lines, links, hangers, children);

    // Snap targets come from the same resolver that attached the lines, so a
    // ring always sits on the line end it would create (view + effective side).
    return {
      children,
      links,
      lines,
      hangers,
      bounds: this.unionBounds(children, links, lines, hangers),
      snapTips: resolver.tips()
    };
  }

  /**
   * Box view: every feeder to an asset that ends at its diagram (a generator, a
   * load, a reactor…) leaves its box as a lead with the asset glyph and the
   * feeder label — generic for any hanging asset, so a consumer no longer adds a
   * `demand` line per load. A feeder a manual line anchors (`claimed`) or an
   * auto-link joins keeps that line; an expanded child draws its own feeders.
   */
  private hangingTies(
    children: ChildLayout[],
    resolver: PortResolver,
    claimed: Set<string>,
    links: CompositeLink[]
  ): HangingTieLayout[] {
    const linked = new Set(
      links.flatMap((l) => [feederKey(l.a.instanceId, l.connectionId), feederKey(l.b.instanceId, l.connectionId)])
    );
    const out: HangingTieLayout[] = [];
    for (const child of children) {
      const { instance } = child;
      if (!child.layout || !instance.resolved || child.expanded) continue;
      for (const conn of instance.resolved.connections()) {
        const ext = conn.to.kind === 'external' ? conn.to : conn.from.kind === 'external' ? conn.from : null;
        if (!ext || !HANGING_ASSETS.includes(ext.asset)) continue;
        if (claimed.has(conn.id) || linked.has(feederKey(instance.id, conn.id))) continue;
        const port = resolver.resolve(instance.id, conn.id);
        if (!port) continue;
        const points = this.router.lead(port, DEMAND_LEAD_LENGTH);
        const end = points[points.length - 1];
        out.push({
          instanceId: instance.id,
          connectionId: conn.id,
          asset: ext.asset,
          points,
          terminus: { key: `external:${ext.asset}`, at: end, angleDeg: segmentAngleDeg(points[0], end) },
          ...(ext.label ? { label: hangingLabel(ext.label, end, port.side) } : {})
        });
      }
    }
    return out;
  }

  /**
   * World rects the auto router routes around: each child's box (each section
   * box when split), its detail or expanded frame, or its placeholder frame.
   * A line's own diagrams stay obstacles too: a detail-view port carries its
   * frame (`Port.owner`) and the router leaves it with a straight escape stem.
   */
  private obstacles(children: ChildLayout[]): Rect[] {
    return children.flatMap((c) =>
      c.boxes?.length ? c.boxes.map((b) => c.transform.boundsOf(b.frame)) : [c.worldBounds]
    );
  }

  /** The routed line's `cornerRadius` field: only for `curved`. */
  private corner(routing: LineRouting): { cornerRadius?: number } {
    return routing === 'curved' && this.cornerRadius > 0 ? { cornerRadius: this.cornerRadius } : {};
  }

  /**
   * For auto-facing: map each anchored feeder to its peer child's world centre —
   * the other end of its line, or the far side of its auto-link. Feeders with no
   * peer (a demand's lead, an unresolved end) are absent, so they fall back to
   * their authored direction. Rebuilt every layout from live centres, so a drag
   * re-derives facing for free.
   */
  private buildPeerCenters(doc: CompositeDocument, children: ChildLayout[]): Map<string, Point> {
    const byId = new Map(children.map((c) => [c.instance.id, c]));
    // A feeder's centre is its own box's — the section box when the child is
    // split — so each section faces its own peer.
    const centerOf = (instanceId: string, connectionId: string): Point | undefined => {
      const c = byId.get(instanceId);
      return c ? feederBoxCenter(c, connectionId) : undefined;
    };

    const out = new Map<string, Point>();
    const pair = (ia: string, ca: string, ib: string, cb: string) => {
      const pa = centerOf(ia, ca);
      const pb = centerOf(ib, cb);
      if (!pa || !pb || ia === ib) return;
      out.set(feederKey(ia, ca), pb);
      out.set(feederKey(ib, cb), pa);
    };

    // Explicit lines: the two ends the router joins are the first and last anchor.
    for (const line of doc.allLines()) {
      const anchors = line.vertices.filter((v): v is Extract<LineVertexJson, { kind: 'anchor' }> => v.kind === 'anchor');
      if (anchors.length < 2) continue;
      const a = anchors[0];
      const b = anchors[anchors.length - 1];
      pair(a.instanceId, a.connectionId, b.instanceId, b.connectionId);
    }

    // Auto-links: the same shared external id on two children (unclaimed by a line).
    const claimed = new Set<string>();
    for (const l of doc.allLines()) for (const id of l.anchoredConnectionIds()) claimed.add(id);
    const byConn = new Map<string, string[]>();
    for (const child of children) {
      const { layout, instance } = child;
      if (!layout || !instance.resolved) continue;
      for (const conn of instance.resolved.connections()) {
        if (claimed.has(conn.id)) continue;
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        if (!this.externalTip(child, conn.id)) continue;
        const arr = byConn.get(conn.id) ?? [];
        arr.push(instance.id);
        byConn.set(conn.id, arr);
      }
    }
    for (const [connectionId, insts] of byConn) {
      if (insts.length >= 2) pair(insts[0], connectionId, insts[1], connectionId);
    }
    return out;
  }

  /** Resolve one line's endpoints to floating ports and route its polyline. */
  private routeFloatingLine(
    line: CompositeLine,
    resolver: PortResolver,
    routing: LineRouting,
    obstacles: Rect[],
    laneOffset = 0
  ): CompositeLineLayout | null {
    const ends = line.vertices.map((v) => this.resolveFloatingEnd(v, resolver));
    const first = ends[0];
    const last = ends[ends.length - 1];

    // A demand's free end is a node-relative lead: recomputed off its feeder's
    // port every layout, so it stays attached and vertical in both views — it is
    // never the stored coordinate (that's the view-specific hack this replaces).
    if (line.kind === 'demand') {
      const anchored = first?.port ? first : last?.port ? last : null;
      if (!anchored?.port) return null;
      return this.decorateFloatingLine(line, this.router.lead(anchored.port, DEMAND_LEAD_LENGTH));
    }

    // Non-orthogonal styles draw every resolved vertex as-is (ports at their
    // attach point), preserving intermediate free `point` bends. The auto router
    // is used only for `orthogonal`/`curved`, where it ignores intermediate bends
    // and routes between the two floating ends (perpendicular stubs + L/Z join,
    // detouring around child boxes in the way).
    if (!isOrthogonalRouting(routing)) {
      const pts = ends.flatMap((e) => (e ? [floatingEndPoint(e)] : []));
      return pts.length >= 2 ? this.decorateFloatingLine(line, simplify(pts)) : null;
    }

    let points: Point[] | null = null;
    if (first?.port && last?.port) {
      points = this.router.route(first.port, last.port, obstacles, { laneOffset });
    } else if (first?.port && last?.point) {
      points = this.router.toPoint(first.port, last.point, obstacles);
    } else if (first?.point && last?.port) {
      points = this.router.toPoint(last.port, first.point, obstacles);
    } else {
      // No floating end: draw the resolved free points straight (manual polyline).
      const raw = ends.flatMap((e) => (e?.point ? [e.point] : []));
      points = raw.length >= 2 ? simplify(raw) : null;
    }

    return points ? { ...this.decorateFloatingLine(line, points), ...this.corner(routing) } : null;
  }

  private resolveFloatingEnd(v: CompositeLine['vertices'][number], resolver: PortResolver): BoxEnd {
    if (v.kind === 'anchor') {
      const port = resolver.resolve(v.instanceId, v.connectionId);
      return port ? { port } : null;
    }
    if (v.kind === 'point') return { point: { x: v.x, y: v.y } };
    return null; // `rel` bends aren't used by the auto router (phase 1)
  }

  /** Attach the kind's stroke/glyph presentation to a routed floating-line polyline. */
  private decorateFloatingLine(line: CompositeLine, points: Point[]): CompositeLineLayout {
    const layout: CompositeLineLayout = { line, points, kind: line.kind };

    if (line.kind === 'cable') layout.dashArray = CABLE_DASH_ARRAY;

    const midKey = midGlyphKey(line.kind);
    if (midKey) {
      const mid = arcMidpoint(points);
      if (mid) layout.glyph = { key: midKey, at: mid.at, angleDeg: mid.angleDeg };
    }

    // The lead always emits `[feeder, freeEnd]`, so the triangle sits on the last
    // point outward — independent of vertex order.
    if (line.kind === 'demand' && points.length >= 2) {
      const b = points[points.length - 1];
      const a = points[points.length - 2];
      layout.terminus = { key: DEMAND_SYMBOL, at: b, angleDeg: segmentAngleDeg(a, b) };
    }

    return this.withName(this.withLabel(layout));
  }

  /** Attach the consumer's label rows (if any), clearing the transformer glyph. */
  private withLabel(layout: CompositeLineLayout): CompositeLineLayout {
    const rows = this.lineLabels?.(layout.line);
    if (!rows?.length) return layout;
    const label = placeLineLabel(layout.points, rows, layout.glyph ? LINE_LABEL_GLYPH_CLEARANCE : 0);
    if (label) layout.label = label;
    return layout;
  }

  /** Attach the line's own name (if any), clearing the transformer glyph when it sits at the midpoint. */
  private withName(layout: CompositeLineLayout): CompositeLineLayout {
    const name = layout.line.name;
    if (!name) return layout;
    const nameLabel = lineNameLayout(layout, fittedLineNameSize(layout.points, name, this.lineNameFontSize));
    if (nameLabel) layout.nameLabel = nameLabel;
    return layout;
  }

  /**
   * Floating auto-links: same shared-id detection as {@link detectLinks}, but
   * each end resolves to a floating {@link Port} and the tie routes through the
   * orthogonal router (matching the floating lines) when the default routing is
   * `orthogonal`, instead of a straight tip chord.
   */
  /**
   * The auto-links to draw: each shared external id found on two children
   * (claimed ids excepted), with both floating ports resolved.
   */
  private floatingLinkPairs(children: ChildLayout[], resolver: PortResolver, suppressed: Set<string>): FloatingLinkPair[] {
    const index = new Map<string, string[]>();
    for (const child of children) {
      const { layout, instance } = child;
      if (!layout || !instance.resolved) continue;
      for (const conn of instance.resolved.connections()) {
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        for (const id of externalIdsOf(conn)) {
          if (suppressed.has(id)) continue;
          if (!resolver.resolve(instance.id, id)) continue;
          const ends = index.get(id) ?? [];
          ends.push(instance.id);
          index.set(id, ends);
        }
      }
    }

    const pairs: FloatingLinkPair[] = [];
    for (const [connectionId, ends] of index) {
      if (ends.length < 2) continue;
      const [firstId, secondId] = ends;
      const pa = resolver.resolve(firstId, connectionId);
      const pb = resolver.resolve(secondId, connectionId);
      if (pa && pb) pairs.push({ connectionId, firstId, secondId, pa, pb });
    }
    return pairs;
  }

  /** Route the auto-links, each in its bundle lane (see {@link bundleOffsets}). */
  private routeFloatingLinks(
    pairs: FloatingLinkPair[],
    routingDefault: LineRouting,
    obstacles: Rect[],
    offsets: Map<string, number>
  ): CompositeLink[] {
    const orthogonal = isOrthogonalRouting(routingDefault);
    return pairs.map(({ connectionId, firstId, secondId, pa, pb }) => ({
      connectionId,
      a: { instanceId: firstId, point: pa.point },
      b: { instanceId: secondId, point: pb.point },
      points: orthogonal
        ? this.router.route(pa, pb, obstacles, { laneOffset: offsets.get(`link:${connectionId}`) ?? 0 })
        : simplify([pa.point, pb.point]),
      ...this.corner(routingDefault)
    }));
  }

  /**
   * Lane offsets for every orthogonally routed line and auto-link with a
   * floating port at both ends, keyed `line:<id>` / `link:<connectionId>`.
   * Routes alone on their pair of box sides get none (they route as before).
   */
  private bundleOffsets(
    doc: CompositeDocument,
    resolver: PortResolver,
    linkPairs: FloatingLinkPair[],
    routingDefault: LineRouting,
    obstacles: Rect[]
  ): Map<string, number> {
    const members: BundleMember[] = [];
    for (const line of doc.allLines()) {
      if (line.kind === 'demand' || !isOrthogonalRouting(line.routing ?? routingDefault)) continue;
      const first = line.vertices[0];
      const last = line.vertices[line.vertices.length - 1];
      if (first?.kind !== 'anchor' || last?.kind !== 'anchor') continue;
      const a = resolver.resolve(first.instanceId, first.connectionId);
      const b = resolver.resolve(last.instanceId, last.connectionId);
      if (!a || !b) continue;
      members.push({ key: `line:${line.id}`, a, b, aEnd: sideKey(first.instanceId, a), bEnd: sideKey(last.instanceId, b) });
    }
    if (isOrthogonalRouting(routingDefault)) {
      for (const p of linkPairs) {
        members.push({
          key: `link:${p.connectionId}`,
          a: p.pa,
          b: p.pb,
          aEnd: sideKey(p.firstId, p.pa),
          bEnd: sideKey(p.secondId, p.pb)
        });
      }
    }
    return laneOffsets(members, (m, off) => this.router.preview(m.a, m.b, obstacles, off));
  }


  /**
   * World position of a child's external connection tip (the arrowhead `at`),
   * or null when the connection is absent, not external, or has no arrow. Shared
   * by auto-link detection and manual-line anchor resolution, so an anchored
   * line end lands exactly where the auto-link would.
   */
  private externalTip(child: ChildLayout, connectionId: string): Point | null {
    const { layout, instance, transform } = child;
    if (!layout || !instance.resolved) return null;
    const el = connectionForExternalId(instance.resolved, connectionId);
    if (!el) return null;
    const isExternal = el.from.kind === 'external' || el.to.kind === 'external';
    if (!isExternal) return null;
    const geo = layout.geometry.get(el.id);
    if (geo?.kind !== 'connection') return null;
    // A branch id resolves to the third winding's arrow tip, not the feeder's.
    if (el.id !== connectionId) return geo.branch ? transform.apply(geo.branch.arrow.at) : null;
    if (!geo.arrow) return null;
    return transform.apply(geo.arrow.at);
  }

  /** Resolve every manual line's vertices to a world polyline (see `CompositeLineLayout`). */
  private resolveLines(
    lines: CompositeLine[],
    children: ChildLayout[],
    defaultRouting: LineRouting | undefined
  ): CompositeLineLayout[] {
    const byId = new Map(children.map((c) => [c.instance.id, c]));
    const out: CompositeLineLayout[] = [];
    for (const line of lines) {
      // First pass: resolve every anchor to its world tip. This also fixes the
      // chord frame that `rel` bends live in — the segment between the line's
      // first and last resolvable anchor, rebuilt each layout so the bends
      // follow the endpoints under any move, rotation or config change.
      const anchorTips = new Map<number, Point>();
      let firstAnchor: Point | null = null;
      let lastAnchor: Point | null = null;
      line.vertices.forEach((v, i) => {
        if (v.kind !== 'anchor') return;
        const child = byId.get(v.instanceId);
        const tip = child ? this.externalTip(child, v.connectionId) : null;
        if (!tip) return;
        anchorTips.set(i, tip);
        if (!firstAnchor) firstAnchor = tip;
        lastAnchor = tip;
      });
      const frame = firstAnchor && lastAnchor ? chordFrame(firstAnchor, lastAnchor) : null;

      // Second pass: emit the world polyline in vertex order. `rel` bends without
      // a frame (fewer than two resolvable anchors) are dropped, mirroring how an
      // unresolvable anchor is dropped.
      const points: Point[] = [];
      line.vertices.forEach((v, i) => {
        if (v.kind === 'point') {
          points.push({ x: v.x, y: v.y });
        } else if (v.kind === 'rel') {
          if (frame) points.push(frame.toWorld({ t: v.t, ox: v.ox, oy: v.oy }));
        } else {
          const tip = anchorTips.get(i);
          if (tip) points.push(tip);
        }
      });
      if (points.length >= 2) {
        // Apply the drawing style (per-line, else the composite default) to the
        // resolved world path before decorating, so glyphs sit on the drawn line.
        const routing = line.routing ?? defaultRouting ?? 'straight';
        out.push({ ...this.decorateLine(line, routePolyline(points, routing)), ...this.corner(routing) });
      }
    }
    return out;
  }

  /**
   * Attach the kind-driven presentation to a resolved polyline: the cable dash
   * default, the transformer glyph at the arc-length midpoint, and the demand
   * triangle at the line's free (non-anchored) end pointing outward.
   */
  private decorateLine(line: CompositeLine, points: Point[]): CompositeLineLayout {
    const layout: CompositeLineLayout = { line, points, kind: line.kind };

    if (line.kind === 'cable') layout.dashArray = CABLE_DASH_ARRAY;

    const midKey = midGlyphKey(line.kind);
    if (midKey) {
      const glyph = polylineMidpoint(points, midKey);
      if (glyph) layout.glyph = glyph;
    }

    if (line.kind === 'demand') {
      const n = line.vertices.length;
      const lastFree = n > 0 && line.vertices[n - 1].kind !== 'anchor';
      const firstFree = n > 0 && line.vertices[0].kind !== 'anchor';
      if (lastFree) {
        const b = points[points.length - 1];
        const a = points[points.length - 2];
        layout.terminus = { key: DEMAND_SYMBOL, at: b, angleDeg: segmentAngleDeg(a, b) };
      } else if (firstFree) {
        const b = points[0];
        const a = points[1];
        layout.terminus = { key: DEMAND_SYMBOL, at: b, angleDeg: segmentAngleDeg(a, b) };
      }
    }

    return this.withName(this.withLabel(layout));
  }

  /** Every child's external connection tips in world coordinates — the legacy (fixed-connector) snap targets. */
  private externalConnectionTips(children: ChildLayout[]): ExternalConnectionTip[] {
    const tips: ExternalConnectionTip[] = [];
    for (const child of children) {
      const { layout, instance } = child;
      if (!layout || !instance.resolved) continue;
      for (const conn of instance.resolved.connections()) {
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        for (const id of externalIdsOf(conn)) {
          const point = this.externalTip(child, id);
          if (point) tips.push({ instanceId: instance.id, connectionId: id, point });
        }
      }
    }
    return tips;
  }

  /**
   * Two external connections in different children that carry the same id are
   * the same physical asset — link them. Only external endpoints participate;
   * each child contributes at most one endpoint per id (the serializer rejects
   * duplicate ids within a document), so two ends always come from distinct
   * instances. When more than two children share an id, the first two (in
   * insertion order) link, the rest are skipped (documented v1 limitation).
   */
  private detectLinks(
    children: ChildLayout[],
    suppressed: Set<string> = new Set(),
    defaultRouting?: LineRouting
  ): CompositeLink[] {
    const index = new Map<string, { instanceId: string; tip: Point }[]>();

    for (const child of children) {
      const { layout, instance } = child;
      if (!layout || !instance.resolved) continue;
      for (const conn of instance.resolved.connections()) {
        const isExternal = conn.from.kind === 'external' || conn.to.kind === 'external';
        if (!isExternal) continue;
        for (const id of externalIdsOf(conn)) {
          if (suppressed.has(id)) continue;
          const tip = this.externalTip(child, id);
          if (!tip) continue;
          const ends = index.get(id) ?? [];
          ends.push({ instanceId: instance.id, tip });
          index.set(id, ends);
        }
      }
    }

    const links: CompositeLink[] = [];
    for (const [connectionId, ends] of index) {
      if (ends.length < 2) continue;
      const [first, second] = ends;
      // Auto-links have no per-line override, so they follow the composite default.
      const routing = defaultRouting ?? 'straight';
      const points = routePolyline([first.tip, second.tip], routing);
      links.push({
        connectionId,
        a: { instanceId: first.instanceId, point: first.tip },
        b: { instanceId: second.instanceId, point: second.tip },
        points,
        ...this.corner(routing)
      });
    }
    return links;
  }

  /**
   * Keep line texts readable: move each numeric label and name whose default
   * slot overlaps another text, a line, a glyph or a child box to the cheapest
   * clear slot along its line (see `labelCollisions.ts`). Runs after every line
   * is placed, in document order; a text with a clear default slot is untouched.
   */
  private resolveTextCollisions(
    lines: CompositeLineLayout[],
    links: CompositeLink[],
    hangers: HangingTieLayout[],
    children: ChildLayout[]
  ): void {
    const glyphBox = (g: LineGlyph): Rect => {
      const r = LINE_LABEL_GLYPH_CLEARANCE;
      return { x: g.at.x - r, y: g.at.y - r, width: 2 * r, height: 2 * r };
    };
    const rects: Rect[] = [];
    for (const child of children) {
      if (child.boxes?.length) {
        for (const box of child.boxes) {
          const corners = child.transform.applyRect(box.frame);
          const xs = corners.map((c) => c.x);
          const ys = corners.map((c) => c.y);
          rects.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
        }
      } else rects.push(child.worldBounds);
    }
    for (const l of lines) for (const g of [l.glyph, l.terminus]) if (g) rects.push(glyphBox(g));
    for (const h of hangers) rects.push(glyphBox(h.terminus));
    const polylines = [...lines.map((l) => l.points), ...links.map((l) => l.points), ...hangers.map((h) => h.points)];

    const texts: LabelCandidate[] = [];
    for (const layout of lines) {
      const label = layout.label;
      if (label) {
        const rows = label.rows.map((r) => r.text);
        const clearance = (slot: TextSlot) => (layout.glyph && slot.fraction === 0.5 ? LINE_LABEL_GLYPH_CLEARANCE : 0);
        const place = (slot: TextSlot) => placeLineLabel(layout.points, rows, clearance(slot), slot);
        texts.push({
          slot: { fraction: 0.5, side: 1 },
          place: (slot) => place(slot),
          apply: (slot) => {
            const moved = place(slot);
            if (!moved) return;
            layout.label = moved;
            layout.labelSlot = slot;
          }
        });
      }
      const name = layout.nameLabel;
      if (name) {
        const stored = layout.line.namePlacement ?? DEFAULT_LINE_NAME_PLACEMENT;
        const sideOf = (slot: TextSlot): LineNameSide =>
          slot.side === 1 ? stored.side : stored.side === 'above' ? 'below' : 'above';
        const place = (slot: TextSlot) => {
          const glyph = layout.glyph && slot.fraction === LINE_NAME_ALONG_FRACTION.middle ? LINE_LABEL_GLYPH_CLEARANCE : 0;
          return placeLineName(layout.points, name.text, { ...stored, side: sideOf(slot) }, glyph, name.fontSize, slot.fraction, slot.offset ?? 0);
        };
        texts.push({
          slot: { fraction: LINE_NAME_ALONG_FRACTION[stored.along], side: 1 },
          place: (slot) => place(slot),
          apply: (slot) => {
            layout.nameSlot = { fraction: slot.fraction, side: sideOf(slot), ...(slot.offset ? { offset: slot.offset } : {}) };
            const moved = lineNameLayout(layout, name.fontSize);
            if (moved) layout.nameLabel = moved;
          }
        });
      }
    }
    resolveLabelCollisions(texts, { polylines, rects });
  }

  private unionBounds(
    children: ChildLayout[],
    links: CompositeLink[],
    lines: CompositeLineLayout[],
    hangers: HangingTieLayout[]
  ): Rect {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const extend = (p: Point) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    };
    for (const child of children) {
      const b = child.worldBounds;
      extend({ x: b.x, y: b.y });
      extend({ x: b.x + b.width, y: b.y + b.height });
    }
    for (const link of links) for (const p of link.points) extend(p);
    for (const line of lines) {
      for (const p of line.points) extend(p);
      for (const b of [line.label?.box, line.nameLabel?.box]) {
        if (!b) continue;
        extend({ x: b.x, y: b.y });
        extend({ x: b.x + b.width, y: b.y + b.height });
      }
    }
    for (const h of hangers) {
      for (const p of h.points) extend(p);
      if (h.label) {
        const b = hangingLabelBox(h.label);
        extend({ x: b.x, y: b.y });
        extend({ x: b.x + b.width, y: b.y + b.height });
      }
    }

    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}
