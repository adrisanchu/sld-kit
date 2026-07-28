import { SldParseError } from '../serialization/Serializer';
import { CompositeDocument, type CompositeMeta } from './CompositeDocument';
import { CompositeLine, type CompositeLineJson, type LineVertexJson } from './CompositeLine';
import { DiagramInstance, type DiagramInstanceJson } from './DiagramInstance';

export const COMPOSITE_SCHEMA_VERSION = 2;

export interface CompositeDocumentJson {
  version: number;
  kind: 'composite';
  meta: CompositeMeta;
  children: DiagramInstanceJson[];
  lines: CompositeLineJson[];
}

type Migration = (json: Record<string, unknown>) => Record<string, unknown>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const normalizeAngle = (a: number) => round2(((a % 360) + 360) % 360);

/**
 * JSON (de)serialization of composites — a sibling of `Serializer`, not an
 * extension of it. Extending `Serializer` was rejected: its migrations map is
 * keyed by version number only, so hosting a second document type there would
 * entangle two independent version timelines and force `fromJSON` to return a
 * union. A sibling with its own version, reusing `SldParseError`, costs less
 * and carries zero risk to the single-diagram path.
 *
 * Dangling `libraryId`s are legal — they render as placeholders.
 */
export class CompositeSerializer {
  private static migrations = new Map<number, Migration>();

  static registerMigration(fromVersion: number, migrate: Migration): void {
    this.migrations.set(fromVersion, migrate);
  }

  static toJSON(doc: CompositeDocument): CompositeDocumentJson {
    return {
      version: COMPOSITE_SCHEMA_VERSION,
      kind: 'composite',
      meta: { ...doc.meta },
      children: doc.allChildren().map((c) => ({
        id: c.id,
        libraryId: c.libraryId,
        x: round2(c.x),
        y: round2(c.y),
        angleDeg: normalizeAngle(c.angleDeg)
      })),
      lines: doc.allLines().map((l) => l.toJSON())
    };
  }

  static fromJSON(input: unknown): CompositeDocument {
    const json = this.validate(input);
    const doc = new CompositeDocument(json.meta);
    for (const child of json.children) doc.addChild(DiagramInstance.fromJSON(child));
    for (const line of json.lines) doc.addLine(CompositeLine.fromJSON(line));
    doc.meta.updatedAt = json.meta.updatedAt;
    return doc;
  }

  /** Validate (and migrate) unknown input into a well-formed composite JSON. */
  static validate(input: unknown): CompositeDocumentJson {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new SldParseError('Composite is not a valid JSON object');
    }
    let json = input as Record<string, unknown>;

    if (typeof json.version !== 'number' || !Number.isInteger(json.version)) {
      throw new SldParseError('Missing composite schema version number');
    }
    if (json.version > COMPOSITE_SCHEMA_VERSION) {
      throw new SldParseError(`Unsupported composite version ${json.version} (maximum: ${COMPOSITE_SCHEMA_VERSION})`);
    }
    while ((json.version as number) < COMPOSITE_SCHEMA_VERSION) {
      const migrate = this.migrations.get(json.version as number);
      if (!migrate) throw new SldParseError(`No migration available from version ${json.version}`);
      json = migrate(json);
    }

    if (json.kind !== 'composite') throw new SldParseError('Document is not a composite');

    const meta = json.meta as Record<string, unknown> | undefined;
    if (!meta || typeof meta !== 'object') throw new SldParseError('Missing meta block');
    if (typeof meta.id !== 'string' || !meta.id) throw new SldParseError('Invalid meta.id');
    if (typeof meta.name !== 'string') throw new SldParseError('Invalid meta.name');

    if (!Array.isArray(json.children)) throw new SldParseError('Missing child list');
    const rawChildren = json.children as Record<string, unknown>[];

    const ids = new Set<string>();
    const children: DiagramInstanceJson[] = [];
    for (const child of rawChildren) {
      if (typeof child?.id !== 'string' || !child.id) throw new SldParseError('Child without id');
      if (ids.has(child.id)) throw new SldParseError(`Duplicate child id: ${child.id}`);
      ids.add(child.id);
      if (typeof child.libraryId !== 'string' || !child.libraryId) {
        throw new SldParseError(`Child ${child.id}: invalid libraryId`);
      }
      if (!isFinite(child.x) || !isFinite(child.y) || !isFinite(child.angleDeg)) {
        throw new SldParseError(`Child ${child.id}: invalid transform`);
      }
      children.push({
        id: child.id,
        libraryId: child.libraryId,
        x: round2(child.x as number),
        y: round2(child.y as number),
        angleDeg: normalizeAngle(child.angleDeg as number)
      });
    }

    const lines = this.validateLines(json.lines);

    const now = new Date().toISOString();
    return {
      version: COMPOSITE_SCHEMA_VERSION,
      kind: 'composite',
      meta: {
        id: meta.id,
        name: meta.name,
        createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : now,
        updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : now
      },
      children,
      lines
    };
  }

  /**
   * Validate the manual-line list. Anchors may reference missing children —
   * like dangling `libraryId`s, they simply don't resolve at layout time.
   */
  private static validateLines(input: unknown): CompositeLineJson[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) throw new SldParseError('Invalid line list');

    const ids = new Set<string>();
    const lines: CompositeLineJson[] = [];
    for (const raw of input as Record<string, unknown>[]) {
      if (typeof raw?.id !== 'string' || !raw.id) throw new SldParseError('Line without id');
      if (ids.has(raw.id)) throw new SldParseError(`Duplicate line id: ${raw.id}`);
      ids.add(raw.id);
      if (!Array.isArray(raw.vertices) || raw.vertices.length < 2) {
        throw new SldParseError(`Line ${raw.id}: needs at least two vertices`);
      }
      const vertices: LineVertexJson[] = [];
      for (const v of raw.vertices as Record<string, unknown>[]) {
        if (v?.kind === 'point') {
          if (!isFinite(v.x) || !isFinite(v.y)) throw new SldParseError(`Line ${raw.id}: invalid point vertex`);
          vertices.push({ kind: 'point', x: round2(v.x as number), y: round2(v.y as number) });
        } else if (v?.kind === 'anchor') {
          if (typeof v.instanceId !== 'string' || !v.instanceId || typeof v.connectionId !== 'string' || !v.connectionId) {
            throw new SldParseError(`Line ${raw.id}: invalid anchor vertex`);
          }
          vertices.push({ kind: 'anchor', instanceId: v.instanceId, connectionId: v.connectionId });
        } else {
          throw new SldParseError(`Line ${raw.id}: unknown vertex kind`);
        }
      }
      lines.push({ id: raw.id, vertices });
    }
    return lines;
  }
}

function isFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// v1 → v2 added the manual-line list; older documents simply have none.
CompositeSerializer.registerMigration(1, (json) => ({ ...json, version: 2, lines: [] }));
