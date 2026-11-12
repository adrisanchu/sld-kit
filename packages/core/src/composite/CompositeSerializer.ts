import { SldParseError } from '../serialization/Serializer';
import type { ExternalDirection } from '../types';
import { CompositeDocument, type CompositeMeta } from './CompositeDocument';
import { CompositeLine, DEFAULT_LINE_KIND, type CompositeLineJson, type LineVertexJson } from './CompositeLine';
import {
  DiagramInstance,
  LABEL_ANCHORS,
  normalizeQuarterTurn,
  type DiagramInstanceJson,
  type LabelAnchor
} from './DiagramInstance';

// Additive schema. v2 introduced line `kind` and `meta.boxMode`, and also carries
// per-instance `portDirections` (feeder exit-direction pins) and
// `meta.autoFacing` — both optional with defaults (missing `portDirections` →
// none, missing `autoFacing` → strict), so no version bump or structural
// migration is required. v1 documents load transparently (missing `kind` →
// `line`, missing `boxMode` → detailed).
export const COMPOSITE_SCHEMA_VERSION = 2;

/** The four valid feeder exit directions, for pin validation. */
const EXTERNAL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

export interface CompositeDocumentJson {
  version: number;
  kind: 'composite';
  meta: CompositeMeta;
  children: DiagramInstanceJson[];
  lines: CompositeLineJson[];
}

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
        angleDeg: normalizeAngle(c.angleDeg),
        labelAnchor: c.labelAnchor,
        labelDirection: normalizeQuarterTurn(c.labelDirection),
        ...(Object.keys(c.portDirections).length ? { portDirections: { ...c.portDirections } } : {})
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

  /**
   * Validate (and migrate) unknown input into a well-formed composite JSON,
   * throwing the first `SldParseError` on malformed data. Use `check` to
   * collect every problem instead of throwing on the first.
   */
  static validate(input: unknown): CompositeDocumentJson {
    const { errors, doc } = parseComposite(input);
    if (!doc) throw errors[0];
    return doc;
  }

  /**
   * Non-throwing validation: returns `{ ok, errors }` with the full list of
   * problems (English, user-presentable) — the composite twin of
   * `Serializer.check`, for an import report or an LLM fixing generated JSON
   * in one pass.
   */
  static check(input: unknown): { ok: boolean; errors: SldParseError[] } {
    const { errors } = parseComposite(input);
    return { ok: errors.length === 0, errors };
  }
}

type Fail = (message: string) => void;

/**
 * Validate (and migrate) unknown input, collecting every problem instead of
 * throwing on the first; mirrors `parseDocument`. Returns the errors and, when
 * there are none, the normalized composite JSON.
 *
 * Errors are pushed in the order the throw-on-first path used, so `errors[0]`
 * is exactly what `validate` throws. A few failures are fatal (nothing more
 * can be checked) and stop collection early; the rest accumulate.
 */
function parseComposite(input: unknown): { errors: SldParseError[]; doc?: CompositeDocumentJson } {
  const errors: SldParseError[] = [];
  const fail: Fail = (msg) => errors.push(new SldParseError(msg));

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail('Composite is not a valid JSON object');
    return { errors };
  }
  const json = input as Record<string, unknown>;

  // Accept the current schema and any older one; reject only versions newer
  // than we understand (forward compat we can't honor). There are no versions
  // below the current one yet — when past versions actually diverge in shape,
  // per-version migrations slot in here.
  if (typeof json.version !== 'number' || !Number.isInteger(json.version)) {
    fail('Missing composite schema version number');
    return { errors };
  }
  if (json.version > COMPOSITE_SCHEMA_VERSION) {
    fail(`Unsupported composite version ${json.version} (maximum: ${COMPOSITE_SCHEMA_VERSION})`);
    return { errors };
  }

  if (json.kind !== 'composite') {
    fail('Document is not a composite');
    return { errors };
  }

  const meta = json.meta as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') {
    fail('Missing meta block');
  } else {
    if (typeof meta.id !== 'string' || !meta.id) fail('Invalid meta.id');
    if (typeof meta.name !== 'string') fail('Invalid meta.name');
  }

  if (!Array.isArray(json.children)) {
    fail('Missing child list');
    return { errors };
  }
  const children = parseChildren(json.children as Record<string, unknown>[], fail);
  const lines = parseLines(json.lines, fail);

  if (errors.length > 0 || !meta) return { errors };

  const now = new Date().toISOString();
  return {
    errors,
    doc: {
      version: COMPOSITE_SCHEMA_VERSION,
      kind: 'composite',
      meta: {
        id: meta.id as string,
        name: meta.name as string,
        createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : now,
        updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : now,
        ...(typeof meta.boxMode === 'boolean' ? { boxMode: meta.boxMode } : {}),
        ...(typeof meta.autoFacing === 'boolean' ? { autoFacing: meta.autoFacing } : {}),
        ...(typeof meta.defaultRouting === 'string' && meta.defaultRouting
          ? { defaultRouting: meta.defaultRouting }
          : {})
      },
      children,
      lines
    }
  };
}

