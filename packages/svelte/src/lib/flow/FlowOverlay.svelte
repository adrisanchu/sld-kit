<script lang="ts">
  import type { WorldLine } from './worldLines';
  import type { FlowResolver } from './flow';

  /**
   * A domain-agnostic overlay that animates travelling dots along polylines.
   * Meant to be dropped **inside** a composite/SLD `<svg>` (e.g. via
   * `CompositeCanvas`'s default slot), so its `points` must already be in the
   * canvas's world coordinates — pair it with `worldLines(layout)`.
   *
   * It knows nothing about what flows: the consumer's `resolveFlow(key)` maps a
   * line's stable key to a `FlowStyle` (active/direction/speed/intensity/color),
   * the same seam philosophy as `resolveElementFormat`. Motion is pure CSS
   * (`stroke-dashoffset` on a round-capped near-zero dash = a row of dots), so it
   * stays cheap for hundreds of lines and is trivially frozen for offscreen /
   * reduced-motion cases. It never touches SVG export (live view only).
   */
  export let lines: WorldLine[] = [];
  export let resolveFlow: FlowResolver = () => null;
  /** Freeze all motion in place (e.g. the overlay scrolled offscreen). */
  export let paused: boolean = false;

  // Base geometry, in world units. Tunable but deliberately not exposed as props
  // yet — one look for all consumers until a need arises.
  const BASE_WIDTH = 1.5; // the underlying "wire"
  const DOT_SIZE = 5; // dot diameter at full intensity (= stroke width, round cap)
  const DOT_GAP = 22; // spacing between dots along the path
  const BASE_DURATION = 1.6; // seconds per dot-gap at speed 1

  const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

  $: items = lines.map((l) => {
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
      dotWidth: DOT_SIZE * (0.5 + 0.5 * intensity),
      dotOpacity: 0.55 + 0.45 * intensity,
      period: DOT_GAP,
      duration: BASE_DURATION / speed
    };
  });
</script>

<g class="pointer-events-none">
  {#each items as it (it.key)}
    <g class={it.colorClass ?? undefined} style={it.colorClass ? 'color: hsl(var(--sld-pos))' : undefined}>
      <!-- The underlying line: full color when flowing, greyed when not. -->
      <polyline
        points={it.pts}
        fill="none"
        stroke={it.colorClass ? 'currentColor' : undefined}
        class={it.colorClass ? undefined : it.active ? 'stroke-primary' : 'stroke-muted-foreground'}
        stroke-width={BASE_WIDTH}
        stroke-opacity={it.active ? 1 : 0.35}
        stroke-dasharray={it.dashed ? '6 4' : undefined}
      />
      <!-- Travelling dots: a round-capped near-zero dash, marched by CSS. -->
      {#if it.active}
        <polyline
          points={it.pts}
          fill="none"
          stroke={it.colorClass ? 'currentColor' : undefined}
          class="flow-dot {it.colorClass ? '' : 'stroke-primary'}"
          class:paused
          stroke-width={it.dotWidth}
          stroke-linecap="round"
          stroke-opacity={it.dotOpacity}
          stroke-dasharray="0.01 {it.period}"
          style="--flow-period: {it.period}px; animation-duration: {it.duration}s; animation-direction: {it.dir <
          0
            ? 'reverse'
            : 'normal'};"
        />
      {/if}
    </g>
  {/each}
</g>

<style>
  .flow-dot {
    animation-name: flow-dash;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }
  .flow-dot.paused {
    animation-play-state: paused;
  }
  @keyframes flow-dash {
    to {
      stroke-dashoffset: calc(-1 * var(--flow-period));
    }
  }
  /* Respect reduced-motion: dots stay as a static dotted line, no travel. */
  @media (prefers-reduced-motion: reduce) {
    .flow-dot {
      animation: none;
    }
  }
</style>
