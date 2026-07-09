import type { ElementJson, Endpoint, ExternalAssetKind, SldDocumentJson } from '../types';
import { SldDocument } from '../SldDocument';
import { elementFromJson } from '../elements/factory';

export const SLD_SCHEMA_VERSION = 2;

const EXTERNAL_ASSETS: ExternalAssetKind[] = ['line', 'transformer', 'renewable', 'storage', 'demand'];

/**
 * Thrown by fromJSON on malformed input. Messages are English and
 * user-presentable — consumers that need localized copy should catch this at
 * their import boundary and wrap it with their own message.
 */
export class SldParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SldParseError';
  }
}

type Migration = (json: Record<string, unknown>) => Record<string, unknown>;

/**
 * JSON (de)serialization of diagrams — the interchange format of the
 * library. Validation is hand-rolled structural checking (zero deps).
 * Future schema versions register migrations keyed by their FROM version;
 * fromJSON upgrades documents step by step before validating.
 *
 * The opaque `data` channel on elements and on `meta` is passed through
 * untouched — never validated, never interpreted (see the `data` docs).
 */
export class Serializer {
  private static migrations = new Map<number, Migration>();

  static registerMigration(fromVersion: number, migrate: Migration): void {
    this.migrations.set(fromVersion, migrate);
  }

  static toJSON(doc: SldDocument): SldDocumentJson {
    return {
      version: SLD_SCHEMA_VERSION,
      meta: { ...doc.meta },
      grid: { ...doc.grid },
      elements: doc.all().map((e) => e.toJSON())
    };
  }

  static fromJSON(input: unknown): SldDocument {
    const json = this.validate(input);
    const doc = new SldDocument(json.meta, json.grid);
    // Direct map construction — no listeners exist yet, so no emissions.
    for (const el of json.elements) doc.addElement(elementFromJson(el));
    // addElement bumped updatedAt; restore the persisted value.
    doc.meta.updatedAt = json.meta.updatedAt;
    return doc;
  }

  /** Validate (and migrate) unknown input into a well-formed document JSON. */
  static validate(input: unknown): SldDocumentJson {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new SldParseError('Document is not a valid JSON object');
    }
    let json = input as Record<string, unknown>;

    if (typeof json.version !== 'number' || !Number.isInteger(json.version)) {
      throw new SldParseError('Missing schema version number');
    }
    if (json.version > SLD_SCHEMA_VERSION) {
      throw new SldParseError(`Unsupported schema version ${json.version} (maximum: ${SLD_SCHEMA_VERSION})`);
    }
    while ((json.version as number) < SLD_SCHEMA_VERSION) {
      const migrate = this.migrations.get(json.version as number);
      if (!migrate) {
        throw new SldParseError(`No migration available from version ${json.version}`);
      }
      json = migrate(json);
    }

    const meta = json.meta as Record<string, unknown> | undefined;
    if (!meta || typeof meta !== 'object') throw new SldParseError('Missing meta block');
    if (typeof meta.id !== 'string' || !meta.id) throw new SldParseError('Invalid meta.id');
    if (typeof meta.name !== 'string') throw new SldParseError('Invalid meta.name');

    const grid = json.grid as Record<string, unknown> | undefined;
    if (!grid || typeof grid !== 'object') throw new SldParseError('Missing grid block');
    const rows = grid.rows;
    const cols = grid.cols;
    if (!isNonNegativeInt(rows) || !isNonNegativeInt(cols)) {
      throw new SldParseError('Invalid grid dimensions');
    }

    if (!Array.isArray(json.elements)) throw new SldParseError('Missing element list');
    const elements = json.elements as Record<string, unknown>[];

