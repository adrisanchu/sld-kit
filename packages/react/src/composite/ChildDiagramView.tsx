import { useMemo } from 'react';
import type { ChildLayout } from '@sld-kit/core';
import { BusBarView } from '../elements/BusBarView';
import { PositionView } from '../elements/PositionView';
import { ConnectionView } from '../elements/ConnectionView';
import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
import { useSldAnimations } from '../styles';

export interface ChildDiagramViewProps {
  child: ChildLayout;
  interactive?: boolean;
  /**
   * Explore mode (read-only transforms, operable internals). When set, a click
   * on a non-focused child fires `onChildFocus`; a `focused` child's positions
   * become interactive and fire `onElementActivate` instead of selecting the
   * whole child. Independent of the editor's `interactive` selection/drag path.
   */
  explore?: boolean;
  /** In explore mode, this child is the one flown into — its internals are live. */
  focused?: boolean;
  /** Fade this child back (e.g. it's not the one currently focused). */
  dimmed?: boolean;
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  tokens?: PositionTokens;
  /** Overrides the per-type token with a single color class for this child. */
  colorClass?: string | null;
  /**
   * Overrides `colorClass` for connections only, so a consumer can colour the
   * boxes/bars on one axis (e.g. voltage) while leaving the lines neutral for
   * another layer (e.g. a flow overlay). `undefined` = fall back to `colorClass`.
   */
  connectionColorClass?: string | null | undefined;
  /** Per-element overlay (stroke width + fill opacity), forwarded to each view. */
  formatResolver?: FormatResolver | null;
  /** Numeric presentation config, forwarded to each element view. */
  style?: SldViewStyle;
  showPositionLabels?: boolean;
  showBusBarLabels?: boolean;
  showConnectionLabels?: boolean;
  /** The always-on diagram name at the child's top-left (issue #17); on by default. */
  showChildNames?: boolean;
  /** Fallback text when a child diagram can't be resolved. */
  notFoundLabel?: string;
  onChildDown?: (detail: { id: string; event: React.PointerEvent }) => void;
  /** Explore mode: the user clicked this (non-focused) child to fly into it. */
  onChildFocus?: (detail: { id: string; event: React.PointerEvent }) => void;
  /** Explore mode: the user clicked an operable element inside the focused child. */
  onElementActivate?: (detail: { instanceId: string; elementId: string }) => void;
}

/**
 * Renders one placed child as a rigid whole inside its `Transform2D` group: the
 * child's own element views (read-only), with a transparent full-frame rect on
 * top capturing pointer events for whole-child selection/dragging. Selection
 * chrome lives OUTSIDE this transform (see SelectionFrame), in world coords.
 */
