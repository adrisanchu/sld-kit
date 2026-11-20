import type { Cell, ElementId, Endpoint, ExternalDirection } from '../types';
import { SLD_LAYOUT, type SldLayoutConfig } from '../layout';
import type { Point, Rect } from './geometry';
import { SldDocument } from '../SldDocument';
import { BusBar } from '../elements/BusBar';
import { Position } from '../elements/Position';
import { Connection } from '../elements/Connection';
import { detectCrossings } from './crossings';
import { TRANSFORMER3W_BRANCH_ANCHOR } from '../symbols/defaults';

export interface BusBarGeometry {
  kind: 'busbar';
  rect: Rect;
  /** Label baseline anchor point. */
  labelAt: Point;
  /** Resolved label text (`bar.label` unless a `busBarLabel` resolver overrides it); `''` = none. */
  label: string;
  /** SVG text anchor at `labelAt`: `start` for `top-left`, `end` for `center-left`. */
  textAnchor: 'start' | 'end';
}

/**
 * Consumer hook for the text a bus bar shows (e.g. a bus number from its
 * `data`). Return `null`/`undefined` to keep the bar's own `label`, `''` to hide it.
 */
export type BusBarLabelResolver = (bar: BusBar, doc: SldDocument) => string | null | undefined;

export interface LayoutEngineOptions {
  /** Override each bar's label text; resolved in the layout so the view and the export agree. */
  busBarLabel?: BusBarLabelResolver;
}

/** Gap between a `center-left` bar label and the bar's start. */
const BAR_LABEL_GAP = 8;

/** Estimated rendered width of a bar label (bold-ish sans; no DOM to measure in). */
const barLabelWidth = (text: string, fontSize: number) => text.length * fontSize * 0.62;
/** Clearance kept between an estimated label edge and the canvas edge. */
const LABEL_EDGE_PAD = 6;

/**
 * Far-edge side-exit lanes (stacked in an outer bay's outer gap): clearance
 * past the outermost lane before a crossing stem's glyph or arrowhead, as a
 * fraction of `barTapOffset` (clears the lane's hop arc); the gap between a
 * glyph and its arrowhead; and the minimum room kept between a lane and the
 * canvas edge.
 */
const LANE_CLEARANCE_RATIO = 0.75;
const LANE_SYMBOL_GAP = 4;
const LANE_EDGE_PAD = 8;

/** Pre-pixel decisions for one external exit (see `exitPlan`). */
interface ExitPlan {
  pos: Position;
  ext: Extract<Endpoint, { kind: 'external' }>;
  dir: ExternalDirection;
  tap: 'above' | 'below';
  /** Row boundary (gap index, 0..rows) the tap sits in. */
  boundary: number;
  /** A through-connection sits on the tap side (junction-dot routing). */
  through: boolean;
}

/** Side-exit lane ranks, plus the outermost far-edge lane rank per row boundary. */
interface GapExitRanks {
  ranks: Map<ElementId, number>;
  farLanes: Map<number, number>;
}

export interface PositionGeometry {
  kind: 'position';
  rect: Rect;
  cell: Cell;
}

export interface ConnectionGeometry {
  kind: 'connection';
  /** Orthogonal polyline, ordered from `from` to `to`. */
  points: Point[];
  /** Arrowhead for external endpoints (tip at `at`, pointing `angle` deg). */
  arrow?: { at: Point; angle: number };
  /** Asset glyph box for non-line external endpoints (SymbolRegistry key). */
  symbol?: { key: string; box: Rect };
  labelAt?: { at: Point; anchor: 'start' | 'middle' | 'end' };
  /** Virtual-node junction dot: the 3-way tap where an external meets a bay. */
  dot?: Point;
  /**
   * A three-winding transformer's third winding: a stub off the glyph with its
   * own arrowhead and label (the endpoint's `branch`). Perpendicular to the
   * feeder: rightward for up/down feeders, downward for left/right ones.
   */
  branch?: { points: Point[]; arrow: { at: Point; angle: number }; labelAt: { at: Point; anchor: 'start' | 'middle' | 'end' } };
  /**
   * Crossing points on this connection's horizontal segments where a hop arc
   * should be drawn. Populated by `detectCrossings` after layout. Sorted by x.
   * `undefined` means no crossings were detected.
   */
  hops?: Point[];
}

export type ElementGeometry = BusBarGeometry | PositionGeometry | ConnectionGeometry;

export interface DiagramLayout {
  size: { width: number; height: number };
  rows: number;
  cols: number;
  rowKind(row: number): 'busbar' | 'slots';
  /** Pixel rect of a slot (used by the grid overlay and drag ghost). */
  cellRect(cell: Cell): Rect;
  /** Inverse mapping for drag snapping. Generous: includes half the gap. */
  cellAt(p: Point): Cell | null;
  /** Y of the boundary line above row index (0..rows), for bar insertion. */
  rowBoundaryY(at: number): number;
  geometry: Map<ElementId, ElementGeometry>;
}

/**
 * Maps matrix slots to pixels. Pure function of (document, config): the
 * layout carries no state, so a renderer just recomputes it on every
 * document change and the exporter reuses the exact same geometry.
 */
export class LayoutEngine {
  constructor(
    private cfg: SldLayoutConfig = SLD_LAYOUT,
    private options: LayoutEngineOptions = {}
  ) {}

