import { newId } from '../ids';
import { cloneData } from '../elements/Element';
import type { LineRouting } from './routing';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One vertex of a manual composite line.
 *
 * - `anchor` references a child's external connection dot by
 *   `(instanceId, connectionId)` and resolves to a world point at layout time,
 *   so it follows the child when it moves or rotates — the "reference by id,
 *   never by geometry" invariant the single-diagram model uses.
 * - `rel` is a free bend stored **relative to the line's anchored endpoints**:
 *   `t` is a fraction along the chord spanned by the line's first and last
 *   resolvable anchor tips and `(ox, oy)` is a frozen world-space offset from
 *   that chord point (see `lineFrame.ts`). Because the chord is rebuilt every
 *   layout, a `rel` bend translates with its endpoints — it never desyncs when a
 *   child moves or the layout config changes (e.g. label-mode compaction), and
 *   the world-space offset means it never rotates as the chord tilts.
 * - `point` is a free bend fixed in absolute composite coordinates. It's the
 *   fallback for lines that lack two anchored ends (no chord to be relative to),
 *   and the legacy shape for documents authored before `rel` existed.
 */
export type LineVertexJson =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'rel'; t: number; ox: number; oy: number }
  | { kind: 'anchor'; instanceId: string; connectionId: string };

/**
 * The functional type of a composite line — drives its stroke style and any
 * structural glyph the layout places on it. Open string, mirroring
 * `PositionType`: the five defaults seed autocompletion, but any non-empty
 * string is accepted and renders as a plain solid line.
 *
 *  - `line` — overhead line: a plain solid stroke (the default).
 *  - `cable` — underground cable: a dashed stroke.
 *  - `transformer` — a solid stroke with the two-circle transformer glyph at
 *    its midpoint.
 *  - `transformer3w` — the same, with the three-circle three-winding
 *    transformer glyph.
 *  - `demand` — a solid stroke ending in a filled triangle (a simplified
 *    distribution demand) at its free (non-anchored) end.
 */
export type CompositeLineKind = 'line' | 'cable' | 'transformer' | 'transformer3w' | 'demand' | (string & {});

export const DEFAULT_LINE_KIND: CompositeLineKind = 'line';

/**
 * How a line's name reads relative to the line it labels:
 *  - `parallel` — along the segment it sits on, a small gap off the stroke;
 *  - `perpendicular` — across the segment, growing away from the line;
 *  - `horizontal` — never rotated, placed beside the line.
 * Rotated text is always flipped to read left→right (bottom→top when vertical).
 */
export type LineNameOrientation = 'parallel' | 'perpendicular' | 'horizontal';
/** Where along the line its name sits, in reading order (left→right, bottom→top). */
export type LineNameAlong = 'start' | 'middle' | 'end';
/** Which side of the line its name sits on, relative to the reading direction. */
export type LineNameSide = 'above' | 'below';

export const LINE_NAME_ORIENTATIONS: readonly LineNameOrientation[] = ['parallel', 'perpendicular', 'horizontal'];
export const LINE_NAME_ALONGS: readonly LineNameAlong[] = ['start', 'middle', 'end'];
export const LINE_NAME_SIDES: readonly LineNameSide[] = ['above', 'below'];

/**
 * Slot + orientation of a line's name label — the line analogue of a child's
 * `LabelPlacement`. Measured in the line's *reading* frame, never in vertex
 * order, so swapping the two diagrams it joins keeps the label where it was
 * visually and still readable.
 */
export interface LineNamePlacement {
  along: LineNameAlong;
  side: LineNameSide;
  orientation: LineNameOrientation;
}

export const DEFAULT_LINE_NAME_PLACEMENT: LineNamePlacement = { along: 'middle', side: 'above', orientation: 'parallel' };

/** A line's name plus its placement, as one unit (see `SetLineNameCommand`). Absent `name` = unnamed. */
export interface LineName {
  name?: string;
  placement?: LineNamePlacement;
}

/** The ends of an auto-link {@link CompositeLine.fromLink} materializes (structurally a `CompositeLink`). */
export interface LinkEnds {
  connectionId: string;
  a: { instanceId: string };
  b: { instanceId: string };
}

