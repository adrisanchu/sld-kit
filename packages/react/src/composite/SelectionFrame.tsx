import type { CSSProperties } from 'react';
import type { ChildLayout } from '@sld-kit/core';
import { DEFAULT_VIEW_STYLE, type SldViewStyle } from '../style';
import { frameGeometry } from './frameGeometry';

export interface SelectionFrameProps {
  child: ChildLayout;
  interactive?: boolean;
  /**
   * The child's colour class (e.g. a voltage bucket setting `--sld-pos`), put on
   * the root so a stylesheet can tint the frame — e.g.
   * `.sld-selection { --sld-selection-stroke: var(--sld-pos) }`. Paint is
   * unchanged unless a rule uses it.
   */
  colorClass?: string | null;
  /** Extra class(es) on the root `<g>`. */
  className?: string;
  /** Numbers come from `style.composite.selection`. */
  style?: SldViewStyle;
  onRotateStart?: (detail: { event: React.PointerEvent }) => void;
}

/**
 * Selection chrome for the active child, drawn in world coordinates (OUTSIDE
 * the child's transform): a rotated outline through `worldCorners`, corner dots
 * (visual only, no resize), and a Figma-style rotation handle — a small circle
 * offset from the top-edge midpoint along the rotated "up" direction.
 *
 * Styleable from the app (headless chrome):
 * - classes `sld-selection` (root, with `data-state="selected"`),
 *   `sld-selection-outline`, `sld-selection-corner`, `sld-selection-rotate`;
 * - CSS custom properties `--sld-selection-stroke` (colour, default the
 *   `text-primary` currentColor), `--sld-selection-width`, `--sld-selection-dash`
 *   (default the `style` numbers).
 */
export function SelectionFrame({
  child,
  interactive = true,
  colorClass = null,
  className,
  style = DEFAULT_VIEW_STYLE,
  onRotateStart
}: SelectionFrameProps) {
  const sel = style.composite.selection;
  const { corners, points, topMid, handle } = frameGeometry(child.worldCorners, sel.padding, sel.rotateHandleOffset);

  const stroke = 'var(--sld-selection-stroke, currentColor)';
  const outlineStyle: CSSProperties = {
    stroke,
    strokeWidth: `var(--sld-selection-width, ${sel.strokeWidth})`,
    strokeDasharray: `var(--sld-selection-dash, ${sel.dashArray})`
  };

  function handleRotateDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    onRotateStart?.({ event: e });
  }

  const rootClass = ['sld-selection text-primary pointer-events-none', colorClass, className].filter(Boolean).join(' ');

  return (
    <g className={rootClass} data-state="selected">
      <polygon points={points} fill="none" className="sld-selection-outline" style={outlineStyle} />
      {corners.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={sel.cornerRadius}
          className="sld-selection-corner fill-background"
          style={{ stroke }}
          strokeWidth={sel.strokeWidth}
        />
      ))}

      {/* Rotation handle */}
      <g className="sld-selection-rotate">
        <line
          x1={topMid.x}
          y1={topMid.y}
          x2={handle.x}
          y2={handle.y}
          style={{ stroke }}
          strokeWidth={sel.strokeWidth}
        />
        <circle
          cx={handle.x}
          cy={handle.y}
          r={sel.rotateHandleRadius}
          className={`fill-background${interactive ? ' pointer-events-auto cursor-grab' : ''}`}
          style={{ stroke }}
          strokeWidth={sel.strokeWidth}
          onPointerDown={handleRotateDown}
        />
      </g>
    </g>
  );
}