    const ids = new Set<string>();
    const busBarRows = new Set<number>();
    for (const el of elements) {
      if (typeof el?.id !== 'string' || !el.id) throw new SldParseError('Element without id');
      if (ids.has(el.id)) throw new SldParseError(`Duplicate id: ${el.id}`);
      ids.add(el.id);
      if (typeof el.label !== 'string') throw new SldParseError(`Element ${el.id}: invalid label`);

      switch (el.kind) {
        case 'busbar':
          if (!isNonNegativeInt(el.row) || el.row >= rows) {
            throw new SldParseError(`Bus bar ${el.id}: row out of range`);
          }
          busBarRows.add(el.row);
          break;
        case 'position': {
          // PositionType is an open string: accept any non-empty string. The
          // theme and naming maps supply defaults; unknown types fall back.
          if (typeof el.type !== 'string' || !el.type) {
            throw new SldParseError(`Position ${el.id}: missing type`);
          }
          if (!isNonNegativeInt(el.row) || el.row >= rows) {
            throw new SldParseError(`Position ${el.id}: row out of range`);
          }
          const colSpan = el.colSpan ?? 1;
          if (!isNonNegativeInt(el.col) || !isPositiveInt(colSpan) || (el.col as number) + (colSpan as number) > cols) {
            throw new SldParseError(`Position ${el.id}: column out of range`);
          }
          if (el.subElements !== undefined && !Array.isArray(el.subElements)) {
            throw new SldParseError(`Position ${el.id}: invalid subElements`);
          }
          break;
        }
        case 'connection':
          validateEndpoint(el.from, el.id as string, 'from');
          validateEndpoint(el.to, el.id as string, 'to');
          break;
        default:
          throw new SldParseError(`Element ${el.id}: unknown kind "${el.kind}"`);
      }
    }

    // Referential + structural integrity across elements.
    for (const el of elements) {
      if (el.kind === 'position' && busBarRows.has(el.row as number)) {
        throw new SldParseError(`Position ${el.id}: shares a row with a bus bar`);
      }
      if (el.kind === 'connection') {
        for (const side of ['from', 'to'] as const) {
          const ep = el[side] as Endpoint;
          if (ep.kind === 'element') {
            if (!ids.has(ep.id)) {
              throw new SldParseError(`Connection ${el.id}: references missing element ${ep.id}`);
            }
            const target = elements.find((e) => e.id === ep.id);
            if (target?.kind === 'connection') {
              throw new SldParseError(`Connection ${el.id}: cannot connect to another connection`);
            }
          }
        }
      }
    }

    const now = new Date().toISOString();
    return {
      version: SLD_SCHEMA_VERSION,
      meta: {
        id: meta.id,
        name: meta.name,
        substation: typeof meta.substation === 'string' ? meta.substation : undefined,
        voltageKv: typeof meta.voltageKv === 'number' ? meta.voltageKv : undefined,
        createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : now,
        updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : now,
        // Opaque document-level metadata, passed through untouched.
        ...(meta.data !== undefined ? { data: meta.data } : {})
      },
      grid: { rows: rows as number, cols: cols as number },
      // Element `data` survives via the spread below (positions) or the direct
      // cast (bars/connections) — it is never inspected.
      elements: elements.map((el) =>
        el.kind === 'position'
          ? ({ colSpan: 1, subElements: [], ...el } as unknown as ElementJson)
          : (el as unknown as ElementJson)
      )
    };
  }
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

function validateEndpoint(ep: unknown, connId: string, side: 'from' | 'to'): void {
  const e = ep as Partial<Endpoint> | undefined;
  if (!e || typeof e !== 'object') {
    throw new SldParseError(`Connection ${connId}: invalid ${side} endpoint`);
  }
  if (e.kind === 'element') {
    if (typeof (e as { id?: unknown }).id !== 'string') {
      throw new SldParseError(`Connection ${connId}: ${side} endpoint without id`);
    }
    const tap = (e as { tap?: unknown }).tap;
    if (tap !== undefined && tap !== 'above' && tap !== 'below') {
      throw new SldParseError(`Connection ${connId}: invalid connection point (tap)`);
    }
    return;
  }
  if (e.kind === 'external') {
    const ext = e as { asset?: unknown; label?: unknown; direction?: unknown; side?: unknown };
    if (!EXTERNAL_ASSETS.includes(ext.asset as ExternalAssetKind)) {
      throw new SldParseError(`Connection ${connId}: unknown external asset "${ext.asset}"`);
    }
    if (typeof ext.label !== 'string') {
      throw new SldParseError(`Connection ${connId}: invalid external label`);
    }
    if (ext.direction !== undefined && !['up', 'down', 'left', 'right'].includes(ext.direction as string)) {
      throw new SldParseError(`Connection ${connId}: invalid external direction`);
    }
    if (ext.side !== undefined && ext.side !== 'left' && ext.side !== 'right') {
      throw new SldParseError(`Connection ${connId}: invalid lane side`);
    }
    return;
  }
  throw new SldParseError(`Connection ${connId}: unknown endpoint kind`);
}

// v1 → v2 is a pure widening: `tap` and `side` are both optional and derived
// when absent, so nothing in existing documents needs rewriting. Registering
// the identity migration lets the version bump upgrade v1 files on load.
Serializer.registerMigration(1, (json) => ({ ...json, version: 2 }));