export interface CompositeLineJson {
  /** Line id — unique within the composite (namespaced separately from children). */
  id: string;
  /** Functional type; drives stroke style + glyph. Default `line`. */
  kind?: CompositeLineKind;
  /**
   * Drawing style for the stored vertices. Absent → the composite's
   * `meta.defaultRouting` (itself defaulting to `straight`). See {@link LineRouting}.
   */
  routing?: LineRouting;
  /** Ordered vertices of the polyline; at least two. */
  vertices: LineVertexJson[];
  /**
   * Opaque consumer-owned metadata (e.g. ratings from an electrical model),
   * mirroring `SldElement.data`: roundtripped (deep-copied) but never read by the
   * library. Must be structured-cloneable. Feed it to the layout's `lineLabels`
   * resolver to show numeric labels.
   */
  data?: unknown;
  /**
   * The line's own name (e.g. `L-400 kV West-South 1`), drawn along the line by
   * the layout. Absent → no name label. Never empty.
   */
  name?: string;
  /** Where the name sits; absent → {@link DEFAULT_LINE_NAME_PLACEMENT}. Ignored without `name`. */
  namePlacement?: LineNamePlacement;
}

/**
 * A manually-drawn line placed in a composite: a first-class sibling of
 * `DiagramInstance`. It is a straight-segment polyline (no curves) whose
 * endpoints may be anchored to children's connection dots. When a line anchors
 * a connection id, the composite auto-link for that id is suppressed — the
 * manual line takes precedence (see `CompositeLayoutEngine`).
 *
 * Mutations are low-level and meant to be called ONLY by commands.
 */
export class CompositeLine {
  constructor(
    public readonly id: string,
    public vertices: LineVertexJson[],
    /** Functional type; drives stroke style + glyph. Default `line` (overhead). */
    public kind: CompositeLineKind = DEFAULT_LINE_KIND,
    /** Drawing style; `undefined` inherits the composite's `defaultRouting`. */
    public routing?: LineRouting,
    /** Opaque consumer metadata — roundtripped, never read (see {@link CompositeLineJson.data}). */
    public data?: unknown,
    /** The line's own name; `undefined` (or empty) = unnamed (see {@link CompositeLineJson.name}). */
    public name?: string,
    /** Name placement; `undefined` = {@link DEFAULT_LINE_NAME_PLACEMENT}. */
    public namePlacement?: LineNamePlacement
  ) {
    if (!this.name) this.name = undefined;
  }

  /**
   * Materialize an auto-link as a manual line: a straight line anchored at both
   * children's shared feeder, which suppresses (and visually replaces) the
   * auto-link. Its id defaults to the shared connection id — the line's own
   * identity — so naming an auto-link gives it a stable, meaningful id.
   */
  static fromLink(
    link: LinkEnds,
    opts: { id?: string; name?: string; namePlacement?: LineNamePlacement } = {}
  ): CompositeLine {
    return new CompositeLine(
      opts.id ?? link.connectionId,
      [
        { kind: 'anchor', instanceId: link.a.instanceId, connectionId: link.connectionId },
        { kind: 'anchor', instanceId: link.b.instanceId, connectionId: link.connectionId }
      ],
      DEFAULT_LINE_KIND,
      undefined,
      undefined,
      opts.name,
      opts.namePlacement ? { ...opts.namePlacement } : undefined
    );
  }

  /** Connection ids this line claims via anchor vertices (drives auto-link suppression). */
  anchoredConnectionIds(): Set<string> {
    const ids = new Set<string>();
    for (const v of this.vertices) if (v.kind === 'anchor') ids.add(v.connectionId);
    return ids;
  }

  toJSON(): CompositeLineJson {
    return {
      id: this.id,
      kind: this.kind,
      ...(this.routing !== undefined ? { routing: this.routing } : {}),
      vertices: this.vertices.map((v) =>
        v.kind === 'point'
          ? { kind: 'point', x: round2(v.x), y: round2(v.y) }
          : v.kind === 'rel'
            ? { kind: 'rel', t: round2(v.t), ox: round2(v.ox), oy: round2(v.oy) }
            : { kind: 'anchor', instanceId: v.instanceId, connectionId: v.connectionId }
      ),
      ...(this.data !== undefined ? { data: cloneData(this.data) } : {}),
      ...(this.name ? { name: this.name } : {}),
      ...(this.name && this.namePlacement ? { namePlacement: { ...this.namePlacement } } : {})
    };
  }

  static fromJSON(json: CompositeLineJson): CompositeLine {
    return new CompositeLine(
      json.id ?? newId(),
      json.vertices,
      json.kind ?? DEFAULT_LINE_KIND,
      json.routing,
      cloneData(json.data),
      json.name,
      json.namePlacement ? { ...json.namePlacement } : undefined
    );
  }
}
