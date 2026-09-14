import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CompositeLayout, ChildLayout } from '@sld-kit/core';
import { CompositeCanvas, type CompositeCanvasHandle } from './CompositeCanvas';
import { FlowOverlay } from '../flow/FlowOverlay';
import { LineLabelOverlay } from '../flow/LineLabelOverlay';
import { worldLines } from '../flow/worldLines';
import type { FlowResolver, LineLabelResolver } from '../flow/flow';
import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';

export interface CompositeExplorerProps {
  layout: CompositeLayout;
  /** Maps a `worldLines` key to its animated style; `null` hides that line's flow. */
  resolveFlow?: FlowResolver;
  /** Maps a `worldLines` key to a dynamic text label (e.g. MW / rating); `null` = none. */
  resolveLineLabel?: LineLabelResolver;
  /** Element `data` → `ElementFormat` overlay (e.g. overloaded = red), like the editor. */
  formatResolver?: FormatResolver | null;
  /** Freeze all flow motion (e.g. offscreen / reduced-motion handled by consumer). */
  paused?: boolean;
  /** Fly duration in ms for both fly-in and fly-out. */
  flyDurationMs?: number;
  tokens?: PositionTokens;
  childColorClass?: (child: ChildLayout) => string | null;
  /** Per-child connection-only colour override (e.g. leave lines neutral for the flow overlay). */
  childConnectionColorClass?: (child: ChildLayout) => string | null;
  style?: SldViewStyle;
  showPositionLabels?: boolean;
  showBusBarLabels?: boolean;
  showConnectionLabels?: boolean;
  showChildNames?: boolean;
  notFoundLabel?: string;
  /**
   * The child currently flown into, or `null` at the grid overview. Controlled
   * when provided (pair with `onFocusChange`); otherwise managed internally.
   */
  focusedId?: string | null;
  onFocusChange?: (detail: { id: string | null }) => void;
  onElementActivate?: (detail: { instanceId: string; elementId: string }) => void;
}

/** Imperative API, obtained with a `ref`. */
export interface CompositeExplorerHandle {
  /** Fly back out to the whole-grid overview. */
  blur(): void;
  zoomToFit(): void;
  zoomIn(): void;
  zoomOut(): void;
}

/**
 * A read-only, "operate & watch" view of a composite: pan/zoom the whole grid,
 * click a diagram to *fly into* it, then click its operable elements — all on
 * one seamless canvas (no route change, no dialog). A generic `FlowOverlay`
 * animates travelling dots along every line via the consumer's `resolveFlow`.
 *
 * Domain-agnostic: it reports `onElementActivate {instanceId, elementId}` and
 * `onFocusChange {id|null}`; what an activation *means* and what a line's flow
 * *is* are entirely the consumer's policy.
 */
export const CompositeExplorer = forwardRef<CompositeExplorerHandle, CompositeExplorerProps>(function CompositeExplorer(
  {
    layout,
    resolveFlow = () => null,
    resolveLineLabel = () => null,
    formatResolver = null,
    paused = false,
    flyDurationMs = 450,
    tokens = DEFAULT_POSITION_TOKENS,
    childColorClass = () => null,
    childConnectionColorClass,
    style = DEFAULT_VIEW_STYLE,
    showPositionLabels = true,
    showBusBarLabels = true,
    showConnectionLabels = true,
    showChildNames = true,
    notFoundLabel = DEFAULT_CHILD_NOT_FOUND,
    focusedId: focusedIdProp,
    onFocusChange,
    onElementActivate
  },
  ref
) {
  const canvasRef = useRef<CompositeCanvasHandle>(null);

  // Controlled if `focusedId` is supplied, otherwise internally managed.
  const [internalFocus, setInternalFocus] = useState<string | null>(null);
  const focusedId = focusedIdProp ?? internalFocus;
  const setFocus = (id: string | null) => {
    if (focusedIdProp === undefined) setInternalFocus(id);
    onFocusChange?.({ id });
  };

  const lines = useMemo(() => worldLines(layout), [layout]);

  function focusChild(id: string) {
    const child = layout.children.find((c) => c.instance.id === id);
    if (!child) return;
    setFocus(id);
    canvasRef.current?.flyTo(child.worldBounds, { durationMs: flyDurationMs });
  }

  function blur() {
    if (focusedId === null) return;
    setFocus(null);
    canvasRef.current?.flyToFit({ durationMs: flyDurationMs });
  }

  useImperativeHandle(
    ref,
    (): CompositeExplorerHandle => ({
      blur,
      zoomToFit: () => canvasRef.current?.zoomToFit(),
      zoomIn: () => canvasRef.current?.zoomIn(),
      zoomOut: () => canvasRef.current?.zoomOut()
    }),
    // `blur` closes over `focusedId`; re-create the handle when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusedId]
  );

  return (
    <CompositeCanvas
      ref={canvasRef}
      layout={layout}
      explore
      focusedId={focusedId}
      tokens={tokens}
      childColorClass={childColorClass}
      childConnectionColorClass={childConnectionColorClass}
      formatResolver={formatResolver}
      style={style}
      showPositionLabels={showPositionLabels}
      showBusBarLabels={showBusBarLabels}
      showConnectionLabels={showConnectionLabels}
      showChildNames={showChildNames}
      notFoundLabel={notFoundLabel}
      onChildFocus={(e) => focusChild(e.id)}
      onElementActivate={(e) => onElementActivate?.(e)}
      onClearSelection={() => blur()}
    >
      {/* On top of the children, sharing the same world viewBox. Pointer-transparent
          so clicks still reach the diagrams underneath. */}
      <FlowOverlay lines={lines} resolveFlow={resolveFlow} paused={paused} />
      <LineLabelOverlay lines={lines} resolveLabel={resolveLineLabel} />
    </CompositeCanvas>
  );
});