/** Validate the child list; a child with any problem is reported and left out. */
function parseChildren(rawChildren: Record<string, unknown>[], fail: Fail): DiagramInstanceJson[] {
  const ids = new Set<string>();
  const children: DiagramInstanceJson[] = [];
  for (const child of rawChildren) {
    if (typeof child?.id !== 'string' || !child.id) {
      fail('Child without id');
      continue;
    }
    const id = child.id;
    let ok = true;
    const childFail: Fail = (msg) => {
      ok = false;
      fail(msg);
    };
    if (ids.has(id)) childFail(`Duplicate child id: ${id}`);
    ids.add(id);
    if (typeof child.libraryId !== 'string' || !child.libraryId) {
      childFail(`Child ${id}: invalid libraryId`);
    }
    if (!isFinite(child.x) || !isFinite(child.y) || !isFinite(child.angleDeg)) {
      childFail(`Child ${id}: invalid transform`);
    }
    if (child.labelAnchor !== undefined && !LABEL_ANCHORS.includes(child.labelAnchor as LabelAnchor)) {
      childFail(`Child ${id}: invalid labelAnchor`);
    }
    if (child.labelDirection !== undefined && !isFinite(child.labelDirection)) {
      childFail(`Child ${id}: invalid labelDirection`);
    }
    const portDirections = parsePortDirections(child.portDirections, id, childFail);
    if (!ok) continue;
    children.push({
      id,
      libraryId: child.libraryId as string,
      x: round2(child.x as number),
      y: round2(child.y as number),
      angleDeg: normalizeAngle(child.angleDeg as number),
      labelAnchor: (child.labelAnchor as LabelAnchor | undefined) ?? 'top-left',
      labelDirection: normalizeQuarterTurn((child.labelDirection as number | undefined) ?? 0),
      ...(portDirections ? { portDirections } : {})
    });
  }
  return children;
}

/**
 * Validate a child's feeder exit-direction pins: an object mapping connection
 * ids to one of the four {@link ExternalDirection}s. Returns `undefined` when
 * absent or empty (so it's omitted from the roundtrip, like an unset pin).
 */
function parsePortDirections(
  input: unknown,
  childId: string,
  fail: Fail
): Record<string, ExternalDirection> | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    fail(`Child ${childId}: invalid portDirections`);
    return undefined;
  }
  const out: Record<string, ExternalDirection> = {};
  for (const [connectionId, dir] of Object.entries(input as Record<string, unknown>)) {
    if (!EXTERNAL_DIRECTIONS.includes(dir as ExternalDirection)) {
      fail(`Child ${childId}: invalid port direction "${String(dir)}" for ${connectionId}`);
      continue;
    }
    out[connectionId] = dir as ExternalDirection;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validate the manual-line list; a line with any problem is reported and left
 * out. Anchors may reference missing children — like dangling `libraryId`s,
 * they simply don't resolve at layout time.
 */
function parseLines(input: unknown, fail: Fail): CompositeLineJson[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    fail('Invalid line list');
    return [];
  }

  const ids = new Set<string>();
  const lines: CompositeLineJson[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    if (typeof raw?.id !== 'string' || !raw.id) {
      fail('Line without id');
      continue;
    }
    const id = raw.id;
    let ok = true;
    const lineFail: Fail = (msg) => {
      ok = false;
      fail(msg);
    };
    if (ids.has(id)) lineFail(`Duplicate line id: ${id}`);
    ids.add(id);
    if (raw.kind !== undefined && (typeof raw.kind !== 'string' || !raw.kind)) {
      lineFail(`Line ${id}: invalid kind`);
    }
    if (raw.routing !== undefined && (typeof raw.routing !== 'string' || !raw.routing)) {
      lineFail(`Line ${id}: invalid routing`);
    }
    if (!Array.isArray(raw.vertices) || raw.vertices.length < 2) {
      lineFail(`Line ${id}: needs at least two vertices`);
      continue;
    }
    const vertices: LineVertexJson[] = [];
    for (const v of raw.vertices as Record<string, unknown>[]) {
      if (v?.kind === 'point') {
        if (!isFinite(v.x) || !isFinite(v.y)) lineFail(`Line ${id}: invalid point vertex`);
        else vertices.push({ kind: 'point', x: round2(v.x), y: round2(v.y) });
      } else if (v?.kind === 'rel') {
        if (!isFinite(v.t) || !isFinite(v.ox) || !isFinite(v.oy)) lineFail(`Line ${id}: invalid rel vertex`);
        else vertices.push({ kind: 'rel', t: round2(v.t), ox: round2(v.ox), oy: round2(v.oy) });
      } else if (v?.kind === 'anchor') {
        if (
          typeof v.instanceId !== 'string' ||
          !v.instanceId ||
          typeof v.connectionId !== 'string' ||
          !v.connectionId
        ) {
          lineFail(`Line ${id}: invalid anchor vertex`);
        } else {
          vertices.push({ kind: 'anchor', instanceId: v.instanceId, connectionId: v.connectionId });
        }
      } else {
        lineFail(`Line ${id}: unknown vertex kind`);
      }
    }
    if (!ok) continue;
    lines.push({
      id,
      kind: (raw.kind as string | undefined) ?? DEFAULT_LINE_KIND,
      ...(raw.routing !== undefined ? { routing: raw.routing as string } : {}),
      vertices,
      // Opaque, consumer-owned: passed through untouched, never validated.
      ...(raw.data !== undefined ? { data: raw.data } : {})
    });
  }
  return lines;
}

function isFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
