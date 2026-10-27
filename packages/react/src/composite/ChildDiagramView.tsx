import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { BoxSection, ChildLayout, Rect } from '@sld-kit/core';
import { BusBarView } from '../elements/BusBarView';
import { PositionView } from '../elements/PositionView';
import { ConnectionView } from '../elements/ConnectionView';
import { DEFAULT_POSITION_TOKENS, DEFAULT_CHILD_NOT_FOUND, type PositionTokens } from '../labels';
import type { FormatResolver } from '../format';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
import { useSldAnimations } from '../styles';

// Layout effect in the browser (no flash of the un-animated frame), plain effect
// on the server (where it never runs, without the SSR warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  /**
   * Box (grid-level) mode: render the child as a single colour-filled box with
   * its name centred instead of its full internals — the simplified SLD view.
   * A `focused` child (explore fly-in) still renders detailed, so zooming into a
   * box reveals the diagram underneath.
   */
  boxMode?: boolean;
  /** Secondary line under the box name (e.g. an integer bus ID). Box mode only. */
  /** Secondary line per box (e.g. bus ids); called with the box's `section` when the child is split. */
  boxSubLabel?: (child: ChildLayout, section?: BoxSection) => string | null;
  /** Fallback text when a child diagram can't be resolved. */
  notFoundLabel?: string;
  onChildDown?: (detail: { id: string; event: React.PointerEvent }) => void;
  /**
   * The pointer entered (`{ id, section? }`) or left (`null`) this child's hit
   * area. In box view a split child reports which section box it is over.
   * `CompositeCanvas` uses it to track hover; see its `onChildHover`.
   */
  onChildHover?: (detail: { id: string; section?: string } | null) => void;
  /** Explore mode: the user clicked this (non-focused) child to fly into it. */
  onChildFocus?: (detail: { id: string; event: React.PointerEvent }) => void;
  /** Explore mode: the user clicked an operable element inside the focused child. */
  onElementActivate?: (detail: { instanceId: string; elementId: string }) => void;
  /**
   * Animate a switch between box and detail display (an in-place expand, or the
   * box↔detail toggle): the old frame morphs into the new one while the new
   * content fades in. Default true; `prefers-reduced-motion` disables it.
   */
  animateMorph?: boolean;
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
  boxMode = false,
  boxSubLabel,
  notFoundLabel = DEFAULT_CHILD_NOT_FOUND,
  onChildDown,
  onChildHover,
  onChildFocus,
  onElementActivate,
  animateMorph = true
}: ChildDiagramViewProps) {
  useSldAnimations();

  const { instance, layout, labelAngleDeg } = child;
  const resolved = instance.resolved;
  // Box mode collapses the child to a single box — but a focused (flown-into)
  // child always renders detailed, so a box reveals its diagram on zoom-in.
  // An expanded child (core `layout(doc, { expanded })`) carries its detail layout.
  const boxDisplay = boxMode && !!resolved && !!layout && !child.expanded && !(explore && focused);

  // Box ↔ detail morph. When the display flips, remember the previous frame
  // size: a ghost outline shrinks/grows from it to the new frame (same centre)
  // while the new content fades in — the eye follows one shape throughout.
  const display = boxDisplay ? 'box' : 'detail';
  const prevRef = useRef<{ display: string; width: number; height: number } | null>(null);
  const [morph, setMorph] = useState<{ sx: number; sy: number; key: number } | null>(null);
  useIsoLayoutEffect(() => {
    const prev = prevRef.current;
    const { width, height } = child.frame;
    if (animateMorph && prev && prev.display !== display && width > 0 && height > 0) {
      setMorph({ sx: prev.width / width, sy: prev.height / height, key: Date.now() });
    }
    prevRef.current = { display, width, height };
  }, [display, child.frame, animateMorph]);
  const box = {
    strokeWidth: style.composite.boxStrokeWidth,
    fillOpacity: style.composite.boxFillOpacity,
    nameFontSize: style.composite.boxNameFontSize,
    idFontSize: style.composite.boxIdFontSize
  };
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

  const captureClass = interactive ? (explore ? 'cursor-pointer' : 'cursor-move') : '';

  function handleDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    if (explore) onChildFocus?.({ id: instance.id, event: e });
    else onChildDown?.({ id: instance.id, event: e });
  }

  return (
    <g transform={child.transform.toSvgTransform()} opacity={dimmed ? 0.3 : 1} className="sld-child">
      {/* The morph ghost: the previous frame's outline scaling into the new one. */}
      {morph && (
        <rect
          key={`ghost:${morph.key}`}
          x={child.frame.x}
          y={child.frame.y}
          width={child.frame.width}
          height={child.frame.height}
          rx={8}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          className={`sld-morph-ghost pointer-events-none ${colorClass ?? 'text-primary'}`}
          style={
            {
              color: colorClass ? 'var(--sld-pos)' : undefined,
              '--sld-sx': morph.sx,
              '--sld-sy': morph.sy
            } as CSSProperties
          }
          data-sld-anim
          onAnimationEnd={() => setMorph(null)}
        />
      )}
      <g key={morph ? `content:${morph.key}` : 'content'} className={morph ? 'sld-morph-in' : undefined} data-sld-anim>
      {boxDisplay ? (
        // Grid-level box(es): a saturated, colour-filled rounded rect with the
        // name and bus id centred in the voltage colour — big and bold so the
        // grid reads from afar (the reference look). A child split into bus
        // sections draws one box per section, joined by muted dashed ties.
        (() => {
          const textFill = colorClass ? 'var(--sld-pos)' : undefined;
          const textClass = colorClass ? 'font-bold' : 'fill-foreground font-bold';
          const renderBox = (frame: Rect, sub: string | null, key: string) => {
            const cx = frame.x + frame.width / 2;
            const cy = frame.y + frame.height / 2;
            return (
              <g key={key}>
                <rect
                  x={frame.x}
                  y={frame.y}
                  width={frame.width}
                  height={frame.height}
                  rx={8}
                  fill={colorClass ? 'var(--sld-pos)' : undefined}
                  fillOpacity={colorClass ? box.fillOpacity : undefined}
                  stroke={colorClass ? 'var(--sld-pos)' : undefined}
                  strokeWidth={box.strokeWidth}
                  className={colorClass ? undefined : 'fill-muted stroke-border'}
                />
                <g transform={labelAngleDeg ? `rotate(${labelAngleDeg} ${cx} ${cy})` : undefined}>
                  <text
                    x={cx}
                    y={cy + (sub ? -3 : box.nameFontSize * 0.35)}
                    textAnchor="middle"
                    fontSize={box.nameFontSize}
                    fill={textFill}
                    className={`pointer-events-none select-none ${textClass}`}
                  >
                    {child.name}
                  </text>
                  {sub && (
                    <text
                      x={cx}
                      y={cy + box.idFontSize + 2}
                      textAnchor="middle"
                      fontSize={box.idFontSize}
                      fill={textFill}
                      className={`pointer-events-none select-none ${textClass}`}
                    >
                      {sub}
                    </text>
                  )}
                </g>
              </g>
            );
          };
          return (
            <g className={colorClass ?? undefined}>
              {(child.ties ?? []).map((tie) => (
                <polyline
                  key={`tie:${tie.a}:${tie.b}`}
                  points={tie.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  strokeWidth={box.strokeWidth}
                  strokeDasharray="6 4"
                  className="stroke-muted-foreground"
                  strokeOpacity={0.6}
                />
              ))}
              {child.boxes
                ? child.boxes.map((b) => renderBox(b.frame, boxSubLabel?.(child, b.section) ?? null, b.key))
                : renderBox(child.frame, boxSubLabel?.(child) ?? null, 'box')}
            </g>
          );
        })()
      ) : resolved && layout ? (
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
              doc={resolved}
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
      </g>

      {/* Always-on diagram name at its chosen slot, larger + bold so it stands
          apart from element labels. Rides with the child's orientation plus the
          label's own rotation. Independent of the label-visibility toggles
          (issue #17); pointer-transparent so clicking it just selects the diagram.
          Suppressed in box mode, where the name is drawn centred inside the box. */}
      {showChildNames && !boxDisplay && (
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
          className={captureClass}
          onPointerDown={handleDown}
          onPointerEnter={() => onChildHover?.({ id: instance.id })}
          onPointerLeave={() => onChildHover?.(null)}
        />
      )}
      {/* Split box view: one capture rect per section box on top, so hover can
          tell which section the pointer is over (the gaps between boxes still
          hit the whole-frame rect underneath). */}
      {!(explore && focused) &&
        boxDisplay &&
        onChildHover &&
        child.boxes &&
        child.boxes.length > 1 &&
        child.boxes.map((b) => (
          <rect
            key={`hit:${b.key}`}
            x={b.frame.x}
            y={b.frame.y}
            width={b.frame.width}
            height={b.frame.height}
            fill="transparent"
            className={captureClass}
            onPointerDown={handleDown}
            onPointerEnter={() => onChildHover({ id: instance.id, section: b.key })}
            onPointerLeave={() => onChildHover(null)}
          />
        ))}
    </g>
  );
}
