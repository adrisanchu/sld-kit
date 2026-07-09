import type { Cell, ElementId, Endpoint, ExternalDirection } from '../types';
import { SLD_LAYOUT, type SldLayoutConfig } from '../layout';
import type { Point, Rect } from './geometry';
import { SldDocument } from '../SldDocument';
import { BusBar } from '../elements/BusBar';
import { Position } from '../elements/Position';
import { Connection } from '../elements/Connection';
import { detectCrossings } from './crossings';

export interface BusBarGeometry {
  kind: 'busbar';
  rect: Rect;
  labelAt: Point;
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
  constructor(private cfg: SldLayoutConfig = SLD_LAYOUT) {}

  layout(doc: SldDocument): DiagramLayout {
    const cfg = this.cfg;
    const { rows, cols } = doc.grid;
    const barRows = new Set(doc.busBars().map((b) => b.row));

    // Row tops via prefix sum: bar rows are shorter than slot rows.
    const rowHeights: number[] = [];
    const rowTops: number[] = [];
    let y = cfg.margin;
    for (let r = 0; r < rows; r++) {
      rowTops.push(y);
      const h = barRows.has(r) ? cfg.busBarRowHeight : cfg.cellHeight;
      rowHeights.push(h);
      y += h + cfg.cellGapY;
    }
    const innerHeight = rows > 0 ? y - cfg.cellGapY - cfg.margin : 0;
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
    const labelRoom = 80;
    const leftShift = hasLeftExit
      ? Math.max(0, labelRoom + cfg.busBarOverhang + cfg.externalStemLength - cfg.margin)
      : 0;
    const extraRight = hasRightExit
      ? Math.max(0, labelRoom + cfg.busBarOverhang + cfg.externalStemLength + cfg.arrowSize - cfg.margin)
      : 0;
    const leftMargin = cfg.margin + leftShift;

    const size = {
      width: innerWidth + 2 * cfg.margin + leftShift + extraRight,
      height: innerHeight + 2 * cfg.margin
    };

    const cellRect = (cell: Cell): Rect => ({
      x: leftMargin + cell.col * (cfg.cellWidth + cfg.cellGapX),
      y: rowTops[cell.row] ?? cfg.margin,
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
      if (rows === 0 || at <= 0) return cfg.margin - cfg.cellGapY / 2;
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
      geometry.set(bar.id, {
        kind: 'busbar',
        rect,
        labelAt: { x: rect.x, y: rect.y - 8 }
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

    const sortedBarRows = [...barRows].sort((a, b) => a - b);
    const barCenterY = (row: number) => rowTops[row] + rowHeights[row] / 2;
    const topBarY = sortedBarRows.length ? barCenterY(sortedBarRows[0]) : null;
    const bottomBarY = sortedBarRows.length ? barCenterY(sortedBarRows[sortedBarRows.length - 1]) : null;

    // Pre-compute lane-stacking ranks for horizontal side exits.
    const sideExitRankMap = this.computeSideExitRanks(doc, sortedBarRows, rowBoundaryY);

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
        sideExitRankMap
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

  /**
   * Pre-computes lane-stacking ranks for side exits (left/right). When two or
   * more externals share the same row gap and exit direction, they are assigned
   * ranks 0, 1, 2… sorted by column (nearest to the exit edge first). Each
   * rank offsets the horizontal run by `barTapOffset` vertically within the gap.
   */
  private computeSideExitRanks(
    doc: SldDocument,
    sortedBarRows: number[],
    rowBoundaryY: (at: number) => number
  ): Map<ElementId, number> {
    const rankMap = new Map<ElementId, number>();
    const groups = new Map<string, { col: number; id: ElementId }[]>();

    for (const conn of doc.connections()) {
      const ext = conn.from.kind === 'external' ? conn.from : conn.to.kind === 'external' ? conn.to : null;
      if (!ext || (ext.direction !== 'left' && ext.direction !== 'right')) continue;
      const dir = ext.direction;

      const posEnd = conn.from.kind === 'element' ? conn.from : conn.to.kind === 'element' ? conn.to : null;
      if (!posEnd) continue;
      const el = doc.getElement(posEnd.id);
      if (!(el instanceof Position)) continue;

      const derivedVertical = this.externalDirection(el, sortedBarRows, doc.grid.rows);
      const tap: 'above' | 'below' = posEnd.tap ?? (derivedVertical === 'up' ? 'below' : 'above');
      const gapY = rowBoundaryY(tap === 'above' ? el.row : el.row + 1);
      const key = `${gapY}:${dir}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ col: el.col, id: conn.id });
    }

    for (const [key, exits] of groups) {
      const dir = key.split(':')[1] as 'left' | 'right';
      exits.sort((a, b) => (dir === 'left' ? a.col - b.col : b.col - a.col));
      for (let i = 0; i < exits.length; i++) {
        rankMap.set(exits[i].id, i);
      }
    }

    return rankMap;
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
    bottomBarY: number | null
  ): ConnectionGeometry {
    const cfg = this.cfg;
    const cx = posGeo.rect.x + posGeo.rect.width / 2;
    const startY = dir === 'up' ? posGeo.rect.y : posGeo.rect.y + posGeo.rect.height;
    const clearY =
      dir === 'up'
        ? topBarY !== null
          ? Math.min(startY, topBarY)
          : startY
        : bottomBarY !== null
          ? Math.max(startY, bottomBarY)
          : startY;
    const endY = dir === 'up' ? clearY - cfg.externalStemLength : clearY + cfg.externalStemLength;
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
      const midY = (clearY + endY) / 2;
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
    rowBoundaryY: (at: number) => number
  ): ConnectionGeometry {
    const cfg = this.cfg;
    const cx = posGeo.rect.x + posGeo.rect.width / 2;
    const gapMidY = rowBoundaryY(tap === 'above' ? pos.row : pos.row + 1);
    const node: Point = { x: cx, y: gapMidY };
    const side = external.side ?? 'right';
    const laneOffset = cfg.cellWidth / 2 + cfg.cellGapX / 2;
    const laneX = side === 'right' ? cx + laneOffset : cx - laneOffset;
    const clearY =
      dir === 'up'
        ? topBarY !== null
          ? Math.min(gapMidY, topBarY)
          : gapMidY
        : bottomBarY !== null
          ? Math.max(gapMidY, bottomBarY)
          : gapMidY;
    const endY = dir === 'up' ? clearY - cfg.externalStemLength : clearY + cfg.externalStemLength;
    const lineEndY = dir === 'up' ? endY + cfg.arrowSize : endY - cfg.arrowSize;
    const geo: ConnectionGeometry = {
      kind: 'connection',
      points: [node, { x: laneX, y: gapMidY }, { x: laneX, y: lineEndY }],
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

    // Y of this run: node gap mid-point for the node case, box centre for straight.
    const gapMidY = rowBoundaryY(tap === 'above' ? pos.row : pos.row + 1);
    const runY = (hasThrough ? gapMidY : posGeo.rect.y + posGeo.rect.height / 2) + rank * cfg.barTapOffset;

    // Label: past the arrow tip, text anchored at the outer margin.
    const labelOffset = cfg.arrowSize + 6;
    const labelX = dir === 'right' ? edgeX + labelOffset : edgeX - labelOffset;
    const labelY = runY + cfg.labelFontSize * 0.35;

    const startPoint: Point = hasThrough
      ? { x: cx, y: runY }
      : { x: dir === 'right' ? posGeo.rect.x + posGeo.rect.width : posGeo.rect.x, y: runY };

    const geo: ConnectionGeometry = {
      kind: 'connection',
      points: [startPoint, { x: lineEndX, y: runY }],
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
      const midX = (startPoint.x + edgeX) / 2;
      geo.symbol = {
        key: `external:${external.asset}`,
        box: {
          x: midX - cfg.symbolSize / 2,
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
    sideExitRankMap: Map<ElementId, number>
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

      // For horizontal exits, derive the tap the same way as vertical:
      // use the position's natural vertical direction to choose which row gap.
      const derivedTap = (d: ExternalDirection): 'above' | 'below' => {
        if (d === 'up') return 'below';
        if (d === 'down') return 'above';
        const nat = this.externalDirection(el, sortedBarRows, doc.grid.rows);
        return nat === 'up' ? 'below' : 'above';
      };
      const tap: 'above' | 'below' = posEndpoint?.tap ?? derivedTap(dir);

      if (dir === 'left' || dir === 'right') {
        const hasThrough = this.hasThroughConnection(doc, el, tap);
        const rank = sideExitRankMap.get(conn.id) ?? 0;
        return this.sideExternalGeometry(
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
      }

      if (!this.hasThroughConnection(doc, el, tap)) {
        return this.straightExternalGeometry(posGeo, dir, external, topBarY, bottomBarY);
      }
      return this.nodeExternalGeometry(posGeo, el, dir, tap, external, topBarY, bottomBarY, rowBoundaryY);
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
