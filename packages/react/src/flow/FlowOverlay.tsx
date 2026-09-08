import { useMemo } from 'react';
import type { WorldLine } from './worldLines';
import type { FlowResolver } from './flow';
import { useSldAnimations } from '../styles';

export interface FlowOverlayProps {
  lines?: WorldLine[];
  resolveFlow?: FlowResolver;
  /** Freeze all motion in place (e.g. the overlay scrolled offscreen). */
  paused?: boolean;
  /** Width of the underlying "wire" the dots ride. */
  lineWidth?: number;
  /** Dot diameter at full intensity (round-capped). Larger than `lineWidth` so dots read as dots. */
  dotSize?: number;
  /** Spacing between dots along the path — larger = fewer dots. */
  dotSpacing?: number;
  /** Seconds for a dot to advance one `dotSpacing` at flow speed 1 — larger = slower. */
  baseDuration?: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * A domain-agnostic overlay that animates travelling dots along polylines.
 * Meant to be dropped **inside** a composite/SLD `<svg>` (e.g. via
 * `CompositeCanvas`'s `children`), so its `points` must already be in the
 * canvas's world coordinates — pair it with `worldLines(layout)`.
 *
 * It knows nothing about what flows: the consumer's `resolveFlow(key)` maps a
 * line's stable key to a `FlowStyle` (active/direction/speed/intensity/color),
 * the same seam philosophy as `resolveElementFormat`. Motion is pure CSS
 * (`stroke-dashoffset` on a round-capped near-zero dash = a row of dots), so it
 * stays cheap for hundreds of lines and is trivially frozen for offscreen /
 * reduced-motion cases. It never touches SVG export (live view only).
 */
export function FlowOverlay({
  lines = [],
  resolveFlow = () => null,
  paused = false,
  lineWidth = 2,
  dotSize = 8,
  dotSpacing = 46,
  baseDuration = 2
}: FlowOverlayProps) {
  useSldAnimations();

  const items = useMemo(
    () =>
      lines.map((l) => {
        const s = resolveFlow(l.key);
        const dir = s?.direction ?? 1;
        const active = !!s && s.active && dir !== 0;
        const intensity = clamp01(s?.intensity ?? 1);
        const speed = Math.max(0.1, s?.speed ?? 1);
        return {
          key: l.key,
          pts: l.points.map((p) => `${p.x},${p.y}`).join(' '),
          colorClass: s?.colorClass ?? null,
          dashed: !!s?.dashed,
          active,
          dir,
          dotWidth: dotSize * (0.6 + 0.4 * intensity),
          dotOpacity: 0.75 + 0.25 * intensity,
          period: dotSpacing,
          duration: baseDuration / speed
        };
      }),
    [lines, resolveFlow, dotSize, dotSpacing, baseDuration]
  );

  return (
    <g className="pointer-events-none">
      {items.map((it) => (
        <g
          key={it.key}
          className={it.colorClass ?? undefined}
          style={it.colorClass ? { color: 'var(--sld-pos)' } : undefined}
        >
          {/* The underlying line: full color when flowing, greyed when not. */}
          <polyline
            points={it.pts}
            fill="none"
            stroke={it.colorClass ? 'currentColor' : undefined}
            className={it.colorClass ? undefined : it.active ? 'stroke-primary' : 'stroke-muted-foreground'}
            strokeWidth={lineWidth}
            strokeOpacity={it.active ? 0.7 : 0.35}
            strokeDasharray={it.dashed ? '6 4' : undefined}
          />
          {/* Travelling dots: a round-capped near-zero dash, marched by CSS. */}
          {it.active && (
            <polyline
              points={it.pts}
              fill="none"
              stroke={it.colorClass ? 'currentColor' : undefined}
              className={`sld-flow-dot ${paused ? 'sld-paused' : ''} ${it.colorClass ? '' : 'stroke-primary'}`}
              data-sld-anim
              strokeWidth={it.dotWidth}
              strokeLinecap="round"
              strokeOpacity={it.dotOpacity}
              strokeDasharray={`0.01 ${it.period}`}
              style={{
                // A custom property + two animation knobs; typed loosely since
                // React's CSSProperties doesn't know `--sld-flow-period`.
                ['--sld-flow-period' as string]: `${it.period}px`,
                animationDuration: `${it.duration}s`,
                animationDirection: it.dir < 0 ? 'reverse' : 'normal'
              }}
            />
          )}
        </g>
      ))}
    </g>
  );
}
