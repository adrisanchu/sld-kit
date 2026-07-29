import type { ElementJson, Endpoint, ExternalAssetKind, SldDocumentJson } from '../types';

export const SLD_SCHEMA_VERSION = 2;

const EXTERNAL_ASSETS: ExternalAssetKind[] = ['line', 'transformer', 'renewable', 'storage', 'demand'];

/**
 * Thrown by `Serializer.fromJSON` on malformed input, and collected (not
 * thrown) by `Serializer.check` / `SldDocument.validate`. Messages are English
 * and user-presentable — consumers that need localized copy should catch/wrap
 * at their import boundary.
 */
export class SldParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SldParseError';
  }
}

export type Migration = (json: Record<string, unknown>) => Record<string, unknown>;

const migrations = new Map<number, Migration>();

/** Register a migration keyed by its FROM version (see `Serializer`). */
export function registerMigration(fromVersion: number, migrate: Migration): void {
  migrations.set(fromVersion, migrate);
}

/**
 * Validate (and migrate) unknown input, collecting every problem instead of
 * throwing on the first. Returns the list of errors and, when there are none,
 * the normalized document JSON (defaults filled, opaque `data` passed through).
 *
 * Errors are pushed in the same order the throw-on-first path used, so
 * `errors[0]` is exactly what `fromJSON` would have thrown. Some failures are
 * fatal (nothing more can be checked) and stop collection early; the rest
 * accumulate so a caller — or an LLM — sees the whole list in one pass.
 */
