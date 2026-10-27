import { useEffect, useState } from 'react';
import type { Point, Rect } from '@sld-kit/core';

/** What the pointer is over: a stable key (remounts → replays the entry), its world rect and tint. */
export interface Target {
  key: string;
  rect: Rect;
  /** Class setting `--sld-pos` (e.g. a voltage bucket); absent → the lock accent. */
  colorClass?: string | null;
  /**
   * `lock` — corner brackets over a dashed perimeter (boxes, bays).
   * `glow` — a soft halo swells around a thin bar (bus bars).
   */
  variant: 'lock' | 'glow';
}

export interface TargetFxProps {
  target: Target | null;
  /**
   * One perimeter, two intensities:
   * - `hover` ("scanning") — thin, translucent marching ants, light brackets.
   * - `selected` ("locked") — the same frame held still: bolder dashes, longer
   *   heavy brackets, a deeper wash, and a one-shot ping when it locks on.
   */
  mode?: 'hover' | 'selected';
  /** Selected + under the pointer: the locked frame comes alive (slow march). */
  hot?: boolean;
}

/**
 * Hover / selection affordance drawn in world coordinates inside a canvas
 * (`children` slot). Pure presentation — `pointer-events: none`. The last
 * target lingers with `data-on="false"` so the CSS fades it out instead of
 * popping it away; a new target remounts (keyed) and replays the entry. See
 * `.sld-fx*` in `app.css`.
 */
export function TargetFx({ target, mode = 'hover', hot = false }: TargetFxProps) {
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
  const attrs = { 'data-on': on, 'data-mode': mode, 'data-hot': hot, pointerEvents: 'none' as const };

  if (t.variant === 'glow') {
    const pad = mode === 'selected' ? 8 : 7;
    return (
      <g key={t.key} className={`sld-fx sld-fx-glow ${tint}`} {...attrs}>
        <rect className="sld-fx-halo" x={x - pad} y={y - pad} width={w + pad * 2} height={h + pad * 2} rx={pad} />
        <rect className="sld-fx-edge" x={x - 2.5} y={y - 2.5} width={w + 5} height={h + 5} rx={3} />
      </g>
    );
  }

  // Lock-on: a frame `pad` outside the target, plus four L-shaped brackets
  // (longer when locked, so the selected state reads at a glance).
  const pad = 8;
  const fx = x - pad;
  const fy = y - pad;
  const fw = w + pad * 2;
  const fh = h + pad * 2;
  const arm = Math.min(mode === 'selected' ? 22 : 14, fw / 3, fh / 3);
  const corners = [
    `M${fx},${fy + arm} V${fy} H${fx + arm}`,
    `M${fx + fw - arm},${fy} H${fx + fw} V${fy + arm}`,
    `M${fx + fw},${fy + fh - arm} V${fy + fh} H${fx + fw - arm}`,
    `M${fx + arm},${fy + fh} H${fx} V${fy + fh - arm}`
  ].join(' ');
  return (
    <g key={`${t.key}:${mode}`} className={`sld-fx sld-fx-lock ${tint}`} {...attrs}>
      <rect className="sld-fx-wash" x={x} y={y} width={w} height={h} rx={4} />
      {mode === 'selected' && <rect className="sld-fx-ping" x={fx} y={fy} width={fw} height={fh} rx={6} />}
      <rect className="sld-fx-ants" x={fx} y={fy} width={fw} height={fh} rx={6} />
      <path className="sld-fx-corners" d={corners} />
    </g>
  );
}

/**
 * The canvas end of a popover's tether: a small pinned ring at the point the
 * popover belongs to, with a slow radar ping, so it's clear what it edits.
 */
export function TargetPin({ at, colorClass }: { at: Point; colorClass?: string | null }) {
  return (
    <g className={`sld-fx sld-fx-pin ${colorClass ?? 'sld-fx-primary'}`} data-on pointerEvents="none">
      <circle className="sld-fx-pin-ping" cx={at.x} cy={at.y} r={7} />
      <circle className="sld-fx-pin-ring" cx={at.x} cy={at.y} r={6} />
      <circle className="sld-fx-pin-dot" cx={at.x} cy={at.y} r={2.5} />
    </g>
  );
}