  layout(doc: SldDocument): DiagramLayout {
    const cfg = this.cfg;
    const { rows, cols } = doc.grid;
    const barRows = new Set(doc.busBars().map((b) => b.row));

    const sortedBarRows = [...barRows].sort((a, b) => a - b);

    // Lane-stacking ranks for horizontal side exits, keyed by row boundary.
    // Side exits that leave an outer bay's far edge stack outward into the
    // margin; the canvas grows just enough to keep them (and the outer bays'
    // lengthened up/down stems) on it. Diagrams without such exits are unchanged.
    const exitRanks = this.computeGapExitRanks(doc, sortedBarRows);
    const topGrowth = this.outerLaneGrowth(doc, sortedBarRows, exitRanks, 'top');
    const bottomGrowth = this.outerLaneGrowth(doc, sortedBarRows, exitRanks, 'bottom');

    // Row tops via prefix sum: bar rows are shorter than slot rows.
    const rowHeights: number[] = [];
    const rowTops: number[] = [];
    let y = cfg.margin + topGrowth;
    for (let r = 0; r < rows; r++) {
      rowTops.push(y);
      const h = barRows.has(r) ? cfg.busBarRowHeight : cfg.cellHeight;
      rowHeights.push(h);
      y += h + cfg.cellGapY;
    }
    const innerHeight = rows > 0 ? y - cfg.cellGapY - cfg.margin - topGrowth : 0;
    const innerWidth = cols > 0 ? cols * cfg.cellWidth + (cols - 1) * cfg.cellGapX : 0;

    // Pre-scan connections for horizontal exits to determine canvas padding.
    let hasLeftExit = false;
    let hasRightExit = false;
    for (const conn of doc.connections()) {
      const ext = conn.from.kind === 'external' ? conn.from : conn.to.kind === 'external' ? conn.to : null;
      if (!ext) continue;
      if (ext.direction === 'left') hasLeftExit = true;
      if (ext.direction === 'right') hasRightExit = true;
    }
    // Extra space needed for a horizontal exit: beyond the bar overhang,
    // across the stem, past the arrowhead, plus room for the label text.
    const labelRoom = cfg.externalLabelRoom;
    const exitShift = hasLeftExit
      ? Math.max(0, labelRoom + cfg.busBarOverhang + cfg.externalStemLength - cfg.margin)
      : 0;
    const extraRight = hasRightExit
      ? Math.max(0, labelRoom + cfg.busBarOverhang + cfg.externalStemLength + cfg.arrowSize - cfg.margin)
      : 0;
    // Resolved bar labels; with `center-left` the margin grows to fit the longest.
    const barLabels = new Map<ElementId, string>();
    for (const bar of doc.busBars()) barLabels.set(bar.id, this.options.busBarLabel?.(bar, doc) ?? bar.label);
    const labelLeft = cfg.busBarLabelAnchor === 'center-left';
    const longestLabel = labelLeft ? Math.max(0, ...[...barLabels.values()].map((t) => barLabelWidth(t, cfg.busLabelFontSize))) : 0;
    const labelShift = longestLabel > 0 ? Math.max(0, longestLabel + BAR_LABEL_GAP + cfg.busBarOverhang - cfg.margin + BAR_LABEL_GAP) : 0;
    // Vertical feeder labels are centred on their lane (or the column centre),
    // so a long label on an outer column can run past the canvas edge. Widen
    // that side just enough to fit; diagrams whose labels already fit are unchanged.
    const overflow = this.verticalLabelOverflow(doc, innerWidth);
    const leftShift = Math.max(exitShift, labelShift, overflow.left);
    const leftMargin = cfg.margin + leftShift;
    const rightShift = Math.max(extraRight, overflow.right);

    const size = {
      width: innerWidth + 2 * cfg.margin + leftShift + rightShift,
      height: innerHeight + 2 * cfg.margin + topGrowth + bottomGrowth
    };

    const cellRect = (cell: Cell): Rect => ({
      x: leftMargin + cell.col * (cfg.cellWidth + cfg.cellGapX),
      y: rowTops[cell.row] ?? cfg.margin + topGrowth,
      width: cfg.cellWidth,
      height: rowHeights[cell.row] ?? cfg.cellHeight
    });

    const cellAt = (p: Point): Cell | null => {
      if (rows === 0 || cols === 0) return null;
      let row = -1;
      for (let r = 0; r < rows; r++) {
        if (p.y >= rowTops[r] - cfg.cellGapY / 2 && p.y <= rowTops[r] + rowHeights[r] + cfg.cellGapY / 2) {
          row = r;
          break;
        }
      }
      if (row === -1) return null;
      const col = Math.floor((p.x - leftMargin + cfg.cellGapX / 2) / (cfg.cellWidth + cfg.cellGapX));
      if (col < 0 || col >= cols) return null;
      return { row, col };
    };

    const rowBoundaryY = (at: number): number => {
      if (rows === 0 || at <= 0) return cfg.margin + topGrowth - cfg.cellGapY / 2;
      if (at >= rows) return rowTops[rows - 1] + rowHeights[rows - 1] + cfg.cellGapY / 2;
      return rowTops[at] - cfg.cellGapY / 2;
    };

    const geometry = new Map<ElementId, ElementGeometry>();

    // Bus bars first (positions and connections reference their geometry).
    for (const bar of doc.busBars()) {
      if (bar.row < 0 || bar.row >= rows) continue;
      const centerY = rowTops[bar.row] + rowHeights[bar.row] / 2;
      const rect: Rect = {
        x: leftMargin - cfg.busBarOverhang,
        y: centerY - cfg.busBarThickness / 2,
        width: innerWidth + 2 * cfg.busBarOverhang,
        height: cfg.busBarThickness
      };
      const label = barLabels.get(bar.id) ?? bar.label;
      geometry.set(bar.id, {
        kind: 'busbar',
        rect,
        label,
        ...(labelLeft
          ? { labelAt: { x: rect.x - BAR_LABEL_GAP, y: centerY + cfg.busLabelFontSize * 0.35 }, textAnchor: 'end' as const }
          : { labelAt: { x: rect.x, y: rect.y - 8 }, textAnchor: 'start' as const })
      });
    }

    for (const pos of doc.positions()) {
      if (pos.row < 0 || pos.row >= rows) continue;
      const first = cellRect({ row: pos.row, col: pos.col });
      const spanWidth = pos.colSpan * cfg.cellWidth + (pos.colSpan - 1) * cfg.cellGapX;
      const rect: Rect = {
        x: first.x + (spanWidth - cfg.positionBoxWidth) / 2,
        y: first.y + (first.height - cfg.positionBoxHeight) / 2,
        width: cfg.positionBoxWidth,
        height: cfg.positionBoxHeight
      };
      geometry.set(pos.id, { kind: 'position', rect, cell: { row: pos.row, col: pos.col } });
    }

    const barCenterY = (row: number) => rowTops[row] + rowHeights[row] / 2;
    const topBarY = sortedBarRows.length ? barCenterY(sortedBarRows[0]) : null;
    const bottomBarY = sortedBarRows.length ? barCenterY(sortedBarRows[sortedBarRows.length - 1]) : null;

    const sideExitRankMap = exitRanks.ranks;
    // Y of the outermost far-edge lane above row 0 / below the last row, if any:
    // the outer bays' straight up/down stems are carried past it.
    const topLanes = exitRanks.farLanes.get(0);
    const bottomLanes = exitRanks.farLanes.get(rows);
    const outerLaneY = {
      top: topLanes !== undefined ? rowBoundaryY(0) - topLanes * cfg.barTapOffset : null,
      bottom: bottomLanes !== undefined ? rowBoundaryY(rows) + bottomLanes * cfg.barTapOffset : null
    };

    for (const conn of doc.connections()) {
      const geo = this.connectionGeometry(
        doc,
        conn,
        geometry,
        sortedBarRows,
        topBarY,
        bottomBarY,
        rowBoundaryY,
        leftMargin,
        innerWidth,
        sideExitRankMap,
        outerLaneY
      );
      if (geo) geometry.set(conn.id, geo);
    }

    // Post-layout crossing detection: annotates hops on horizontal segments.
    detectCrossings(geometry);

    return {
      size,
      rows,
      cols,
      rowKind: (row) => (barRows.has(row) ? 'busbar' : 'slots'),
      cellRect,
      cellAt,
      rowBoundaryY,
      geometry
    };
  }

