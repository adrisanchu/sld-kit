import { SldParseError } from '../serialization/Serializer';
import { CompositeDocument, type CompositeMeta } from './CompositeDocument';
import { DiagramInstance, type DiagramInstanceJson } from './DiagramInstance';

export const COMPOSITE_SCHEMA_VERSION = 1;

export interface CompositeDocumentJson {
  version: number;
  kind: 'composite';
  meta: CompositeMeta;
  children: DiagramInstanceJson[];
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
      }))
    };
  }

  static fromJSON(input: unknown): CompositeDocument {
    const json = this.validate(input);
    const doc = new CompositeDocument(json.meta);
    for (const child of json.children) doc.addChild(DiagramInstance.fromJSON(child));
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
      children
    };
  }
}

function isFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
