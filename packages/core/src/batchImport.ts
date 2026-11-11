import type { SldDocumentJson } from './types';
import { Serializer } from './serialization/Serializer';
import { CompositeSerializer, type CompositeDocumentJson } from './composite/CompositeSerializer';
import { newId } from './ids';

/**
 * Pure, storage-free planning for a batch import of diagram / composite JSON
 * files (e.g. a whole folder). Core validates each document, reports problems
 * per file, gives every document a fresh id (imports never overwrite) and
 * relinks composites to the new ids of sibling diagrams in the same batch.
 *
 * The app keeps what is environment-specific: reading files (File API,
 * dotfile filtering), persisting (and handling a full storage), and showing
 * progress and the report. The flow is two-step, so a composite only relinks
 * to diagrams that were actually saved:
 *
 * ```ts
 * const plan = new ImportPlan({ existingIds, existingNames });
 * for (const file of files) plan.add({ path: file.name, text: await file.text() }); // yield for progress
 * const diagrams = plan.diagrams();
 * save(diagrams.map((d) => d.json)).forEach((outcome, i) => plan.markSaved(diagrams[i], outcome));
 * const composites = plan.composites(); // relinked to the diagrams that saved
 * save(composites.map((c) => c.json)).forEach((outcome, i) => plan.markSaved(composites[i], outcome));
 * report(plan.results());
 * ```
 *
 * Messages are English and user-presentable, like `SldParseError`'s.
 */

/** The two document types a library holds. */
export type DocumentKind = 'diagram' | 'composite';

/** Discriminate document JSON without fully parsing it (`kind: 'composite'`, else a diagram). */
export function detectDocumentKind(input: unknown): DocumentKind {
  if (input && typeof input === 'object' && (input as { kind?: unknown }).kind === 'composite') {
    return 'composite';
  }
  return 'diagram';
}

/** Per-file outcome. `warning` = imported, with messages worth reading. */
export type ImportStatus = 'imported' | 'warning' | 'error' | 'skipped';

/** One file of the batch. Leave `text` out for a file that isn't JSON: it's reported as skipped. */
export interface ImportInput {
  /** Where the file came from (e.g. its path inside the picked folder); used in messages. */
  path: string;
  text?: string;
}

export interface ImportResult {
  path: string;
  status: ImportStatus;
  kind?: DocumentKind;
  /** The document's `meta.name`, when it has one (even if invalid). */
  name?: string;
  /** The document's new id; cleared again when its save fails. */
  id?: string;
  /** Every error or warning, English and user-presentable. */
  messages: string[];
}

/** What the batch is imported into. Only `has` is needed, so a `Set` or a storage lookup both work. */
export interface ImportContext {
  /** Ids already in the library: composite children pointing at them stay as they are. */
  existingIds: { has(id: string): boolean };
  /** Names already in the library: a match is a warning, not an error. */
  existingNames: { has(name: string): boolean };
}

/** A valid document ready to persist: re-identified (and, for composites, relinked). */
export interface PlannedDocument<T> {
  result: ImportResult;
  /** The id the document had in its file. */
  sourceId: string;
  json: T;
}

/** The outcome of persisting one planned document. */
export type SaveOutcome = { ok: true } | { ok: false; error: string };

interface Valid<T> {
  result: ImportResult;
  json: T;
}

export class ImportPlan {
  private readonly inputs: ImportResult[] = [];
  private readonly validDiagrams: Valid<SldDocumentJson>[] = [];
  private readonly validComposites: Valid<CompositeDocumentJson>[] = [];
  private readonly firstPathById = new Map<string, string>();
  private readonly failed = new Set<ImportResult>();
  private plannedDiagrams?: PlannedDocument<SldDocumentJson>[];
  private plannedComposites?: PlannedDocument<CompositeDocumentJson>[];

  constructor(private readonly context: ImportContext) {}