  /**
   * Default direction for an external arrow. Positions typically sit
   * between the bars, so an external line leaves toward whichever bar the
   * position is nearer (crossing it on the way out); positions outside the
   * bar block leave away from it. Only ever returns 'up' or 'down';
   * 'left'/'right' are always explicit user intent.
   */
  private externalDirection(pos: Position, sortedBarRows: number[], rows: number): 'up' | 'down' {
    if (sortedBarRows.length === 0) return pos.row < rows / 2 ? 'up' : 'down';
    const top = sortedBarRows[0];
    const bottom = sortedBarRows[sortedBarRows.length - 1];
    if (pos.row <= top) return 'up';
    if (pos.row >= bottom) return 'down';
    return pos.row - top <= bottom - pos.row ? 'up' : 'down';
  }

  /**
   * The connection point ("tap") of an external whose position endpoint leaves
   * it unset ("Automatic"). A bay outside the bar block taps on the side away
   * from the bars, so the bay sits between bar and tie (bar → position → tie)
   * and opening the bay cuts the tie. A bay between bars (breaker-and-a-half)
   * taps opposite the arrow's up/down direction — toward mid-bay — and a
   * left/right arrow there taps opposite the bay's natural direction.
   */
  private autoTap(pos: Position, dir: ExternalDirection, sortedBarRows: number[], rows: number): 'above' | 'below' {
    if (sortedBarRows.length > 0) {
      if (pos.row < sortedBarRows[0]) return 'above';
      if (pos.row > sortedBarRows[sortedBarRows.length - 1]) return 'below';
    }
    if (dir === 'up') return 'below';
    if (dir === 'down') return 'above';
    return this.externalDirection(pos, sortedBarRows, rows) === 'up' ? 'below' : 'above';
  }

