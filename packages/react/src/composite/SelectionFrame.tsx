import type { ChildLayout, Point } from '@sld-kit/core';

export interface SelectionFrameProps {
  child: ChildLayout;
  interactive?: boolean;
  onRotateStart?: (detail: { event: React.PointerEvent }) => void;
}

const HANDLE_OFFSET = 28;

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/**
 * Selection chrome for the active child, drawn in world coordinates (OUTSIDE
 * the child's transform): a rotated outline through `worldCorners`, corner dots
 * (visual only, no resize), and a Figma-style rotation handle — a small circle
 * offset from the top-edge midpoint along the rotated "up" direction.
 */
export function SelectionFrame({ child, interactive = true, onRotateStart }: SelectionFrameProps) {
  const corners = child.worldCorners; // [TL, TR, BR, BL]
  const polyPoints = corners.map((p) => `${p.x},${p.y}`).join(' ');

  const center: Point = {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  };
  const topMid: Point = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
  const up = normalize({ x: topMid.x - center.x, y: topMid.y - center.y });
  const handle: Point = { x: topMid.x + up.x * HANDLE_OFFSET, y: topMid.y + up.y * HANDLE_OFFSET };

  function handleRotateDown(e: React.PointerEvent) {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    onRotateStart?.({ event: e });
  }

  return (
    <g className="pointer-events-none">
      <polygon points={polyPoints} fill="none" className="stroke-primary" strokeWidth="1.5" strokeDasharray="6 4" />
      {corners.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3.5" className="fill-background stroke-primary" strokeWidth="1.5" />
      ))}

      {/* Rotation handle */}
      <line x1={topMid.x} y1={topMid.y} x2={handle.x} y2={handle.y} className="stroke-primary" strokeWidth="1.5" />
      <circle
        cx={handle.x}
        cy={handle.y}
        r="6"
        className={`fill-background stroke-primary ${interactive ? 'pointer-events-auto cursor-grab' : ''}`}
        strokeWidth="1.5"
        onPointerDown={handleRotateDown}
      />
    </g>
  );
}
