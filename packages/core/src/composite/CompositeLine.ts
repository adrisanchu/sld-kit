import { newId } from '../ids';

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

export interface CompositeLineJson {
  /** Line id — unique within the composite (namespaced separately from children). */
  id: string;
  /** Ordered vertices of the polyline; at least two. */
  vertices: LineVertexJson[];
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
    public vertices: LineVertexJson[]
  ) {}

  /** Connection ids this line claims via anchor vertices (drives auto-link suppression). */
  anchoredConnectionIds(): Set<string> {
    const ids = new Set<string>();
    for (const v of this.vertices) if (v.kind === 'anchor') ids.add(v.connectionId);
    return ids;
  }

  toJSON(): CompositeLineJson {
    return {
      id: this.id,
      vertices: this.vertices.map((v) =>
        v.kind === 'point'
          ? { kind: 'point', x: round2(v.x), y: round2(v.y) }
          : v.kind === 'rel'
            ? { kind: 'rel', t: round2(v.t), ox: round2(v.ox), oy: round2(v.oy) }
            : { kind: 'anchor', instanceId: v.instanceId, connectionId: v.connectionId }
      )
    };
  }

  static fromJSON(json: CompositeLineJson): CompositeLine {
    return new CompositeLine(json.id ?? newId(), json.vertices);
  }
}