  /**
   * True if `pos` has an internal (non-external) connection to a neighbour on
   * the tap side — the vertical through-segment the virtual node lies on. When
   * false the position is isolated on that side and the external falls back to
   * a straight stem off the box edge.
   */
  private hasThroughConnection(doc: SldDocument, pos: Position, tap: 'above' | 'below'): boolean {
    for (const conn of doc.connections()) {
      if (conn.from.kind === 'external' || conn.to.kind === 'external') continue;
      const ids = conn.elementIds();
      if (!ids.includes(pos.id)) continue;
      const otherId = ids.find((id) => id !== pos.id);
      if (!otherId) continue;
      const other = doc.getElement(otherId);
      const otherRow = other instanceof BusBar || other instanceof Position ? other.row : null;
      if (otherRow === null) continue;
      if (tap === 'above' && otherRow < pos.row) return true;
      if (tap === 'below' && otherRow > pos.row) return true;
    }
    return false;
  }

  /**
   * Bars that `pos` connects to on the given side (`+1` below, `-1` above),
   * each with its centre Y, sorted nearest-first. Lets the bay fan multiple
   * bar-taps into distinct lanes instead of one overlapping stroke.
   */
  private sameSideBarTaps(
    doc: SldDocument,
    pos: Position,
    side: number,
    geometry: Map<ElementId, ElementGeometry>
  ): { bar: BusBar; y: number }[] {
    const taps: { bar: BusBar; y: number }[] = [];
    for (const conn of doc.connectionsOf(pos.id)) {
      const otherId = conn.elementIds().find((id) => id !== pos.id);
      if (!otherId) continue;
      const other = doc.getElement(otherId);
      if (!(other instanceof BusBar) || Math.sign(other.row - pos.row) !== side) continue;
      const g = geometry.get(other.id);
      taps.push({ bar: other, y: g?.kind === 'busbar' ? g.rect.y + g.rect.height / 2 : 0 });
    }
    taps.sort((x, y) => Math.abs(x.bar.row - pos.row) - Math.abs(y.bar.row - pos.row));
    return taps;
  }

  /** Length of a three-winding branch stub, arrowhead included. */
  private get branchLength(): number {
    return this.cfg.externalStemLength / 2 + this.cfg.arrowSize;
  }

  /**
   * A `transformer3w` external's third winding: a stub perpendicular to the
   * feeder, leaving the glyph's side circle (up/down feeders, to the right) or
   * its bottom circle (left/right feeders, downward), with an arrowhead and the
   * branch label beyond it. Other externals are returned unchanged.
   */
  private withBranch(
    geo: ConnectionGeometry,
    dir: ExternalDirection,
    external: Extract<Endpoint, { kind: 'external' }>
  ): ConnectionGeometry {
    if (external.asset !== 'transformer3w' || !external.branch || !geo.symbol) return geo;
    const cfg = this.cfg;
    const { box } = geo.symbol;
    const k = box.width / TRANSFORMER3W_BRANCH_ANCHOR.size;
    const len = this.branchLength;
    if (dir === 'up' || dir === 'down') {
      const a = TRANSFORMER3W_BRANCH_ANCHOR.side;
      const start = { x: box.x + a.x * k, y: box.y + a.y * k };
      const tip = { x: start.x + len, y: start.y };
      return {
        ...geo,
        branch: {
          points: [start, { x: tip.x - cfg.arrowSize, y: tip.y }],
          arrow: { at: tip, angle: 0 },
          labelAt: { at: { x: tip.x + 4, y: tip.y + cfg.labelFontSize * 0.35 }, anchor: 'start' }
        }
      };
    }
    const a = TRANSFORMER3W_BRANCH_ANCHOR.bottom;
    const start = { x: box.x + a.x * k, y: box.y + a.y * k };
    const tip = { x: start.x, y: start.y + len };
    return {
      ...geo,
      branch: {
        points: [start, { x: tip.x, y: tip.y - cfg.arrowSize }],
        arrow: { at: tip, angle: 90 },
        labelAt: { at: { x: tip.x, y: tip.y + cfg.labelFontSize + 4 }, anchor: 'middle' }
      }
    };
  }

  /**
   * How far the labels of up/down feeders overflow the default margins, per
   * side (0 when they fit). Measured before geometry exists, so it checks both
   * places such a label can be centred: the column centre (straight stem) and
   * the side lane (virtual-node routing). Widths are estimated, as for bar
   * labels, since there is no DOM to measure in.
   */
  private verticalLabelOverflow(doc: SldDocument, innerWidth: number): { left: number; right: number } {
    const cfg = this.cfg;
    const laneOffset = cfg.cellWidth / 2 + cfg.cellGapX / 2;
    let left = 0;
    let right = 0;
    for (const conn of doc.connections()) {
      const ext = conn.from.kind === 'external' ? conn.from : conn.to.kind === 'external' ? conn.to : null;
      const own = conn.from.kind === 'element' ? conn.from : conn.to.kind === 'element' ? conn.to : null;
      if (!ext || !own || !ext.label || ext.direction === 'left' || ext.direction === 'right') continue;
      const pos = doc.getElement(own.id);
      if (!(pos instanceof Position)) continue;
      const spanWidth = pos.colSpan * cfg.cellWidth + (pos.colSpan - 1) * cfg.cellGapX;
      const cx = pos.col * (cfg.cellWidth + cfg.cellGapX) + spanWidth / 2;
      const laneX = ext.side === 'left' ? cx - laneOffset : cx + laneOffset;
      const half = barLabelWidth(ext.label, cfg.labelFontSize) / 2;
      left = Math.max(left, half - Math.min(cx, laneX) - cfg.margin + LABEL_EDGE_PAD);
      right = Math.max(right, Math.max(cx, laneX) + half - innerWidth - cfg.margin + LABEL_EDGE_PAD);
      // A three-winding branch runs right from the glyph, its label after the arrow.
      if (ext.asset === 'transformer3w' && ext.branch) {
        const reach = cfg.symbolSize / 2 + this.branchLength + 4 + barLabelWidth(ext.branch.label, cfg.labelFontSize);
        right = Math.max(right, Math.max(cx, laneX) + reach - innerWidth - cfg.margin + LABEL_EDGE_PAD);
      }
    }
    return { left, right };
  }

