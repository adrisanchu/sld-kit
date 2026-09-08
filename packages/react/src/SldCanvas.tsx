import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import type { SldDocument, DiagramLayout, Point } from '@sld-kit/core';
import { BusBarView } from './elements/BusBarView';
import { PositionView } from './elements/PositionView';
import { ConnectionView } from './elements/ConnectionView';
import { createPanZoom, type ViewBox } from './panzoom';
import { useStore } from './useStore';
import { DEFAULT_POSITION_TOKENS, type PositionTokens } from './labels';
import type { FormatResolver } from './format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from './style';

export interface SldCanvasProps {
  doc: SldDocument;
  layout: DiagramLayout;
  /**
   * Bump this when the document mutates so the element lists re-derive.
   * Pass the value from `useSldDocument(doc)` — the document mutates in place,
   * so its identity alone cannot signal a change.
   */
  version?: number;
  selectedIds?: Set<string>;
  interactive?: boolean;
  /** Id of the position currently being dragged (renders dimmed). */
  draggingId?: string | null;
  /** Extra cursor override while a tool is active (e.g. 'crosshair'). */
  cursor?: string;
  /**
   * Whether a plain drag pans the canvas: mouse left-drag on empty background,
   * or a single finger on touch. Set to `false` while a placement tool is
   * active so taps/clicks reach the tool instead of panning. Middle-button,
   * space+left, wheel, and two-finger pinch pan/zoom regardless.
   */
  panOnDrag?: boolean;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  tokens?: PositionTokens;
  /**
   * Overrides the per-type token with a single color class for the whole
   * diagram (e.g. a voltage bucket). The class must set `--sld-pos`.
   */
  colorClass?: string | null;
  /**
   * Generic per-element formatting overlay: `(el) => ElementFormat` (stroke
   * width / dash / fill opacity), threaded to every element view. The app owns
   * the policy (e.g. style by a `data` field); `null` (default) leaves rendering
   * unchanged. Pass the same function as the exporter's `theme.resolveElementFormat`.
   */
  formatResolver?: FormatResolver | null;
  /**
   * Numeric presentation config (stroke widths, opacities, selection halo),
   * forwarded to every element view. Defaults reproduce the Svelte adapter's
   * look; override via `resolveViewStyle({...})`.
   */
  style?: SldViewStyle;
  /** Label-visibility toggles, mapped to each element view's `showLabel`. */
  showPositionLabels?: boolean;
  showConnectionLabels?: boolean;
  showBusBarLabels?: boolean;
  /** Rendered first inside the `<svg>`, under all elements (grid/lane overlays). */
  background?: ReactNode;
  /** Rendered last inside the `<svg>`, on top of all elements (ghost, rubber band). */
  children?: ReactNode;

  onSelect?: (detail: { id: string; shiftKey: boolean }) => void;
  onClearSelection?: () => void;
  onElementDragStart?: (detail: { id: string; event: React.PointerEvent }) => void;
  onEditLabel?: (detail: { id: string }) => void;
  onCanvasDown?: (detail: { point: Point; event: React.PointerEvent }) => void;
  onCanvasMove?: (detail: { point: Point; event: React.PointerEvent }) => void;
  onCanvasUp?: (detail: { point: Point; event: React.PointerEvent }) => void;
}

/** Imperative API, obtained with a `ref` — the analogue of Svelte's `bind:this`. */
export interface SldCanvasHandle {
  /** Convert client (mouse) coordinates to SVG user coordinates. */
  clientToSvg(clientX: number, clientY: number): Point;
  /** Convert SVG user coordinates to client (screen) coordinates. */
  svgToClient(svgX: number, svgY: number): Point;
  /** Fit the whole diagram in view with 5% padding. */
  zoomToFit(): void;
  /** Zoom in/out one step about the current view centre (toolbar buttons). */
  zoomIn(): void;
  zoomOut(): void;
  /** Current viewBox, for callers that need to react to pan/zoom. */
  getViewBox(): ViewBox;
  /** The underlying `<svg>`, if mounted. */
  getSvgElement(): SVGSVGElement | null;
}

/**
 * SVG host of the diagram. Owns the viewBox (pan/zoom) and renders the element
 * views; all editing state lives in the parent editor, which receives
 * selection/drag intents as callbacks and passes results back via props.
 *
 * `background` renders under the elements and `children` above them — the two
 * slots the Svelte adapter exposes, where the editor injects grid slots, lane
 * chrome and the drag ghost.
 */
