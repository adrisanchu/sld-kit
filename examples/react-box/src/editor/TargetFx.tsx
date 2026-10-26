import { useEffect, useState } from 'react';
import type { Rect } from '@sld-kit/core';

/** What the pointer is over: a stable key (remounts → replays the entry), its world rect and tint. */
export interface Target {
  key: string;
  rect: Rect;
  /** Class setting `--sld-pos` (e.g. a voltage bucket); absent → the theme's primary. */
  colorClass?: string | null;
  /**
   * `lock` — corner brackets snap in over a marching-ants frame (boxes, bays).
   * `glow` — a soft halo swells around a thin bar (bus bars).
   */
  variant: 'lock' | 'glow';
}

/**
 * Hover affordance drawn in world coordinates inside a canvas (`children` slot):
 * it marks what a click would hit. Pure presentation — `pointer-events: none`,
 * no state of the document. The last target lingers with `data-on="false"` so
 * the CSS can fade it out instead of popping it away; a new target remounts
 * (keyed) and replays the entry animation. See `.sld-fx*` in `app.css`.
 */
export function TargetFx({ target }: { target: Target | null }) {
  // Keep the last target around for the exit transition.
  const [shown, setShown] = useState<Target | null>(target);
  useEffect(() => {
    if (target) setShown(target);
  }, [target]);
  const t = target ?? shown;
  if (!t) return null;
  const on = !!target;

  const { x, y, width: w, height: h } = t.rect;
  const tint = t.colorClass ?? 'sld-fx-primary';

  if (t.variant === 'glow') {
    const pad = 7;
    return (
      <g key={t.key} className={`sld-fx sld-fx-glow ${tint}`} data-on={on} pointerEvents="none">
        <rect className="sld-fx-halo" x={x - pad} y={y - pad} width={w + pad * 2} height={h + pad * 2} rx={pad} />
        <rect className="sld-fx-edge" x={x - 2.5} y={y - 2.5} width={w + 5} height={h + 5} rx={3} />
      </g>
    );
  }

  // Lock-on: a frame `pad` outside the target, plus four L-shaped brackets.
  const pad = 8;
  const fx = x - pad;
  const fy = y - pad;
  const fw = w + pad * 2;
  const fh = h + pad * 2;
  const arm = Math.min(14, fw / 4, fh / 4);
  const corners = [
    `M${fx},${fy + arm} V${fy} H${fx + arm}`,
    `M${fx + fw - arm},${fy} H${fx + fw} V${fy + arm}`,
    `M${fx + fw},${fy + fh - arm} V${fy + fh} H${fx + fw - arm}`,
    `M${fx + arm},${fy + fh} H${fx} V${fy + fh - arm}`
  ].join(' ');
  return (
    <g key={t.key} className={`sld-fx sld-fx-lock ${tint}`} data-on={on} pointerEvents="none">
      <rect className="sld-fx-wash" x={x} y={y} width={w} height={h} rx={4} />
      <rect className="sld-fx-ants" x={fx} y={fy} width={fw} height={fh} rx={6} />
      <path className="sld-fx-corners" d={corners} />
    </g>
  );
}