  /**
   * Pre-computes lane-stacking ranks for every external that taps a row gap,
   * in any direction. Externals sharing a gap whose horizontal footprints
   * overlap are assigned distinct ranks (0, 1, 2 …); each rank offsets the run
   * or junction node vertically by `barTapOffset`, so colliding exits stagger
   * onto separate lines instead of overlapping. Non-overlapping footprints —
   * e.g. a left exit and a right exit leaving toward opposite edges — both keep
   * rank 0 and run in parallel, untouched.
   *
   * Footprints are measured in column units: a right exit spans `[col, ∞)`, a
   * left exit `(−∞, col]`, and an up/down exit only its half-cell jog toward
   * its lane side (`[col, col+0.5]` or `[col−0.5, col]`). Two footprints
   * conflict when their closed intervals intersect. Horizontal exits — which
   * run across the gap — claim their lanes first (lowest ranks), then vertical
   * exits fill what remains; ties break by the run that reaches its edge
   * soonest (shortest run nearest rank 0), matching the previous side-exit
   * ordering.
   */
  private computeGapExitRanks(doc: SldDocument, sortedBarRows: number[]): GapExitRanks {
    const rankMap = new Map<ElementId, number>();
    const farLanes = new Map<number, number>();
    const cols = doc.grid.cols;

    interface Exit {
      id: ElementId;
      lo: number;
      hi: number;
      horizontal: boolean;
      /** Side exit leaving the box's far edge (no through-connection on the tap side). */
      far: boolean;
      /** Processing priority within the gap (lower goes first). */
      order: number;
      rank: number;
    }
    const groups = new Map<number, Exit[]>();

    for (const conn of doc.connections()) {
      const plan = this.exitPlan(doc, conn, sortedBarRows);
      if (!plan) continue;
      const { pos: el, ext, dir, boundary } = plan;
      const horizontal = dir === 'left' || dir === 'right';

      const c = el.col;
      let lo: number;
      let hi: number;
      let order: number;
      if (dir === 'right') {
        lo = c;
        hi = Infinity;
        order = cols - c; // shorter right run (nearer the right edge) first
      } else if (dir === 'left') {
        lo = -Infinity;
        hi = c;
        order = c + 1; // shorter left run (nearer the left edge) first
      } else {
        const side = ext.side ?? 'right';
        lo = side === 'right' ? c : c - 0.5;
        hi = side === 'right' ? c + 0.5 : c;
        order = c;
      }

      const exit: Exit = { id: conn.id, lo, hi, horizontal, far: horizontal && !plan.through, order, rank: 0 };
      const arr = groups.get(boundary);
      if (arr) arr.push(exit);
      else groups.set(boundary, [exit]);
    }

    for (const [boundary, exits] of groups) {
      exits.sort((a, b) => (a.horizontal === b.horizontal ? a.order - b.order : a.horizontal ? -1 : 1));

      const placed: Exit[] = [];
      for (const e of exits) {
        const taken = new Set<number>();
        for (const p of placed) {
          if (e.lo <= p.hi && p.lo <= e.hi) taken.add(p.rank);
        }
        let r = 0;
        while (taken.has(r)) r++;
        e.rank = r;
        rankMap.set(e.id, r);
        placed.push(e);
      }
      const far = exits.filter((e) => e.far);
      if (far.length > 0) farLanes.set(boundary, Math.max(...far.map((e) => e.rank)));
    }

    return { ranks: rankMap, farLanes };
  }

  /**
   * Everything the layout decides about one external exit before any pixels:
   * its position, direction, resolved tap, the row boundary (gap) it taps, and
   * whether a through-connection sits on that side. Null for non-external
   * connections or when the element end isn't a position.
   */
  private exitPlan(doc: SldDocument, conn: Connection, sortedBarRows: number[]): ExitPlan | null {
    const ext = conn.from.kind === 'external' ? conn.from : conn.to.kind === 'external' ? conn.to : null;
    if (!ext) return null;
    const posEnd = conn.from.kind === 'element' ? conn.from : conn.to.kind === 'element' ? conn.to : null;
    if (!posEnd) return null;
    const pos = doc.getElement(posEnd.id);
    if (!(pos instanceof Position)) return null;
    const dir = ext.direction ?? this.externalDirection(pos, sortedBarRows, doc.grid.rows);
    const tap = posEnd.tap ?? this.autoTap(pos, dir, sortedBarRows, doc.grid.rows);
    return {
      pos,
      ext,
      dir,
      tap,
      boundary: tap === 'above' ? pos.row : pos.row + 1,
      through: this.hasThroughConnection(doc, pos, tap)
    };
  }

