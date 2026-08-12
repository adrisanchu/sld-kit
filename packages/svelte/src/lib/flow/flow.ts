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

/**
 * A dynamic text label placed alongside a line, returned by a consumer's
 * {@link LineLabelResolver}. Domain-agnostic: the overlay only knows "draw this
 * text near this line"; what the text *is* (MW, a rating, an id, anything read
 * from `data`) is the consumer's policy, and it re-derives whenever the diagram
 * state changes — the label seam analogue of {@link FlowResolver}.
 */
export interface LineLabel {
  text: string;
  /** Position along the line as a fraction of its length, `0`–`1` (default `0.5`, the midpoint). */
  at?: number;
  /** Perpendicular offset from the line in world units (default clears the flow dots). */
  offset?: number;
  /** A CSS class setting `--sld-pos` for the text colour; omit for the default foreground. */
  className?: string;
}

/** Maps a {@link WorldLine} `key` to its {@link LineLabel}, or `null` for no label. */
export type LineLabelResolver = (lineKey: string) => LineLabel | null;
