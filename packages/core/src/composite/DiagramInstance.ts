import { SldDocument } from '../SldDocument';
import { Serializer, SldParseError } from '../serialization/Serializer';
import { newId } from '../ids';
import type { DocumentResolver } from './DocumentResolver';

/**
 * One of eight discrete slots on the child's frame the always-on name label
 * snaps to, named `{vertical}-{horizontal}`. Semantic to the child's *own* frame
 * (top = the diagram's top edge), so the label rides with the child's rotation —
 * "top-left" stays the diagram's own top-left corner whatever its `angleDeg`.
 * (`center-center` is intentionally omitted — a name over the diagram body.)
 */
export type LabelAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const LABEL_ANCHORS: readonly LabelAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
] as const;

const DEFAULT_LABEL_ANCHOR: LabelAnchor = 'top-left';

/** Normalize any number to the nearest quarter turn in [0, 360): 0 | 90 | 180 | 270. */
export function normalizeQuarterTurn(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
}

export interface DiagramInstanceJson {
  /** Instance id — unique within the composite (distinct from `libraryId`). */
  id: string;
  libraryId: string;
  x: number;
  y: number;
  /** Rotation about the child's center, normalized to [0, 360). */
  angleDeg: number;
  /** Slot the name label snaps to on the child's frame (default `top-left`). */
  labelAnchor?: LabelAnchor;
  /**
   * Extra rotation of the name label relative to the child, in quarter turns
   * (0 | 90 | 180 | 270). Lets the name read along a different axis than the
   * diagram (e.g. vertical). Default 0.
   */
  labelDirection?: number;
}

/**
 * One placed child inside a composite: a live reference to a library diagram
 * (`libraryId`) plus a rigid transform (x, y, angleDeg).
 *
 * Instances carry their own id — the same library diagram may be placed twice,
 * and commands/selection need a stable per-composite key.
 */
export class DiagramInstance {
  /** Resolved at open time; null = missing/corrupt child → placeholder. */
  resolved: SldDocument | null = null;
  resolveAttempted = false;

  constructor(
    public readonly id: string,
    public readonly libraryId: string,
    public x: number,
    public y: number,
    public angleDeg: number,
    /** Name-label slot (default `top-left`). */
    public labelAnchor: LabelAnchor = DEFAULT_LABEL_ANCHOR,
    /** Name-label extra rotation in quarter turns (default 0). */
    public labelDirection: number = 0
  ) {}

  /**
   * Resolve the referenced library document once. A missing child, a corrupt
   * one (`SldParseError`), or a child that is itself a composite all degrade to
   * `resolved = null` (placeholder) rather than breaking the composite.
   */
  resolve(resolver: DocumentResolver): void {
    this.resolveAttempted = true;
    const json = resolver.resolve(this.libraryId);
    if (!json || (json as { kind?: string }).kind === 'composite') {
      this.resolved = null;
      return;
    }
    try {
      this.resolved = Serializer.fromJSON(json);
    } catch (err) {
      if (err instanceof SldParseError) {
        this.resolved = null;
        return;
      }
      throw err;
    }
  }

  toJSON(): DiagramInstanceJson {
    return {
      id: this.id,
      libraryId: this.libraryId,
      x: this.x,
      y: this.y,
      angleDeg: this.angleDeg,
      labelAnchor: this.labelAnchor,
      labelDirection: this.labelDirection
    };
  }

  static fromJSON(json: DiagramInstanceJson): DiagramInstance {
    return new DiagramInstance(
      json.id ?? newId(),
      json.libraryId,
      json.x,
      json.y,
      json.angleDeg,
      json.labelAnchor ?? DEFAULT_LABEL_ANCHOR,
      normalizeQuarterTurn(json.labelDirection ?? 0)
    );
  }
}