  /**
   * Distance past the outermost far-edge lane at which an outer bay's straight
   * up/down arrow tip lands: a clearance for the lane's hop arcs, the asset
   * glyph when there is one, then the arrowhead.
   */
  private laneStemReach(asset: string): number {
    const cfg = this.cfg;
    return LANE_CLEARANCE_RATIO * cfg.barTapOffset + (asset !== 'line' ? cfg.symbolSize + LANE_SYMBOL_GAP : 0) + cfg.arrowSize;
  }

  /**
   * Extra canvas height above row 0 (`top`) or below the last row (`bottom`)
   * so stacked far-edge lanes, and the outer bays' straight stems carried past
   * them, stay on the canvas. 0 when that outer gap has no far-edge lanes.
   */
  private outerLaneGrowth(doc: SldDocument, sortedBarRows: number[], exitRanks: GapExitRanks, edge: 'top' | 'bottom'): number {
    const cfg = this.cfg;
    const rows = doc.grid.rows;
    const boundary = edge === 'top' ? 0 : rows;
    const k = exitRanks.farLanes.get(boundary);
    if (k === undefined || rows === 0) return 0;
    const outerRow = edge === 'top' ? 0 : rows - 1;
    if (sortedBarRows.includes(outerRow)) return 0;
    // Distances measured outward from the outer row's box edge.
    const inset = (cfg.cellHeight - cfg.positionBoxHeight) / 2;
    const lane = inset + cfg.cellGapY / 2 + k * cfg.barTapOffset;
    let growth = Math.max(0, lane + LANE_EDGE_PAD - (cfg.margin + inset));
    for (const conn of doc.connections()) {
      const plan = this.exitPlan(doc, conn, sortedBarRows);
      if (!plan || plan.pos.row !== outerRow || plan.through) continue;
      if (plan.dir !== (edge === 'top' ? 'up' : 'down')) continue;
      growth = Math.max(growth, lane + this.laneStemReach(plan.ext.asset) - cfg.externalStemLength);
    }
    return growth;
  }

  /**
   * v0 straight stem: the external leaves the position box edge, runs straight
   * out crossing the outer bar, and ends beyond it with arrowhead + label.
   * Used as the degenerate fallback for positions with no tap-side neighbour.
   */
  private straightExternalGeometry(
    posGeo: { rect: Rect },
    dir: ExternalDirection,
    external: Extract<Endpoint, { kind: 'external' }>,
    topBarY: number | null,
    bottomBarY: number | null,
    laneY: number | null = null
  ): ConnectionGeometry {
    const cfg = this.cfg;
    const cx = posGeo.rect.x + posGeo.rect.width / 2;
    const startY = dir === 'up' ? posGeo.rect.y : posGeo.rect.y + posGeo.rect.height;
    const out = dir === 'up' ? -1 : 1;
    const clearY =
      dir === 'up'
        ? topBarY !== null
          ? Math.min(startY, topBarY)
          : startY
        : bottomBarY !== null
          ? Math.max(startY, bottomBarY)
          : startY;
    let endY = dir === 'up' ? clearY - cfg.externalStemLength : clearY + cfg.externalStemLength;
    // Far-edge lanes stacked in this outer gap: carry the stem past the
    // outermost one (never shorter than the default stem), glyph beyond it.
    if (laneY !== null) {
      const laneEnd = laneY + out * this.laneStemReach(external.asset);
      endY = out < 0 ? Math.min(endY, laneEnd) : Math.max(endY, laneEnd);
    }
    const lineEndY = dir === 'up' ? endY + cfg.arrowSize : endY - cfg.arrowSize;
    const geo: ConnectionGeometry = {
      kind: 'connection',
      points: [
        { x: cx, y: startY },
        { x: cx, y: lineEndY }
      ],
      arrow: { at: { x: cx, y: endY }, angle: dir === 'up' ? -90 : 90 },
      labelAt: {
        at: { x: cx, y: dir === 'up' ? endY - cfg.arrowSize - 6 : endY + cfg.arrowSize + cfg.labelFontSize + 4 },
        anchor: 'middle'
      }
    };
    if (external.asset !== 'line') {
      const midY =
        laneY !== null ? laneY + out * (LANE_CLEARANCE_RATIO * cfg.barTapOffset + cfg.symbolSize / 2) : (clearY + endY) / 2;
      geo.symbol = {
        key: `external:${external.asset}`,
        box: { x: cx - cfg.symbolSize / 2, y: midY - cfg.symbolSize / 2, width: cfg.symbolSize, height: cfg.symbolSize }
      };
    }
    return geo;
  }