  /**
   * Validate one file and record it. Synchronous, so a caller can yield
   * between files to repaint progress. Returns that file's (live) result.
   */
  add(input: ImportInput): ImportResult {
    const result: ImportResult = { path: input.path, status: 'imported', messages: [] };
    this.inputs.push(result);

    if (input.text === undefined) {
      result.status = 'skipped';
      result.messages.push('Not a JSON file');
      return result;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.text);
    } catch (err) {
      result.status = 'error';
      result.messages.push(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
      return result;
    }

    const kind = detectDocumentKind(parsed);
    result.kind = kind;
    const rawName = (parsed as { meta?: { name?: unknown } } | null)?.meta?.name;
    if (typeof rawName === 'string') result.name = rawName;

    // `check` collects every problem at once; `validate` then returns the
    // normalized (and migrated) JSON.
    const { ok, errors } = kind === 'composite' ? CompositeSerializer.check(parsed) : Serializer.check(parsed);
    if (!ok) {
      result.status = 'error';
      result.messages.push(...errors.map((e) => e.message));
      return result;
    }

    const json = kind === 'composite' ? CompositeSerializer.validate(parsed) : Serializer.validate(parsed);
    const { id, name } = json.meta;
    const firstPath = this.firstPathById.get(id);
    if (firstPath) result.messages.push(`Same id as ${firstPath}`);
    else this.firstPathById.set(id, result.path);
    if (this.context.existingNames.has(name)) {
      result.messages.push(`A document named "${name}" already exists in the library`);
    }

    if (kind === 'composite') this.validComposites.push({ result, json: json as CompositeDocumentJson });
    else this.validDiagrams.push({ result, json: json as SldDocumentJson });
    return result;
  }

  /** The valid diagrams, each with a fresh id, in input order. Minted once: later calls return the same plan. */
  diagrams(): PlannedDocument<SldDocumentJson>[] {
    this.plannedDiagrams ??= this.validDiagrams.map(({ result, json }) => {
      const id = newId();
      result.id = id;
      return { result, sourceId: json.meta.id, json: { ...json, meta: { ...json.meta, id } } };
    });
    return this.plannedDiagrams;
  }

  /**
   * Record whether a planned document was persisted. A failure turns its
   * result into an error (with `error` as the message) and clears its id; a
   * composite planned afterwards no longer relinks to a failed diagram.
   */
  markSaved(item: PlannedDocument<unknown>, outcome: SaveOutcome): void {
    if (outcome.ok) return;
    item.result.status = 'error';
    item.result.messages.push(outcome.error);
    item.result.id = undefined;
    this.failed.add(item.result);
  }

  /**
   * The valid composites, each with a fresh id and its children relinked to
   * the new ids of this batch's diagrams. Call it after marking the diagram
   * saves: a diagram marked as failed is not relinked to (an unmarked one
   * counts as saved). A child found neither in the batch nor in
   * `existingIds` is reported. Planned once: later calls return the same plan.
   */
  composites(): PlannedDocument<CompositeDocumentJson>[] {
    if (this.plannedComposites) return this.plannedComposites;

    // Duplicate source ids: the first diagram that saved wins.
    const newIdBySourceId = new Map<string, string>();
    for (const { result, sourceId, json } of this.diagrams()) {
      if (!this.failed.has(result) && !newIdBySourceId.has(sourceId)) newIdBySourceId.set(sourceId, json.meta.id);
    }

    this.plannedComposites = this.validComposites.map(({ result, json }) => {
      const missing = new Set<string>();
      const children = json.children.map((child) => {
        const relinked = newIdBySourceId.get(child.libraryId);
        if (relinked) return { ...child, libraryId: relinked };
        if (!this.context.existingIds.has(child.libraryId)) missing.add(child.libraryId);
        return child;
      });
      if (missing.size > 0) {
        result.messages.push(`${missing.size} referenced diagram(s) not found: ${[...missing].join(', ')}`);
      }
      const id = newId();
      result.id = id;
      return { result, sourceId: json.meta.id, json: { ...json, meta: { ...json.meta, id }, children } };
    });
    return this.plannedComposites;
  }

  /** Every file's result, in input order. An import with messages reads as a `warning`. */
  results(): ImportResult[] {
    for (const result of this.inputs) {
      if (result.status === 'imported' && result.messages.length > 0) result.status = 'warning';
    }
    return this.inputs;
  }
}

/** Convenience: an `ImportPlan` with every input already added. */
export function planImport(inputs: ImportInput[], context: ImportContext): ImportPlan {
  const plan = new ImportPlan(context);
  for (const input of inputs) plan.add(input);
  return plan;
}