export function ChildDiagramView({
  child,
  interactive = true,
  explore = false,
  focused = false,
  dimmed = false,
  tokens = DEFAULT_POSITION_TOKENS,
  colorClass = null,
  connectionColorClass = undefined,
  formatResolver = null,
  style = DEFAULT_VIEW_STYLE,
  showPositionLabels = true,
  showBusBarLabels = true,
  showConnectionLabels = true,
  showChildNames = true,
  notFoundLabel = DEFAULT_CHILD_NOT_FOUND,
  onChildDown,
  onChildFocus,
  onElementActivate
}: ChildDiagramViewProps) {
  useSldAnimations();

  const { instance, layout, labelAngleDeg } = child;
  const resolved = instance.resolved;
  // Connections fall back to the child's colorClass unless explicitly overridden.
  const connColor = connectionColorClass === undefined ? colorClass : connectionColorClass;

  // Join each element list against the layout geometry, narrowing by `geo.kind`
  // (same pattern as SldCanvas). A child's document is immutable once resolved,
  // so `layout`/`resolved` identity is a sufficient memo key.
  const connectionItems = useMemo(
    () =>
      layout && resolved
        ? resolved.connections().flatMap((el) => {
            const geo = layout.geometry.get(el.id);
            return geo?.kind === 'connection' ? [{ el, geo }] : [];
          })
        : [],
    [layout, resolved]
  );
  const busBarItems = useMemo(
    () =>
      layout && resolved
        ? resolved.busBars().flatMap((el) => {
            const geo = layout.geometry.get(el.id);
            return geo?.kind === 'busbar' ? [{ el, geo }] : [];
          })
        : [],
    [layout, resolved]
  );
  const positionItems = useMemo(
    () =>
      layout && resolved
        ? resolved.positions().flatMap((el) => {
            const geo = layout.geometry.get(el.id);
            return geo?.kind === 'position' ? [{ el, geo }] : [];
          })
        : [],
    [layout, resolved]
  );

  function handleDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    if (explore) onChildFocus?.({ id: instance.id, event: e });
    else onChildDown?.({ id: instance.id, event: e });
  }

  return (
    <g transform={child.transform.toSvgTransform()} opacity={dimmed ? 0.3 : 1} className="sld-child">
      {resolved && layout ? (
        <>
          {connectionItems.map(({ el, geo }) => (
            <ConnectionView
              key={el.id}
              conn={el}
              geo={geo}
              interactive={false}
              labelAngleDeg={labelAngleDeg}
              colorClass={connColor}
              formatResolver={formatResolver}
              style={style}
              showLabel={showConnectionLabels}
            />
          ))}
          {busBarItems.map(({ el, geo }) => (
            <BusBarView
              key={el.id}
              bar={el}
              geo={geo}
              interactive={false}
              labelAngleDeg={labelAngleDeg}
              colorClass={colorClass}
              formatResolver={formatResolver}
              style={style}
              showLabel={showBusBarLabels}
            />
          ))}
          {positionItems.map(({ el, geo }) => (
            <PositionView
              key={el.id}
              pos={el}
              geo={geo}
              interactive={explore && focused}
              labelAngleDeg={labelAngleDeg}
              tokens={tokens}
              colorClass={colorClass}
              formatResolver={formatResolver}
              style={style}
              showLabel={showPositionLabels}
              onSelect={() => onElementActivate?.({ instanceId: instance.id, elementId: el.id })}
            />
          ))}
        </>
      ) : (
        // Placeholder for a missing/corrupt child.
        <>
          <rect
            x={child.frame.x}
            y={child.frame.y}
            width={child.frame.width}
            height={child.frame.height}
            rx="8"
            fill="none"
            className="stroke-muted-foreground"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
          <text
            x={child.frame.x + child.frame.width / 2}
            y={child.frame.height / 2 - 8}
            textAnchor="middle"
            fontSize="16"
            className="select-none fill-muted-foreground font-medium"
          >
            {notFoundLabel}
          </text>
          <text
            x={child.frame.x + child.frame.width / 2}
            y={child.frame.height / 2 + 14}
            textAnchor="middle"
            fontSize="13"
            className="select-none fill-muted-foreground"
          >
            {instance.libraryId}
          </text>
        </>
      )}

      {/* Always-on diagram name at its chosen slot, larger + bold so it stands
          apart from element labels. Rides with the child's orientation plus the
          label's own rotation. Independent of the label-visibility toggles
          (issue #17); pointer-transparent so clicking it just selects the diagram. */}
      {showChildNames && (
        <text
          x={child.nameLabel.x}
          y={child.nameLabel.y}
          textAnchor={child.nameLabel.textAnchor}
          fontSize={child.nameLabel.fontSize}
          transform={`rotate(${child.nameLabel.rotation} ${child.nameLabel.x} ${child.nameLabel.y})`}
          className="pointer-events-none select-none fill-foreground font-bold"
        >
          {child.name}
        </text>
      )}

      {/* Transparent capture rect for whole-child pointer interaction. In explore
          mode it selects the child to fly into (childfocus); the editor uses it
          for select/drag (childdown). Dropped for the focused child so its
          internal positions receive the clicks directly. */}
      {!(explore && focused) && (
        <rect
          x={child.frame.x}
          y={child.frame.y}
          width={child.frame.width}
          height={child.frame.height}
          fill="transparent"
          className={interactive ? (explore ? 'cursor-pointer' : 'cursor-move') : ''}
          onPointerDown={handleDown}
        />
      )}
    </g>
  );
}
