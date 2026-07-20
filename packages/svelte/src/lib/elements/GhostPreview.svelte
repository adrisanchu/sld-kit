<script lang="ts">
  import type { Rect, PositionType } from '@sld-kit/core';
  import { SLD_LAYOUT } from '@sld-kit/core';
  import { DEFAULT_POSITION_TOKENS, type PositionTokens } from '../labels';

  /**
   * Translucent snapped preview of the position being placed or dragged.
   * Green-tinted outline when the drop is valid, red when rejected.
   */
  export let rect: Rect;
  export let valid: boolean = true;
  export let type: PositionType = 'line';
  /** CSS class per position type; the consumer's stylesheet supplies the colors. */
  export let tokens: PositionTokens = DEFAULT_POSITION_TOKENS;

  $: token = tokens[type];
  // Box centered in the slot rect, same maths as LayoutEngine.
  $: box = {
    x: rect.x + (rect.width - SLD_LAYOUT.positionBoxWidth) / 2,
    y: rect.y + (rect.height - SLD_LAYOUT.positionBoxHeight) / 2,
    width: SLD_LAYOUT.positionBoxWidth,
    height: SLD_LAYOUT.positionBoxHeight
  };
</script>

<g class="pointer-events-none {token}" opacity="0.7">
  <rect
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    rx={SLD_LAYOUT.positionCornerRadius}
    style="fill: hsl(var(--sld-pos) / 0.2);"
    stroke={valid ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)'}
    stroke-width="2"
    stroke-dasharray={valid ? undefined : '4 3'}
  />
</g>
