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

  // Appearance, in world units — tune to taste per consumer. Defaults favour a
  // few large, calm dots gliding along a thin track (rather than a dense bead
  // chain that beats against the underlying wire).
  /** Width of the underlying "wire" the dots ride. */
  export let lineWidth: number = 2;
  /** Dot diameter at full intensity (round-capped). Larger than `lineWidth` so dots read as dots. */
  export let dotSize: number = 8;
  /** Spacing between dots along the path — larger = fewer dots. */
  export let dotSpacing: number = 46;
  /** Seconds for a dot to advance one `dotSpacing` at flow speed 1 — larger = slower. */
  export let baseDuration: number = 2;

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
      dotWidth: dotSize * (0.6 + 0.4 * intensity),
      dotOpacity: 0.75 + 0.25 * intensity,
      period: dotSpacing,
      duration: baseDuration / speed
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
        stroke-width={lineWidth}
        stroke-opacity={it.active ? 0.7 : 0.35}
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