  /**
   * Virtual-node routing: the external taps a junction node in the row gap on
   * the tap side of the position — a point already on the bay's through-segment
   * — then makes a 90° turn into a vertical lane beside the column, crosses the
   * outer bar and ends with arrowhead + label. A junction dot marks the node.
   */
  private nodeExternalGeometry(
    posGeo: { rect: Rect },
    pos: Position,
    dir: ExternalDirection,
    tap: 'above' | 'below',
    external: Extract<Endpoint, { kind: 'external' }>,
    topBarY: number | null,
    bottomBarY: number | null,
    rowBoundaryY: (at: number) => number,
    rank: number
  ): ConnectionGeometry {
    const cfg = this.cfg;
    const cx = posGeo.rect.x + posGeo.rect.width / 2;
    // Stagger the junction (and its 90° jog) within the row gap when another
    // gap exit shares the same lane, so the dot lands on a clear line instead
    // of on a crossing. The dot stays on the bay's through-segment.
    const nodeY = rowBoundaryY(tap === 'above' ? pos.row : pos.row + 1) + rank * cfg.barTapOffset;
    const node: Point = { x: cx, y: nodeY };
    const side = external.side ?? 'right';
    const laneOffset = cfg.cellWidth / 2 + cfg.cellGapX / 2;
    const laneX = side === 'right' ? cx + laneOffset : cx - laneOffset;
    const clearY =
      dir === 'up'
        ? topBarY !== null
          ? Math.min(nodeY, topBarY)
          : nodeY
        : bottomBarY !== null
          ? Math.max(nodeY, bottomBarY)
          : nodeY;
    const endY = dir === 'up' ? clearY - cfg.externalStemLength : clearY + cfg.externalStemLength;
    const lineEndY = dir === 'up' ? endY + cfg.arrowSize : endY - cfg.arrowSize;
    const geo: ConnectionGeometry = {
      kind: 'connection',
      points: [node, { x: laneX, y: nodeY }, { x: laneX, y: lineEndY }],
      arrow: { at: { x: laneX, y: endY }, angle: dir === 'up' ? -90 : 90 },
      dot: node,
      labelAt: {
        at: { x: laneX, y: dir === 'up' ? endY - cfg.arrowSize - 6 : endY + cfg.arrowSize + cfg.labelFontSize + 4 },
        anchor: 'middle'
      }
    };
    if (external.asset !== 'line') {
      const midY = (clearY + endY) / 2;
      geo.symbol = {
        key: `external:${external.asset}`,
        box: {
          x: laneX - cfg.symbolSize / 2,
          y: midY - cfg.symbolSize / 2,
          width: cfg.symbolSize,
          height: cfg.symbolSize
        }
      };
    }
    return geo;
  }

  /**
   * Side exit routing: the external leaves the position horizontally, to the
   * left or right diagram edge, ending with an arrowhead + label at the margin.
   *
   * Node case (hasThrough=true): starts at the virtual node in the row gap,
   * marked with a junction dot. Straight fallback (hasThrough=false): starts
   * at the box edge and runs at the box's vertical centre.
   *
   * Lane stacking: when multiple exits share the same row gap and direction,
   * `rank` shifts each run vertically by `barTapOffset` to prevent overlap.
   */
  private sideExternalGeometry(
    posGeo: { rect: Rect },
    pos: Position,
    dir: 'left' | 'right',
    tap: 'above' | 'below',
    external: Extract<Endpoint, { kind: 'external' }>,
    rowBoundaryY: (at: number) => number,
    leftMargin: number,
    innerWidth: number,
    rank: number,
    hasThrough: boolean
  ): ConnectionGeometry {
    const cfg = this.cfg;
    const cx = posGeo.rect.x + posGeo.rect.width / 2;

    // Arrow tip x: just past the bus-bar overhangs by one stem length.
    const edgeX =
      dir === 'right'
        ? leftMargin + innerWidth + cfg.busBarOverhang + cfg.externalStemLength
        : leftMargin - cfg.busBarOverhang - cfg.externalStemLength;

    // Line ends at the arrow base so the stroked line and filled triangle meet.
    const lineEndX = dir === 'right' ? edgeX - cfg.arrowSize : edgeX + cfg.arrowSize;
    const arrowAngle = dir === 'right' ? 0 : 180;

    // The run lies in the tap's row gap. Node case: the junction sits on the
    // through-segment and lanes step down by rank (historical). Isolated side
    // (e.g. an outer bay tapping away from the bars): a stem leaves the box's
    // far edge into the gap, then turns; lanes stack outward, away from the box,
    // so the shortest run (rank 0) is innermost and no stem crosses another run.
    const gapMidY = rowBoundaryY(tap === 'above' ? pos.row : pos.row + 1);
    const outward = tap === 'above' ? -1 : 1;
    const runY = gapMidY + (hasThrough ? rank : outward * rank) * cfg.barTapOffset;

    // Label: past the arrow tip, text anchored at the outer margin.
    const labelOffset = cfg.arrowSize + 6;
    const labelX = dir === 'right' ? edgeX + labelOffset : edgeX - labelOffset;
    const labelY = runY + cfg.labelFontSize * 0.35;

    const edgeY = tap === 'above' ? posGeo.rect.y : posGeo.rect.y + posGeo.rect.height;
    const start: Point[] = hasThrough ? [{ x: cx, y: runY }] : [{ x: cx, y: edgeY }, { x: cx, y: runY }];

    const geo: ConnectionGeometry = {
      kind: 'connection',
      points: [...start, { x: lineEndX, y: runY }],
      arrow: { at: { x: edgeX, y: runY }, angle: arrowAngle },
      labelAt: {
        at: { x: labelX, y: labelY },
        anchor: dir === 'right' ? 'start' : 'end'
      }
    };

    if (hasThrough) {
      geo.dot = { x: cx, y: runY };
    }

    if (external.asset !== 'line') {
      // Place the symbol in the clear zone beyond the bus-bar overhangs —
      // all crossing hops occur inside the content grid, so the symbol
      // never overlaps a hop arc.
      const clearX = dir === 'right' ? leftMargin + innerWidth + cfg.busBarOverhang : leftMargin - cfg.busBarOverhang;
      const symCenterX = dir === 'right' ? clearX + cfg.externalStemLength / 2 : clearX - cfg.externalStemLength / 2;
      geo.symbol = {
        key: `external:${external.asset}`,
        box: {
          x: symCenterX - cfg.symbolSize / 2,
          y: runY - cfg.symbolSize / 2,
          width: cfg.symbolSize,
          height: cfg.symbolSize
        }
      };
    }

    return geo;
  }

