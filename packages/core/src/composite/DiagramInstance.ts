import { SldDocument } from '../SldDocument';
import { Serializer, SldParseError } from '../serialization/Serializer';
import { newId } from '../ids';
import type { DocumentResolver } from './DocumentResolver';

export interface DiagramInstanceJson {
  /** Instance id — unique within the composite (distinct from `libraryId`). */
  id: string;
  libraryId: string;
  x: number;
  y: number;
  /** Rotation about the child's center, normalized to [0, 360). */
  angleDeg: number;
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
    public angleDeg: number
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
      angleDeg: this.angleDeg
    };
  }

  static fromJSON(json: DiagramInstanceJson): DiagramInstance {
    return new DiagramInstance(json.id ?? newId(), json.libraryId, json.x, json.y, json.angleDeg);
  }
}
