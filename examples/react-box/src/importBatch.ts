/**
 * Bulk import of diagram / composite JSON files into the box composite. Core's
 * `ImportPlan` does the batch logic (validation, per-file report, fresh ids,
 * composite relinking); this module turns its result into the canvas:
 *
 *  - **diagrams** are placed (geographically from `meta.location`, compacted,
 *    or in a grid) and appended with the lines their shared feeder ids imply,
 *    as ONE undoable step;
 *  - a **composite** in the batch is *opened* instead: it replaces the canvas,
 *    its children resolved from the batch's diagrams.
 *
 * Pure (no DOM): the dialog reads the files, the smoke test feeds it the
 * sample batch. Only imports `@sld-kit/core`, so Node can run it directly.
 */
import {
  AddChildCommand,
  AddLineCommand,
  BatchCommand,
  CompositeDocument,
  CompositeLine,
  CompositeSerializer,
  DiagramInstance,
  ImportPlan,
  MapResolver,
  Serializer,
  arrangeByAnchors,
  newId,
  projectLocations,
  type Command,
  type CompositeLayoutEngine,
  type CompositeLineKind,
  type ImportInput,
  type ImportResult,
  type Point,
  type SldDocument,
  type SldDocumentJson
} from '@sld-kit/core';

/** A batch, validated and ready to apply. */
export interface BatchRead {
  /** Per-file report, in input order. */
  results: ImportResult[];
  /** The valid diagrams, each with its fresh id (`meta.id`). */
  diagrams: SldDocument[];
  /** The composite to open (the batch's first), its children resolved from `diagrams`; else null. */
  composite: CompositeDocument | null;
}

/** A plan for a batch going into a canvas whose substations already use `existingNames` (a clash is a warning). */
export function createPlan(existingNames: Iterable<string>): ImportPlan {
  return new ImportPlan({ existingIds: { has: () => false }, existingNames: new Set(existingNames) });
}

/**
 * Finish a plan once every file is added: instantiate the diagrams and, when
 * the batch holds a composite, the composite to open (only the first; the rest
 * are reported). Diagrams a composite doesn't use are reported too.
 */
export function finishPlan(plan: ImportPlan): BatchRead {
  const planned = plan.diagrams();
  const diagrams = planned.map((p) => Serializer.fromJSON(p.json));

  const [first, ...others] = plan.composites();
  let composite: CompositeDocument | null = null;
  if (first) {
    composite = CompositeSerializer.fromJSON(first.json);
    const byId = new Map<string, SldDocumentJson>(planned.map((p) => [p.json.meta.id, p.json]));
    composite.resolveChildren(new MapResolver(byId));
    // The box view's own defaults, for a composite authored elsewhere.
    if (composite.meta.boxMode === undefined || composite.meta.defaultRouting === undefined) {
      composite.updateMeta({
        boxMode: composite.meta.boxMode ?? true,
        defaultRouting: composite.meta.defaultRouting ?? 'orthogonal'
      });
    }
    for (const c of others) c.result.messages.push('Only the first composite of a batch is opened');
    const used = new Set(first.json.children.map((c) => c.libraryId));
    for (const p of planned) {
      if (!used.has(p.json.meta.id))
        p.result.messages.push(`Not used by the opened composite "${first.json.meta.name}"`);
    }
  }
  return { results: plan.results(), diagrams, composite };
}

/** Convenience: plan + finish in one go (no progress), e.g. for tests. */
export function readBatch(inputs: ImportInput[], existingNames: Iterable<string> = []): BatchRead {
  const plan = createPlan(existingNames);
  for (const input of inputs) plan.add(input);
  return finishPlan(plan);
}

// ── Placement ────────────────────────────────────────────────────────────────

export type PlacementMode = 'geo' | 'grid';

export interface PlaceOptions {
  mode: PlacementMode;
  /** Geographic mode: how hard to pull far-apart boxes together (0..1, see `arrangeByAnchors`). */
  compaction: number;
  /** Clearance between boxes (default {@link IMPORT_GAP}). */
  gap?: number;
}

/** Room between imported boxes: enough for a line, its rating and a bend. */
export const IMPORT_GAP = 100;

type Size = { width: number; height: number };

/**
 * Each diagram's box size, measured by laying them out in box view with the
 * canvas's own engine (so a split substation gets its wider frame).
 */
export function boxSizes(engine: CompositeLayoutEngine, docs: SldDocument[]): Map<string, Size> {
  const tmp = new CompositeDocument({ boxMode: true });
  for (const doc of docs) tmp.addChild(instanceFor(doc, 0, 0));
  const out = new Map<string, Size>();
  for (const c of engine.layout(tmp).children) {
    out.set(c.instance.libraryId, { width: c.worldBounds.width, height: c.worldBounds.height });
  }
  return out;
}

/**
 * Top-left corner per diagram id, the arrangement starting at (0, 0).
 * Geographic: located diagrams by `arrangeByAnchors`, the rest in a grid below.
 * Grid: everything in a square-ish grid, in batch order.
 */
