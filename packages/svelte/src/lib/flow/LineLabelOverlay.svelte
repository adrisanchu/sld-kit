<script lang="ts">
  import type { Point } from '@sld-kit/core';
  import type { WorldLine } from './worldLines';
  import type { LineLabelResolver } from './flow';

  /**
   * Draws dynamic text labels alongside lines — the label analogue of
   * `FlowOverlay`. Meant to be dropped **inside** the composite `<svg>` (world
   * coordinates), paired with `worldLines(layout)`. Domain-agnostic: the
   * consumer's `resolveLabel(key)` decides each line's text (MW, a rating, an id,
   * a `data` field, …) and re-derives whenever the diagram state changes, so the
   * numbers stay live. Labels are horizontal (numbers read best upright) with a
   * small pill for contrast, and pointer-transparent. Live view only.
   */
  export let lines: WorldLine[] = [];
  export let resolveLabel: LineLabelResolver = () => null;
  /** Text size in world units. */
  export let fontSize: number = 13;

  // Centred on the line by default: the opaque pill interrupts the line cleanly
  // and it reads the same at any orientation. A non-zero `offset` pushes the
  // label perpendicular (upward-biased) for a beside-the-line look.
  const DEFAULT_OFFSET = 0;

  /** Point at fraction `t` of the polyline plus an upward-biased perpendicular unit vector. */
  function place(points: Point[], t: number): { p: Point; nx: number; ny: number } {
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
    // Perpendicular to the segment, biased to point "up" so labels sit above the line.
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    return { p, nx, ny };
  }

  $: items = lines.flatMap((l) => {
    const lbl = resolveLabel(l.key);
    if (!lbl || l.points.length < 2) return [];
    const { p, nx, ny } = place(l.points, lbl.at ?? 0.5);
    const off = lbl.offset ?? DEFAULT_OFFSET;
    const x = p.x + nx * off;
    const y = p.y + ny * off;
    // Cheap text metrics (no DOM measure): enough to size the contrast pill.
    const w = lbl.text.length * fontSize * 0.6 + fontSize;
    const h = fontSize + fontSize * 0.5;
    return [{ key: l.key, text: lbl.text, className: lbl.className ?? null, x, y, w, h }];
  });
</script>

<g class="pointer-events-none">
  {#each items as it (it.key)}
    <g class={it.className ?? undefined} style={it.className ? 'color: hsl(var(--sld-pos))' : undefined}>
      <rect
        x={it.x - it.w / 2}
        y={it.y - it.h / 2}
        width={it.w}
        height={it.h}
        rx={it.h / 2}
        class="fill-background/95 stroke-border"
        stroke-width="0.75"
      />
      <text
        x={it.x}
        y={it.y}
        text-anchor="middle"
        dominant-baseline="central"
        font-size={fontSize}
        fill={it.className ? 'currentColor' : undefined}
        class={it.className ? 'font-medium' : 'fill-foreground font-medium'}
      >
        {it.text}
      </text>
    </g>
  {/each}
</g>
