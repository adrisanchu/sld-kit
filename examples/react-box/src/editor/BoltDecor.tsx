import type { ChildLayout, Rect } from '@sld-kit/core';
import type { ChildDecor, ChildDecorView } from '@sld-kit/react';

/**
 * "Bolted to the board": how a locked substation looks, drawn through the
 * canvas's `childDecor` hook (screen only — the export never sees it).
 *
 * - A hard offset plate under the box (no blur), as if it were set into the
 *   board, while unlocked boxes keep floating as before.
 * - A padlock tab clipped to the top-right corner, a constant size on screen;
 *   when boxes get tiny (zoomed far out) it shrinks to a dot.
 * - Detail view: a faint hairline frame around the drawing, a fainter plate.
 *
 * Neutral ink only (`--sld-bolt`, see `app.css`): hue already means voltage,
 * dashes mean cables / open feeders, the accent + brackets mean selection.
 * Named "bolt" so it never reads as the selection's "target lock".
 */

/**
 * Plate offset (halved on tiny boxes, where 4px would swamp them), tab size,
 * dot size and the box width below which the tab becomes a dot (screen px).
 */
const PLATE_PX = 4;
const TAB_PX = 16;
const DOT_PX = 7;
const TINY_BOX_PX = 56;

export function boltDecor(
  child: ChildLayout,
  { pxPerUnit }: ChildDecorView,
  opts: { boxMode: boolean; shake: boolean }
): ChildDecor | null {
  if (!child.instance.locked || !(pxPerUnit > 0)) return null;
  const unit = 1 / pxPerUnit; // world units per screen px
  const asBox = opts.boxMode && !child.expanded;
  const view = asBox ? 'box' : 'detail';
  const frames: Rect[] = asBox ? (child.boxes?.map((b) => b.frame) ?? [child.frame]) : [child.frame];
  const transform = child.transform.toSvgTransform();
  // Detail drawings have no outline of their own: give the frame some air.
  const pad = asBox ? 0 : 8 * unit;
  const grow = (f: Rect): Rect => ({
    x: f.x - pad,
    y: f.y - pad,
    width: f.width + 2 * pad,
    height: f.height + 2 * pad
  });
  const radius = asBox ? 8 : 6;

  // The plate is the box shape shifted down-right, minus the box itself (even-odd),
  // so only the sliver it sticks out shows: the box fill is translucent, and a
  // plate seen through it would muddy the voltage colour.
  const wb = child.worldBounds;
  const tiny = wb.width * pxPerUnit < TINY_BOX_PX;
  const plate = (tiny ? PLATE_PX / 2 : PLATE_PX) * unit;
  const under = (
    <g transform={transform}>
      {frames.map(grow).map((f, i) => (
        <path
          key={i}
          d={`${roundedRect({ ...f, x: f.x + plate, y: f.y + plate }, radius)} ${roundedRect(f, radius)}`}
          fillRule="evenodd"
          className="sld-bolt-plate"
          data-view={view}
        />
      ))}
    </g>
  );

  // The tab sits on the top-right corner of the (padded) world bounds.
  const corner = { x: wb.x + wb.width + pad, y: wb.y - pad };
  const over = (
    <>
      {!asBox && (
        <g transform={transform}>
          {frames.map(grow).map((f, i) => (
            <rect key={i} x={f.x} y={f.y} width={f.width} height={f.height} rx={radius} className="sld-bolt-frame" />
          ))}
        </g>
      )}
      <g transform={`translate(${corner.x} ${corner.y}) scale(${unit})`}>
        <g className={opts.shake ? 'sld-bolt-shake' : undefined}>
          {tiny ? (
            <circle r={DOT_PX / 2} className="sld-bolt-tab sld-bolt-fill" />
          ) : (
            <g className="sld-bolt-tab">
              <rect x={-TAB_PX / 2} y={-TAB_PX / 2} width={TAB_PX} height={TAB_PX} rx={4} className="sld-bolt-fill" />
              {/* Padlock: shackle + body, cut out of the tab in the background colour. */}
              <path d="M -2.6 -1.2 V -3 a 2.6 2.6 0 0 1 5.2 0 V -1.2" className="sld-bolt-glyph" />
              <rect x={-4.2} y={-1.6} width={8.4} height={6} rx={1.2} className="sld-bolt-glyph-body" />
            </g>
          )}
        </g>
      </g>
    </>
  );
  return { under, over };
}

/** A rounded rectangle as a closed path (for the even-odd plate cut-out). */
function roundedRect({ x, y, width: w, height: h }: Rect, r: number): string {
  const k = Math.min(r, w / 2, h / 2);
  return (
    `M ${x + k} ${y} H ${x + w - k} A ${k} ${k} 0 0 1 ${x + w} ${y + k} V ${y + h - k} ` +
    `A ${k} ${k} 0 0 1 ${x + w - k} ${y + h} H ${x + k} A ${k} ${k} 0 0 1 ${x} ${y + h - k} ` +
    `V ${y + k} A ${k} ${k} 0 0 1 ${x + k} ${y} Z`
  );
}