export function placeDiagrams(docs: SldDocument[], sizes: Map<string, Size>, opts: PlaceOptions): Map<string, Point> {
  const gap = opts.gap ?? IMPORT_GAP;
  const sizeOf = (d: SldDocument) => sizes.get(d.meta.id) ?? { width: 200, height: 72 };
  const out = new Map<string, Point>();

  const located =
    opts.mode === 'geo' ? docs.flatMap((d) => (d.meta.location ? [{ doc: d, at: d.meta.location }] : [])) : [];
  let top = 0;
  if (located.length) {
    const anchors = projectLocations(located.map((l) => l.at));
    const arranged = arrangeByAnchors(
      located.map(({ doc }, i) => ({ id: doc.meta.id, anchor: anchors[i], size: sizeOf(doc) })),
      { gap, compaction: opts.compaction }
    );
    for (const [id, p] of arranged) out.set(id, p);
    top = Math.max(...located.map(({ doc }) => (arranged.get(doc.meta.id)?.y ?? 0) + sizeOf(doc).height)) + gap * 2;
  }

  const rest = docs.filter((d) => !out.has(d.meta.id));
  const cols = Math.max(1, Math.ceil(Math.sqrt(rest.length)));
  const cellW = Math.max(0, ...rest.map((d) => sizeOf(d).width)) + gap;
  const cellH = Math.max(0, ...rest.map((d) => sizeOf(d).height)) + gap;
  rest.forEach((d, i) => out.set(d.meta.id, { x: (i % cols) * cellW, y: top + Math.floor(i / cols) * cellH }));
  return out;
}

// ── Lines from shared feeder ids ─────────────────────────────────────────────

/** A feeder id found on exactly two diagrams: the line an import draws between them. */
export interface FeederPair {
  connectionId: string;
  /** Holder keys (instance ids on the canvas, diagram ids in a preview). */
  a: string;
  b: string;
  kind: CompositeLineKind;
}

/** Line kind for a feeder's asset: a transformer tie draws its glyph, everything else a plain line. */
const kindFor = (asset: string): CompositeLineKind =>
  asset === 'transformer' ? 'transformer' : asset === 'transformer3w' ? 'transformer3w' : 'line';

/**
 * Pair up the external feeders that two holders share by id. A feeder id held
 * once (a demand, a line leaving the batch) or more than twice is left alone.
 */
export function feederPairs(holders: { key: string; doc: SldDocument }[]): FeederPair[] {
  const byId = new Map<string, { key: string; asset: string }[]>();
  for (const { key, doc } of holders) {
    for (const conn of doc.connections()) {
      const ext = conn.from.kind === 'external' ? conn.from : conn.to.kind === 'external' ? conn.to : null;
      if (!ext || ext.asset === 'demand') continue;
      const list = byId.get(conn.id) ?? [];
      list.push({ key, asset: ext.asset });
      byId.set(conn.id, list);
    }
  }
  const pairs: FeederPair[] = [];
  for (const [connectionId, list] of byId) {
    if (list.length !== 2 || list[0].key === list[1].key) continue;
    pairs.push({ connectionId, a: list[0].key, b: list[1].key, kind: kindFor(list[0].asset) });
  }
  return pairs;
}

const instanceFor = (doc: SldDocument, x: number, y: number) => {
  const inst = new DiagramInstance(newId(), doc.meta.id, x, y, 0);
  inst.resolved = doc;
  inst.resolveAttempted = true;
  return inst;
};

/**
 * Append the diagrams at `origin` + their placement, plus a line for every
 * feeder id they share (with each other or with a substation already on the
 * canvas) that no line uses yet — ONE undoable step. Positions snap to `snap`.
 */
export function appendCommand(
  composite: CompositeDocument,
  docs: SldDocument[],
  positions: Map<string, Point>,
  origin: Point,
  snap = 20
): Command<CompositeDocument> {
  const round = (v: number) => Math.round(v / snap) * snap;
  const added = docs.map((doc) => {
    const p = positions.get(doc.meta.id) ?? { x: 0, y: 0 };
    return instanceFor(doc, round(origin.x + p.x), round(origin.y + p.y));
  });

  // Feeders a line already anchors stay as they are.
  const claimed = new Set<string>();
  for (const line of composite.allLines()) {
    for (const v of line.vertices) if (v.kind === 'anchor') claimed.add(`${v.instanceId}\u0000${v.connectionId}`);
  }
  const holders = [...composite.allChildren(), ...added].flatMap((inst) =>
    inst.resolved ? [{ key: inst.id, doc: inst.resolved }] : []
  );
  const fresh = new Set(added.map((i) => i.id));
  const lines = feederPairs(holders)
    .filter((p) => fresh.has(p.a) || fresh.has(p.b))
    .filter((p) => !claimed.has(`${p.a}\u0000${p.connectionId}`) && !claimed.has(`${p.b}\u0000${p.connectionId}`))
    .map(
      (p) =>
        new CompositeLine(
          newId(),
          [
            { kind: 'anchor', instanceId: p.a, connectionId: p.connectionId },
            { kind: 'anchor', instanceId: p.b, connectionId: p.connectionId }
          ],
          p.kind
        )
    );

  const label = docs.length === 1 ? 'Import 1 substation' : `Import ${docs.length} substations`;
  return new BatchCommand(label, [
    ...added.map((inst) => new AddChildCommand(inst)),
    ...lines.map((line) => new AddLineCommand(line))
  ]);
}

/** Where an appended batch lands: right of what's on the canvas (or at the origin when it's empty). */
export function appendOrigin(bounds: { x: number; y: number; width: number; height: number } | null): Point {
  if (!bounds || !Number.isFinite(bounds.width) || bounds.width <= 0) return { x: 0, y: 0 };
  return { x: bounds.x + bounds.width + IMPORT_GAP * 3, y: bounds.y };
}
