import type { CSSProperties } from 'react';
import type { Rect } from '@sld-kit/core';
import type { SldViewStyle } from '../style';
import { bracketPaths, type FrameCorners } from '../composite/frameGeometry';

/**
 * The halo around a selected (or, with `hoverHalo`, hovered) bus bar or
 * position, mirroring the composite `SelectionFrame`'s parts:
 * - `sld-halo` (group, `data-state="selected" | "hover"`; the hover state is
 *   faded with a presentation `opacity`, which any CSS rule overrides);
 * - `sld-halo-body` — the element's own rect, unpainted (a hook for a wash);
 * - `sld-halo-outline` — the dashed rect `style.selection.padding` outside it,
 *   painted from `--sld-halo-stroke` (default the `text-primary` currentColor),
 *   `--sld-halo-width` and `--sld-halo-dash` (default `style.selection`);
 * - `sld-halo-corner` — L-shaped brackets on the outline (`corners="brackets"`),
 *   `style.selection.cornerArm` / `hoverCornerArm` long.
 * Rects take `rx` from CSS too (`.sld-halo-outline { rx: 6px }`).
 */
export function Halo({
  rect,
  rx,
  state,
  corners = 'none',
  style
}: {
  rect: Rect;
  rx?: number;
  state: 'selected' | 'hover';
  /** `brackets` adds corner brackets; `dots` / `none` draw none. */
  corners?: FrameCorners;
  style: SldViewStyle;
}) {
  const sel = style.selection;
  const paint: CSSProperties = {
    stroke: 'var(--sld-halo-stroke, currentColor)',
    strokeWidth: `var(--sld-halo-width, ${sel.strokeWidth})`,
    strokeDasharray: `var(--sld-halo-dash, ${sel.dashArray})`
  };
  const o = {
    x: rect.x - sel.padding,
    y: rect.y - sel.padding,
    width: rect.width + sel.padding * 2,
    height: rect.height + sel.padding * 2
  };
  const brackets =
    corners === 'brackets'
      ? bracketPaths(
          [
            { x: o.x, y: o.y },
            { x: o.x + o.width, y: o.y },
            { x: o.x + o.width, y: o.y + o.height },
            { x: o.x, y: o.y + o.height }
          ],
          state === 'hover' ? sel.hoverCornerArm : sel.cornerArm
        )
      : [];
  return (
    <g className="sld-halo text-primary" data-state={state} opacity={state === 'hover' ? 0.55 : undefined}>
      <rect {...rect} fill="none" className="sld-halo-body" />
      <rect {...o} rx={rx} fill="none" className="sld-halo-outline" style={paint} />
      {brackets.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          className="sld-halo-corner"
          style={{ stroke: 'var(--sld-halo-stroke, currentColor)' }}
          strokeWidth={sel.strokeWidth * 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
