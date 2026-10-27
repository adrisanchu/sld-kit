import type { CSSProperties } from 'react';
import type { Rect } from '@sld-kit/core';
import type { SldViewStyle } from '../style';

/**
 * The dashed halo around a selected (or, with `hoverHalo`, hovered) bus bar or
 * position. Class `sld-halo` + `data-state`; paint from the CSS custom
 * properties `--sld-halo-stroke` (default the `text-primary` currentColor),
 * `--sld-halo-width` and `--sld-halo-dash` (default `style.selection`). The
 * hover state is faded with a presentation `opacity`, which any CSS rule overrides.
 */
export function Halo({
  rect,
  rx,
  state,
  style
}: {
  rect: Rect;
  rx?: number;
  state: 'selected' | 'hover';
  style: SldViewStyle;
}) {
  const sel = style.selection;
  const paint: CSSProperties = {
    stroke: 'var(--sld-halo-stroke, currentColor)',
    strokeWidth: `var(--sld-halo-width, ${sel.strokeWidth})`,
    strokeDasharray: `var(--sld-halo-dash, ${sel.dashArray})`
  };
  return (
    <rect
      x={rect.x - sel.padding}
      y={rect.y - sel.padding}
      width={rect.width + sel.padding * 2}
      height={rect.height + sel.padding * 2}
      rx={rx}
      fill="none"
      className="sld-halo text-primary"
      data-state={state}
      opacity={state === 'hover' ? 0.55 : undefined}
      style={paint}
    />
  );
}