export function parseDocument(input: unknown): { errors: SldParseError[]; doc?: SldDocumentJson } {
  const errors: SldParseError[] = [];
  const fail = (msg: string) => errors.push(new SldParseError(msg));

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail('Document is not a valid JSON object');
    return { errors };
  }
  let json = input as Record<string, unknown>;

  if (typeof json.version !== 'number' || !Number.isInteger(json.version)) {
    fail('Missing schema version number');
    return { errors };
  }
  if (json.version > SLD_SCHEMA_VERSION) {
    fail(`Unsupported schema version ${json.version} (maximum: ${SLD_SCHEMA_VERSION})`);
    return { errors };
  }
  while ((json.version as number) < SLD_SCHEMA_VERSION) {
    const migrate = migrations.get(json.version as number);
    if (!migrate) {
      fail(`No migration available from version ${json.version}`);
      return { errors };
    }
    json = migrate(json);
  }

  const meta = json.meta as Record<string, unknown> | undefined;
  const metaOk = !!meta && typeof meta === 'object';
  if (!metaOk) {
    fail('Missing meta block');
  } else {
    if (typeof meta.id !== 'string' || !meta.id) fail('Invalid meta.id');
    if (typeof meta.name !== 'string') fail('Invalid meta.name');
  }

  const grid = json.grid as Record<string, unknown> | undefined;
  const rows = grid?.rows;
  const cols = grid?.cols;
  let gridOk = false;
  if (!grid || typeof grid !== 'object') {
    fail('Missing grid block');
  } else if (!isNonNegativeInt(rows) || !isNonNegativeInt(cols)) {
    fail('Invalid grid dimensions');
  } else {
    gridOk = true;
  }

  if (!Array.isArray(json.elements)) {
    fail('Missing element list');
    return { errors };
  }
  const elements = json.elements as Record<string, unknown>[];

  const ids = new Set<string>();
  const busBarRows = new Set<number>();
  for (const el of elements) {
    if (typeof el?.id !== 'string' || !el.id) {
      fail('Element without id');
      continue;
    }
    if (ids.has(el.id)) fail(`Duplicate id: ${el.id}`);
    ids.add(el.id);
    if (typeof el.label !== 'string') fail(`Element ${el.id}: invalid label`);

    switch (el.kind) {
      case 'busbar':
        if (!isNonNegativeInt(el.row) || (gridOk && (el.row as number) >= (rows as number))) {
          fail(`Bus bar ${el.id}: row out of range`);
        } else {
          busBarRows.add(el.row as number);
        }
        break;
      case 'position': {
        // PositionType is an open string: accept any non-empty string. The
        // theme and naming maps supply defaults; unknown types fall back.
        if (typeof el.type !== 'string' || !el.type) {
          fail(`Position ${el.id}: missing type`);
        }
        if (!isNonNegativeInt(el.row) || (gridOk && (el.row as number) >= (rows as number))) {
          fail(`Position ${el.id}: row out of range`);
        }
        const colSpan = el.colSpan ?? 1;
        if (
          !isNonNegativeInt(el.col) ||
          !isPositiveInt(colSpan) ||
          (gridOk && (el.col as number) + (colSpan as number) > (cols as number))
        ) {
          fail(`Position ${el.id}: column out of range`);
        }
        if (el.subElements !== undefined && !Array.isArray(el.subElements)) {
          fail(`Position ${el.id}: invalid subElements`);
        }
        break;
      }
      case 'connection':
        validateEndpoint(el.from, el.id, 'from', fail);
        validateEndpoint(el.to, el.id, 'to', fail);
        break;
      default:
        fail(`Element ${el.id}: unknown kind "${el.kind}"`);
    }
  }

  // Referential + structural integrity across elements.
  for (const el of elements) {
    if (el.kind === 'position' && typeof el.row === 'number' && busBarRows.has(el.row)) {
      fail(`Position ${el.id}: shares a row with a bus bar`);
    }
    if (el.kind === 'connection') {
      for (const side of ['from', 'to'] as const) {
        const ep = el[side] as Endpoint | undefined;
        if (ep?.kind === 'element') {
          if (!ids.has(ep.id)) {
            fail(`Connection ${el.id}: references missing element ${ep.id}`);
          } else {
            const target = elements.find((e) => e.id === ep.id);
            if (target?.kind === 'connection') {
              fail(`Connection ${el.id}: cannot connect to another connection`);
            }
          }
        }
      }
    }
  }

  if (errors.length) return { errors };

  const m = meta as Record<string, unknown>;
  const now = new Date().toISOString();
  const doc: SldDocumentJson = {
    version: SLD_SCHEMA_VERSION,
    meta: {
      id: m.id as string,
      name: m.name as string,
      substation: typeof m.substation === 'string' ? m.substation : undefined,
      voltageKv: typeof m.voltageKv === 'number' ? m.voltageKv : undefined,
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : now,
      updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : now,
      // Opaque document-level metadata, passed through untouched.
      ...(m.data !== undefined ? { data: m.data } : {})
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
  return { errors, doc };
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

function validateEndpoint(ep: unknown, connId: string, side: 'from' | 'to', fail: (msg: string) => void): void {
  const e = ep as Partial<Endpoint> | undefined;
  if (!e || typeof e !== 'object') {
    fail(`Connection ${connId}: invalid ${side} endpoint`);
    return;
  }
  if (e.kind === 'element') {
    if (typeof (e as { id?: unknown }).id !== 'string') {
      fail(`Connection ${connId}: ${side} endpoint without id`);
    }
    const tap = (e as { tap?: unknown }).tap;
    if (tap !== undefined && tap !== 'above' && tap !== 'below') {
      fail(`Connection ${connId}: invalid connection point (tap)`);
    }
    return;
  }
  if (e.kind === 'external') {
    const ext = e as { asset?: unknown; label?: unknown; direction?: unknown; side?: unknown };
    if (!EXTERNAL_ASSETS.includes(ext.asset as ExternalAssetKind)) {
      fail(`Connection ${connId}: unknown external asset "${ext.asset}"`);
    }
    if (typeof ext.label !== 'string') {
      fail(`Connection ${connId}: invalid external label`);
    }
    if (ext.direction !== undefined && !['up', 'down', 'left', 'right'].includes(ext.direction as string)) {
      fail(`Connection ${connId}: invalid external direction`);
    }
    if (ext.side !== undefined && ext.side !== 'left' && ext.side !== 'right') {
      fail(`Connection ${connId}: invalid lane side`);
    }
    return;
  }
  fail(`Connection ${connId}: unknown endpoint kind`);
}

// v1 → v2 is a pure widening: `tap` and `side` are both optional and derived
// when absent, so nothing in existing documents needs rewriting. Registering
// the identity migration lets the version bump upgrade v1 files on load.
registerMigration(1, (json) => ({ ...json, version: 2 }));