export const SldCanvas = forwardRef<SldCanvasHandle, SldCanvasProps>(function SldCanvas(
  {
    doc,
    layout,
    version = 0,
    selectedIds,
    interactive = true,
    draggingId = null,
    cursor = '',
    panOnDrag = true,
    tokens = DEFAULT_POSITION_TOKENS,
    colorClass = null,
    formatResolver = null,
    style = DEFAULT_VIEW_STYLE,
    showPositionLabels = true,
    showConnectionLabels = true,
    showBusBarLabels = true,
    background,
    children,
    onSelect,
    onClearSelection,
    onElementDragStart,
    onEditLabel,
    onCanvasDown,
    onCanvasMove,
    onCanvasUp
  },
  ref
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const suppressNextClick = useRef(false);

  // `layout` is read lazily through a ref so the pan/zoom instance stays stable
  // for the life of the canvas (recreating it would reset the viewBox).
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const pz = useMemo(
    () =>
      createPanZoom(
        () => svgRef.current,
        () => layoutRef.current.size
      ),
    []
  );

  const viewBox = useStore(pz.viewBox);
  const spaceDown = useStore(pz.spaceDown);
  const panning = useStore(pz.panning);

  const selection = selectedIds ?? EMPTY_SELECTION;

  // `version` looks redundant to the exhaustive-deps rule — it is not. `doc`
  // mutates in place, so its identity never changes; the counter from
  // `useSldDocument` is the only thing that says "the element lists moved".
  // Dropping it would leave the canvas painting a stale document.
  /* eslint-disable react-hooks/exhaustive-deps */
  const connectionItems = useMemo(
    () =>
      doc.connections().flatMap((el) => {
        const geo = layout.geometry.get(el.id);
        return geo?.kind === 'connection' ? [{ el, geo }] : [];
      }),
    [doc, layout, version]
  );
  const busBarItems = useMemo(
    () =>
      doc.busBars().flatMap((el) => {
        const geo = layout.geometry.get(el.id);
        return geo?.kind === 'busbar' ? [{ el, geo }] : [];
      }),
    [doc, layout, version]
  );
  const positionItems = useMemo(
    () =>
      doc.positions().flatMap((el) => {
        const geo = layout.geometry.get(el.id);
        return geo?.kind === 'position' ? [{ el, geo }] : [];
      }),
    [doc, layout, version]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  useImperativeHandle(
    ref,
    (): SldCanvasHandle => ({
      clientToSvg: (x, y) => pz.clientToSvg(x, y),
      svgToClient: (x, y) => pz.svgToClient(x, y),
      zoomToFit: () => pz.zoomToFit(),
      zoomIn: () => pz.zoomIn(),
      zoomOut: () => pz.zoomOut(),
      getViewBox: () => pz.viewBox.get(),
      getSvgElement: () => svgRef.current
    }),
    [pz]
  );

  // Fit once the <svg> has a measured size. Mirrors the Svelte onMount call.
  useEffect(() => {
    pz.zoomToFit();
  }, [pz]);

  // Wheel must be non-passive: React's synthetic onWheel cannot reliably
  // preventDefault, so Ctrl/Cmd+wheel would zoom the whole page instead.
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

  // Space is the pan modifier; it is a window-level concern (Svelte used <svelte:window>).
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (pz.tryStartPan(e.nativeEvent, { panOnDrag, background: e.target === svgRef.current })) return;
      if (e.button === 0) {
        onCanvasDown?.({ point: pz.clientToSvg(e.clientX, e.clientY), event: e });
      }
    },
    [pz, panOnDrag, onCanvasDown]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (pz.movePan(e.nativeEvent)) return;
      onCanvasMove?.({ point: pz.clientToSvg(e.clientX, e.clientY), event: e });
    },
    [pz, onCanvasMove]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const res = pz.endPan(e.nativeEvent);
      if (res.wasPanning) {
        // A drag-pan ends with a synthetic click on the background; swallow it
        // so the pan doesn't also clear the selection.
        suppressNextClick.current = res.moved;
        return;
      }
      onCanvasUp?.({ point: pz.clientToSvg(e.clientX, e.clientY), event: e });
    },
    [pz, onCanvasUp]
  );

  /** Click on empty background clears the selection (unless we just panned). */
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      if (e.target === svgRef.current) onClearSelection?.();
    },
    [onClearSelection]
  );

  const cursorClass = panning
    ? 'cursor-grabbing'
    : cursor === 'crosshair'
      ? 'cursor-crosshair'
      : spaceDown || panOnDrag
        ? 'cursor-grab'
        : '';

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
    >
      {background}
      {connectionItems.map(({ el, geo }) => (
        <ConnectionView
          key={el.id}
          conn={el}
          geo={geo}
          selected={selection.has(el.id)}
          interactive={interactive}
          colorClass={colorClass}
          formatResolver={formatResolver}
          style={style}
          showLabel={showConnectionLabels}
          onSelect={onSelect}
          onEditLabel={onEditLabel}
        />
      ))}
      {busBarItems.map(({ el, geo }) => (
        <BusBarView
          key={el.id}
          bar={el}
          geo={geo}
          selected={selection.has(el.id)}
          interactive={interactive}
          colorClass={colorClass}
          formatResolver={formatResolver}
          style={style}
          showLabel={showBusBarLabels}
          onSelect={onSelect}
          onEditLabel={onEditLabel}
        />
      ))}
      {positionItems.map(({ el, geo }) => (
        <PositionView
          key={el.id}
          pos={el}
          geo={geo}
          selected={selection.has(el.id)}
          dragging={draggingId === el.id}
          interactive={interactive}
          tokens={tokens}
          colorClass={colorClass}
          formatResolver={formatResolver}
          style={style}
          showLabel={showPositionLabels}
          onSelect={onSelect}
          onDragStart={onElementDragStart}
          onEditLabel={onEditLabel}
        />
      ))}
      {children}
    </svg>
  );
});

/** Stable empty set, so an omitted `selectedIds` doesn't churn memo deps. */
const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();