  private connectionGeometry(
    doc: SldDocument,
    conn: Connection,
    geometry: Map<ElementId, ElementGeometry>,
    sortedBarRows: number[],
    topBarY: number | null,
    bottomBarY: number | null,
    rowBoundaryY: (at: number) => number,
    leftMargin: number,
    innerWidth: number,
    sideExitRankMap: Map<ElementId, number>,
    outerLaneY: { top: number | null; bottom: number | null }
  ): ConnectionGeometry | null {
    const resolve = (e: Endpoint) => (e.kind === 'element' ? doc.getElement(e.id) : null);
    const a = resolve(conn.from);
    const b = resolve(conn.to);

    // position ↔ external
    const external = conn.from.kind === 'external' ? conn.from : conn.to.kind === 'external' ? conn.to : null;
    if (external) {
      const el = a instanceof Position ? a : b instanceof Position ? b : null;
      if (!el) return null;
      const posGeo = geometry.get(el.id);
      if (posGeo?.kind !== 'position') return null;
      const dir = external.direction ?? this.externalDirection(el, sortedBarRows, doc.grid.rows);
      const posEndpoint = conn.from.kind === 'element' ? conn.from : conn.to.kind === 'element' ? conn.to : null;

      const tap: 'above' | 'below' = posEndpoint?.tap ?? this.autoTap(el, dir, sortedBarRows, doc.grid.rows);

      const rank = sideExitRankMap.get(conn.id) ?? 0;

      if (dir === 'left' || dir === 'right') {
        const hasThrough = this.hasThroughConnection(doc, el, tap);
        const side = this.sideExternalGeometry(
          posGeo,
          el,
          dir,
          tap,
          external,
          rowBoundaryY,
          leftMargin,
          innerWidth,
          rank,
          hasThrough
        );
        return this.withBranch(side, dir, external);
      }

      if (!this.hasThroughConnection(doc, el, tap)) {
        // An outer bay's stem is carried past the far-edge lanes stacked in its outer gap.
        const laneY =
          dir === 'up' && el.row === 0 ? outerLaneY.top : dir === 'down' && el.row === doc.grid.rows - 1 ? outerLaneY.bottom : null;
        return this.withBranch(
          this.straightExternalGeometry(posGeo, dir, external, topBarY, bottomBarY, laneY),
          dir,
          external
        );
      }
      return this.withBranch(
        this.nodeExternalGeometry(posGeo, el, dir, tap, external, topBarY, bottomBarY, rowBoundaryY, rank),
        dir,
        external
      );
    }

    // position ↔ busbar
    const pos = a instanceof Position ? a : b instanceof Position ? b : null;
    const bar = a instanceof BusBar ? a : b instanceof BusBar ? b : null;
    if (pos && bar) {
      const cfg = this.cfg;
      const posGeo = geometry.get(pos.id);
      const barGeo = geometry.get(bar.id);
      if (posGeo?.kind !== 'position' || barGeo?.kind !== 'busbar') return null;
      const cx = posGeo.rect.x + posGeo.rect.width / 2;
      const barY = barGeo.rect.y + barGeo.rect.height / 2;
      const startY = bar.row > pos.row ? posGeo.rect.y + posGeo.rect.height : posGeo.rect.y;

      const side = Math.sign(bar.row - pos.row);
      const taps = this.sameSideBarTaps(doc, pos, side, geometry);
      const rank = taps.findIndex((t) => t.bar.id === bar.id);

      if (rank <= 0) {
        return {
          kind: 'connection',
          points: [
            { x: cx, y: startY },
            { x: cx, y: barY }
          ]
        };
      }

      const gapMidY = rowBoundaryY(side > 0 ? pos.row + 1 : pos.row);
      const laneX = cx + rank * cfg.barTapOffset;
      return {
        kind: 'connection',
        points: [
          { x: cx, y: gapMidY },
          { x: laneX, y: gapMidY },
          { x: laneX, y: barY }
        ],
        dot: { x: cx, y: gapMidY }
      };
    }

    // position ↔ position
    if (a instanceof Position && b instanceof Position) {
      const upper = a.row <= b.row ? a : b;
      const lower = a.row <= b.row ? b : a;
      const upGeo = geometry.get(upper.id);
      const loGeo = geometry.get(lower.id);
      if (upGeo?.kind !== 'position' || loGeo?.kind !== 'position') return null;
      const x1 = upGeo.rect.x + upGeo.rect.width / 2;
      const x2 = loGeo.rect.x + loGeo.rect.width / 2;
      const y1 = upGeo.rect.y + upGeo.rect.height;
      const y2 = loGeo.rect.y;
      if (x1 === x2) {
        return {
          kind: 'connection',
          points: [
            { x: x1, y: y1 },
            { x: x1, y: y2 }
          ]
        };
      }
      const midY = (y1 + y2) / 2;
      return {
        kind: 'connection',
        points: [
          { x: x1, y: y1 },
          { x: x1, y: midY },
          { x: x2, y: midY },
          { x: x2, y: y2 }
        ]
      };
    }

    return null;
  }
}
