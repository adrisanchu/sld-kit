import type { Point } from '@sld-kit/core';

/**
 * The canvas end of a popover's tether: a small pinned ring at the point the
 * popover belongs to, with a slow radar ping, so it's clear what it edits.
 * Drawn in world coordinates inside a canvas (`children` slot); see `.sld-fx-pin*`
 * in `app.css`.
 */
export function TargetPin({ at, colorClass }: { at: Point; colorClass?: string | null }) {
  return (
    <g className={`sld-fx sld-fx-pin ${colorClass ?? 'sld-fx-primary'}`} pointerEvents="none">
      <circle className="sld-fx-pin-ping" cx={at.x} cy={at.y} r={7} />
      <circle className="sld-fx-pin-ring" cx={at.x} cy={at.y} r={6} />
      <circle className="sld-fx-pin-dot" cx={at.x} cy={at.y} r={2.5} />
    </g>
  );
}
