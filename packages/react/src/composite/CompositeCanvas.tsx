import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import {
  SLD_LAYOUT,
  firstFormat,
  linkConnections,
  lineConnections,
  type CompositeLayout,
  type ChildLayout,
  type CompositeLineLayout,
  type ExternalConnectionTip,
  type Point
} from '@sld-kit/core';
import { createPanZoom, type ContentBounds } from '../panzoom';
import { useStore } from '../useStore';
import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
import { ChildDiagramView } from './ChildDiagramView';
import { SelectionFrame } from './SelectionFrame';

export interface CompositeCanvasProps {
  layout: CompositeLayout;
  selectedId?: string | null;
  /** Currently selected manual line (shows its draggable bend handles). */
  selectedLineId?: string | null;
  interactive?: boolean;
  /**
   * Explore mode: children's transforms are read-only, but a click flies into a
   * child (`onChildFocus`) and the `focusedId` child's operable internals fire
   * `onElementActivate`. Editing chrome (selection/rotation/draw) is inert here.
   */
  explore?: boolean;
  /** In explore mode, the child currently flown into (its internals are live). */
  focusedId?: string | null;
  /**
   * Draw mode: clicking the canvas fires `onCanvasPoint` (snapped to the nearest
   * connection dot when close) instead of clearing the selection. The consumer
   * accumulates the points and commits a line; a double-click fires `onDrawCommit`.
   */
  drawMode?: boolean;
  /** Connection dots a drawn end can snap to (from `engine.externalConnectionTips`). */
  snapTargets?: ExternalConnectionTip[];
  /** In-progress polyline being drawn, in composite coordinates. */
  draftPoints?: Point[];
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  tokens?: PositionTokens;
  /** Per-child color class override (e.g. a voltage bucket). */
  childColorClass?: (child: ChildLayout) => string | null;
  /**
   * Per-child override for *connection* colour only, so lines can be coloured on
   * a different axis than the boxes/bars. `undefined` keeps connections on
   * `childColorClass`.
   */
  childConnectionColorClass?: (child: ChildLayout) => string | null;
  /** Per-line color class override (e.g. a voltage bucket, when both ends match). */
  lineColorClass?: (line: CompositeLineLayout) => string | null;
  /** Per-element overlay returning an `ElementFormat`, forwarded to every child. */
  formatResolver?: FormatResolver | null;
  /** Numeric presentation config for the children and the composite chrome. */
  style?: SldViewStyle;
  showPositionLabels?: boolean;
  showBusBarLabels?: boolean;
  showConnectionLabels?: boolean;
  /** The always-on child diagram name (issue #17); on by default. */
  showChildNames?: boolean;
  /** Fallback text when a child diagram can't be resolved. */
  notFoundLabel?: string;
  /** Rendered last inside the `<svg>` — where the explorer injects flow overlays. */
  children?: ReactNode;

  onChildDown?: (detail: { id: string; event: React.PointerEvent }) => void;
  onChildFocus?: (detail: { id: string; event: React.PointerEvent }) => void;
  onElementActivate?: (detail: { instanceId: string; elementId: string }) => void;
  onRotateStart?: (detail: { event: React.PointerEvent }) => void;
  onClearSelection?: () => void;
  onLinkDown?: (detail: { connectionId: string; event: React.PointerEvent }) => void;
  onLineDown?: (detail: { id: string; event: React.PointerEvent }) => void;
  onLineVertexDown?: (detail: { id: string; index: number; event: React.PointerEvent }) => void;
  /** Remove an intermediate bend (double-click a vertex handle). */
  onLineVertexDelete?: (detail: { id: string; index: number }) => void;
  /** Add a bend: `index` is the segment (between vertex `index` and `index+1`). */
  onLineSegmentDown?: (detail: { id: string; index: number; point: Point; event: React.PointerEvent }) => void;
  onCanvasPoint?: (detail: { point: Point; snap: { instanceId: string; connectionId: string } | null }) => void;
  onDrawCommit?: () => void;
}

