import { useMemo } from 'react';
import type { Point } from '@sld-kit/core';
import type { WorldLine } from './worldLines';
import type { LineLabelResolver } from './flow';

export interface LineLabelOverlayProps {
  lines?: WorldLine[];
  resolveLabel?: LineLabelResolver;
  /** Text size in world units. */
  fontSize?: number;
}

// Centred on the line by default: the opaque pill interrupts the line cleanly
// and it reads the same at any orientation. A non-zero `offset` pushes the
// label perpendicular (upward-biased) for a beside-the-line look.
const DEFAULT_OFFSET = 0;

/** Point at fraction `t` of the polyline, its local segment unit direction and normal. */
function place(points: Point[], t: number): { p: Point; dx: number; dy: number; nx: number; ny: number } {
  const segLen = points.slice(1).map((q, i) => Math.hypot(q.x - points[i].x, q.y - points[i].y));
  const total = segLen.reduce((a, b) => a + b, 0);
  let target = Math.max(0, Math.min(1, t)) * total;
  let i = 0;
  while (i < segLen.length - 1 && target > segLen[i]) {
    target -= segLen[i];
    i++;
  }
  const a = points[i];
  const b = points[i + 1] ?? points[i];
  const len = segLen[i] || 1;
  const f = len ? target / len : 0;
  const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  // Perpendicular to the segment, biased to point "up" (for a non-zero offset).
  let nx = -dy;
  let ny = dx;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { p, dx, dy, nx, ny };
}

/** Text rotation perpendicular to a segment, normalized to (-90, 90] so it reads upright. */
function perpendicularAngle(dx: number, dy: number): number {
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  ang = ((((ang + 180) % 360) + 360) % 360) - 180; // → (-180, 180]
  if (ang > 90) ang -= 180;
  else if (ang <= -90) ang += 180;
  return ang;
}

/**
 * Draws dynamic text labels alongside lines — the label analogue of
 * `FlowOverlay`. Meant to be dropped **inside** the composite `<svg>` (world
 * coordinates), paired with `worldLines(layout)`. Domain-agnostic: the
 * consumer's `resolveLabel(key)` decides each line's text (MW, a rating, an id,
 * a `data` field, …) and re-derives whenever the diagram state changes, so the
 * numbers stay live. By default a label reads **perpendicular to its line**
 * (with a readability flip so it's never upside-down); opt out per label with
 * `rotate: false`. A small pill gives contrast; pointer-transparent; live view
 * only.
 */
export function LineLabelOverlay({ lines = [], resolveLabel = () => null, fontSize = 13 }: LineLabelOverlayProps) {
  const items = useMemo(
    () =>
      lines.flatMap((l) => {
        const lbl = resolveLabel(l.key);
        if (!lbl || l.points.length < 2) return [];
        const { p, dx, dy, nx, ny } = place(l.points, lbl.at ?? 0.5);
        const off = lbl.offset ?? DEFAULT_OFFSET;
        const x = p.x + nx * off;
        const y = p.y + ny * off;
        const angle = typeof lbl.angle === 'number' ? lbl.angle : lbl.rotate === false ? 0 : perpendicularAngle(dx, dy);
        // Cheap text metrics (no DOM measure): enough to size the contrast pill.
        const w = lbl.text.length * fontSize * 0.6 + fontSize;
        const h = fontSize + fontSize * 0.5;
        return [{ key: l.key, text: lbl.text, className: lbl.className ?? null, x, y, w, h, angle }];
      }),
    [lines, resolveLabel, fontSize]
  );

  return (
    <g className="pointer-events-none">
      {items.map((it) => (
        <g
          key={it.key}
          className={it.className ?? undefined}
          style={it.className ? { color: 'var(--sld-pos)' } : undefined}
          transform={it.angle ? `rotate(${it.angle} ${it.x} ${it.y})` : undefined}
        >
          <rect
            x={it.x - it.w / 2}
            y={it.y - it.h / 2}
            width={it.w}
            height={it.h}
            rx={it.h / 2}
            className="fill-background/95 stroke-border"
            strokeWidth="0.75"
          />
          <text
            x={it.x}
            y={it.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fill={it.className ? 'currentColor' : undefined}
            className={it.className ? 'font-medium' : 'fill-foreground font-medium'}
          >
            {it.text}
          </text>
        </g>
      ))}
    </g>
  );
}
