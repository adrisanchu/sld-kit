/**
 * Presentation of one animated line, returned by a consumer's {@link FlowResolver}.
 * Domain-agnostic: the overlay knows nothing of what the flow *means* (power,
 * money, traffic, …) — the consumer maps its own data to these knobs, exactly
 * like `resolveElementFormat` maps element `data` to an `ElementFormat`.
 */
export interface FlowStyle {
  /** `false` → greyed, static, no travelling dots (e.g. an open/blocked line). */
  active: boolean;
  /** Travel direction along the polyline: `1` = start→end, `-1` = end→start, `0` = static. */
  direction?: 1 | -1 | 0;
  /** Relative speed; `1` is nominal, higher is faster (→ shorter animation duration). */
  speed?: number;
  /** Roughly 0–1: scales dot size and opacity (e.g. magnitude / capacity). */
  intensity?: number;
  /** Draw the base line dashed instead of solid (e.g. planned vs existing). */
  dashed?: boolean;
  /** A CSS class setting `--sld-pos` for the line + dot color; `null` = neutral. */
  colorClass?: string | null;
}

/** Maps a {@link WorldLine} `key` to its {@link FlowStyle}, or `null` to hide the flow. */
export type FlowResolver = (lineKey: string) => FlowStyle | null;