/** Imperative API, obtained with a `ref` — the analogue of Svelte's `bind:this`. */
export interface CompositeCanvasHandle {
  clientToSvg(clientX: number, clientY: number): Point;
  zoomToFit(): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Smoothly frame an arbitrary world rect (e.g. a child's `worldBounds`). */
  flyTo(bounds: ContentBounds, opts?: { durationMs?: number }): void;
  /** Smoothly return to the whole-composite fit. */
  flyToFit(opts?: { durationMs?: number }): void;
}

/** Snap distance for drawn ends, in composite (SVG) units. */
const SNAP_RADIUS = 16;

/**
 * SVG host of the composite. A sibling of `SldCanvas`, sharing only the pan/zoom
 * mechanics (via `createPanZoom`). Renders the inter-diagram links beneath the
 * children, each child as a rigid transformed group, and the rotation/selection
 * chrome for the active child on top. The flow overlays go in `children`.
 */
export const CompositeCanvas = forwardRef<CompositeCanvasHandle, CompositeCanvasProps>(function CompositeCanvas(
  {
    layout,
    selectedId = null,
    selectedLineId = null,
    interactive = true,
    explore = false,
    focusedId = null,
    drawMode = false,
    snapTargets = [],
    draftPoints = [],
    tokens = DEFAULT_POSITION_TOKENS,
    childColorClass = () => null,
    childConnectionColorClass,
    lineColorClass = () => null,
    formatResolver = null,
    style = DEFAULT_VIEW_STYLE,
    showPositionLabels = true,
    showBusBarLabels = true,
    showConnectionLabels = true,
    showChildNames = true,
    notFoundLabel = DEFAULT_CHILD_NOT_FOUND,
    children,
    onChildDown,
    onChildFocus,
    onElementActivate,
    onRotateStart,
    onClearSelection,
    onLinkDown,
    onLineDown,
    onLineVertexDown,
    onLineVertexDelete,
    onLineSegmentDown,
    onCanvasPoint,
    onDrawCommit
  },
  ref
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const suppressNextClick = useRef(false);

  const cs = style.composite;

  // `layout` is read lazily through a ref so the pan/zoom instance stays stable
  // for the life of the canvas (recreating it would reset the viewBox).
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const pz = useMemo(
    () =>
      createPanZoom(
        () => svgRef.current,
        () => layoutRef.current.bounds
      ),
    []
  );
  const viewBox = useStore(pz.viewBox);
  const spaceDown = useStore(pz.spaceDown);
  const panning = useStore(pz.panning);

  const selectedChild = selectedId ? (layout.children.find((c) => c.instance.id === selectedId) ?? null) : null;
  const selectedLine = selectedLineId ? (layout.lines.find((l) => l.line.id === selectedLineId) ?? null) : null;

  useImperativeHandle(
    ref,
    (): CompositeCanvasHandle => ({
      clientToSvg: (x, y) => pz.clientToSvg(x, y),
      zoomToFit: () => pz.zoomToFit(),
      zoomIn: () => pz.zoomIn(),
      zoomOut: () => pz.zoomOut(),
      flyTo: (bounds, opts) => pz.flyTo(bounds, opts),
      flyToFit: (opts) => pz.flyToFit(opts)
    }),
    [pz]
  );

  useEffect(() => {
    pz.zoomToFit();
  }, [pz]);

  // Non-passive wheel: React's synthetic onWheel can't reliably preventDefault.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pz.handleWheel(e);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pz]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => pz.handleKey(e, true);
    const up = (e: KeyboardEvent) => pz.handleKey(e, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pz]);

  function nearestSnap(p: Point): ExternalConnectionTip | null {
    let best: ExternalConnectionTip | null = null;
    let bestDist = SNAP_RADIUS;
    for (const t of snapTargets) {
      const d = Math.hypot(t.point.x - p.x, t.point.y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  const handleLinkDown = (connectionId: string, e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    onLinkDown?.({ connectionId, event: e });
  };
  const handleLineDown = (id: string, e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    onLineDown?.({ id, event: e });
  };
  const handleVertexDown = (id: string, index: number, e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    // A handle gesture re-renders the chrome; swallow the trailing background
    // click so it can't clear the current line selection.
    suppressNextClick.current = true;
    onLineVertexDown?.({ id, index, event: e });
  };
  const handleVertexDblClick = (id: string, index: number, e: React.MouseEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    onLineVertexDelete?.({ id, index });
  };
  const handleSegmentDown = (id: string, index: number, point: Point, e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    suppressNextClick.current = true;
    onLineSegmentDown?.({ id, index, point, event: e });
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // In draw mode a tap/click places a point, so only pinch/space/middle pan.
      pz.tryStartPan(e.nativeEvent, { panOnDrag: !drawMode, background: e.target === svgRef.current });
    },
    [pz, drawMode]
  );
  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => pz.movePan(e.nativeEvent), [pz]);
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const res = pz.endPan(e.nativeEvent);
      if (res.wasPanning) suppressNextClick.current = res.moved;
    },
    [pz]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      if (drawMode && interactive) {
        const p = pz.clientToSvg(e.clientX, e.clientY);
        const snap = nearestSnap(p);
        onCanvasPoint?.({
          point: snap ? snap.point : p,
          snap: snap ? { instanceId: snap.instanceId, connectionId: snap.connectionId } : null
        });
        return;
      }
      if (e.target === svgRef.current) onClearSelection?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pz, drawMode, interactive, snapTargets, onCanvasPoint, onClearSelection]
  );

  const handleDblClick = useCallback(() => {
    if (drawMode && interactive) onDrawCommit?.();
  }, [drawMode, interactive, onDrawCommit]);

  const cursorClass = panning
    ? 'cursor-grabbing'
    : drawMode && interactive
      ? 'cursor-crosshair'
      : spaceDown || !drawMode
        ? 'cursor-grab'
        : '';

  const fmt = formatResolver ?? undefined;

  return (
    <svg
      ref={svgRef}
      className={`h-full w-full touch-none ${cursorClass}`}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerEnter={() => pz.setPointerInside(true)}
      onPointerLeave={() => pz.setPointerInside(false)}
      onClick={handleClick}
      onDoubleClick={handleDblClick}
    >
      {/* Inter-diagram auto-links (dashed), underneath the children. A commissioning
          overlay on the shared child connection restyles the tie-line; tagging it
          in either diagram is enough (see `linkConnections`). */}
      {layout.links.map((link) => {
        const lf = firstFormat(linkConnections(link, layout.children), fmt);
        const pts = link.points.map((p) => `${p.x},${p.y}`).join(' ');
        return (
          <g key={link.connectionId}>
            <polyline
              points={pts}
              fill="none"
              className="stroke-primary/70"
              strokeWidth={lf?.strokeWidth ?? cs.linkStrokeWidth}
              strokeDasharray={lf?.dashArray ?? cs.linkDashArray}
            />
            {link.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={SLD_LAYOUT.nodeDotRadius} className="fill-primary/70" />
            ))}
            {/* Wide transparent hit target: select an auto-link to convert it to a manual line. */}
            <polyline
              points={pts}
              fill="none"
              stroke="transparent"
              strokeWidth={style.hitStrokeWidth}
              className={interactive && !drawMode ? 'pointer-events-auto cursor-pointer' : undefined}
              onPointerDown={(e) => handleLinkDown(link.connectionId, e)}
            />
          </g>
        );
      })}

      {/* Manual lines (solid), underneath the children — matches the SVG export. */}
      {layout.lines.map((ln) => {
        const cls = lineColorClass(ln);
        const lf = firstFormat(lineConnections(ln.line, layout.children), fmt);
        return (
          <polyline
            key={ln.line.id}
            points={ln.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={cls ? 'currentColor' : undefined}
            className={cls ?? 'stroke-primary'}
            style={cls ? { color: 'var(--sld-pos)' } : undefined}
            strokeWidth={
              ln.line.id === selectedLineId ? cs.lineSelectedStrokeWidth : (lf?.strokeWidth ?? cs.lineStrokeWidth)
            }
            strokeDasharray={lf?.dashArray ?? undefined}
          />
        );
      })}

      {/* Children in z-order. */}
      {layout.children.map((child) => (
        <ChildDiagramView
          key={child.instance.id}
          child={child}
          interactive={interactive}
          explore={explore}
          focused={explore && child.instance.id === focusedId}
          dimmed={explore && focusedId !== null && child.instance.id !== focusedId}
          tokens={tokens}
          colorClass={childColorClass(child)}
          connectionColorClass={childConnectionColorClass ? childConnectionColorClass(child) : undefined}
          formatResolver={formatResolver}
          style={style}
          showPositionLabels={showPositionLabels}
          showBusBarLabels={showBusBarLabels}
          showConnectionLabels={showConnectionLabels}
          showChildNames={showChildNames}
          notFoundLabel={notFoundLabel}
          onChildDown={onChildDown}
          onChildFocus={onChildFocus}
          onElementActivate={onElementActivate}
        />
      ))}

      {/* Selection + rotation chrome on top. */}
      {selectedChild && (
        <SelectionFrame child={selectedChild} interactive={interactive} onRotateStart={onRotateStart} />
      )}

      {/* Manual-line chrome on top: hit targets for selection. */}
      {!drawMode &&
        layout.lines.map((ln) => (
          <polyline
            key={`hit:${ln.line.id}`}
            points={ln.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="transparent"
            strokeWidth={style.hitStrokeWidth}
            className={interactive ? 'pointer-events-auto cursor-pointer' : undefined}
            onPointerDown={(e) => handleLineDown(ln.line.id, e)}
          />
        ))}

      {/* Bend chrome needs vertex ↔ point 1:1 so a vertex index maps straight to its
          resolved world position; if some vertex didn't resolve we hide the handles
          rather than misplace them. */}
      {selectedLine && interactive && !drawMode && selectedLine.points.length === selectedLine.line.vertices.length && (
        <>
          {/* Hollow "add" handles at each segment midpoint: click-drag to insert
                a new bend; the segment index maps to a vertex insert position. */}
          {selectedLine.points.slice(0, -1).map((p, i) => {
            const mid = {
              x: (p.x + selectedLine.points[i + 1].x) / 2,
              y: (p.y + selectedLine.points[i + 1].y) / 2
            };
            return (
              <circle
                key={`add:${i}`}
                cx={mid.x}
                cy={mid.y}
                r={cs.addHandleRadius}
                className="fill-background stroke-primary/50 pointer-events-auto cursor-copy"
                strokeWidth={cs.handleStrokeWidth}
                strokeDasharray={cs.addHandleDashArray}
                onPointerDown={(e) => handleSegmentDown(selectedLine.line.id, i, mid, e)}
              >
                <title>Click to add a bend</title>
              </circle>
            );
          })}

          {/* Only free bend vertices are draggable; anchored ends follow their
                child. Drawn at the resolved point. Double-click removes. */}
          {selectedLine.line.vertices.map((v, i) =>
            v.kind === 'point' || v.kind === 'rel' ? (
              <circle
                key={`vtx:${i}`}
                cx={selectedLine.points[i].x}
                cy={selectedLine.points[i].y}
                r={cs.vertexHandleRadius}
                className="fill-background stroke-primary pointer-events-auto cursor-grab"
                strokeWidth={cs.handleStrokeWidth}
                onPointerDown={(e) => handleVertexDown(selectedLine.line.id, i, e)}
                onDoubleClick={(e) => handleVertexDblClick(selectedLine.line.id, i, e)}
              >
                <title>Drag to move · double-click to delete</title>
              </circle>
            ) : null
          )}
        </>
      )}

      {/* Draw-mode overlay: snap targets + in-progress polyline. */}
      {drawMode && interactive && (
        <>
          {snapTargets.map((t, i) => (
            <circle
              key={`snap:${i}`}
              cx={t.point.x}
              cy={t.point.y}
              r={cs.snapHandleRadius}
              className="fill-background stroke-primary/60"
              strokeWidth={cs.handleStrokeWidth}
            />
          ))}
          {draftPoints.length > 0 && (
            <>
              {draftPoints.length > 1 && (
                <polyline
                  points={draftPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  className="stroke-primary"
                  strokeWidth={cs.draftStrokeWidth}
                  strokeDasharray={cs.draftDashArray}
                />
              )}
              {draftPoints.map((p, i) => (
                <circle key={`draft:${i}`} cx={p.x} cy={p.y} r={cs.draftPointRadius} className="fill-primary" />
              ))}
            </>
          )}
        </>
      )}

      {children}
    </svg>
  );
});
