import { get } from 'svelte/store';
import {
  Serializer,
  CompositeSerializer,
  newId,
  type SldDocumentJson,
  type CompositeDocumentJson
} from '@sld-kit/core';
import { sldLibrary, detectDocumentKind, type SldLibraryKind, type SaveResult } from '$lib/stores/sldLibrary';

/**
 * Bulk import of diagram/composite JSON files (e.g. a whole folder) into the
 * library. Every file is read and validated one by one; the outcome of each is
 * reported back so the UI can show a per-file summary.
 *
 * Imported documents get fresh ids (never overwrite), and composites that
 * reference diagrams from the same batch are relinked to the new ids.
 */
export type ImportStatus = 'imported' | 'warning' | 'error' | 'skipped';

export interface ImportResult {
  /** Path inside the picked folder (`webkitRelativePath`), else the file name. */
  path: string;
  status: ImportStatus;
  kind?: SldLibraryKind;
  name?: string;
  /** New library id, when the document was saved. */
  id?: string;
  /** Every error or warning, English and user-presentable. */
  messages: string[];
}

/** Yield to the browser every N files so progress can repaint. */
const YIELD_EVERY = 25;

interface Valid<T> {
  result: ImportResult;
  json: T;
}

export async function importFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<ImportResult[]> {
  // Dotfiles (.DS_Store, …) are OS noise, not user content — drop them silently.
  const candidates = files.filter((f) => !f.name.startsWith('.'));
  const total = candidates.length;
  const results: ImportResult[] = [];
  const diagrams: Valid<SldDocumentJson>[] = [];
  const composites: Valid<CompositeDocumentJson>[] = [];

  const libraryNames = new Set(get(sldLibrary).map((e) => e.name));
  const firstPathById = new Map<string, string>();

  for (let i = 0; i < total; i++) {
    const file = candidates[i];
    const result: ImportResult = { path: file.webkitRelativePath || file.name, status: 'imported', messages: [] };
    results.push(result);

    if (!file.name.toLowerCase().endsWith('.json')) {
      result.status = 'skipped';
      result.messages.push('Not a JSON file');
    } else {
      const valid = await validateFile(file, result);
      if (valid) {
        const { id, name } = valid.json.meta;
        const firstPath = firstPathById.get(id);
        if (firstPath) result.messages.push(`Same id as ${firstPath}`);
        else firstPathById.set(id, result.path);
        if (libraryNames.has(name)) result.messages.push(`A document named "${name}" already exists in the library`);
        if (valid.kind === 'composite') composites.push(valid as Valid<CompositeDocumentJson>);
        else diagrams.push(valid as Valid<SldDocumentJson>);
      }
    }

    if ((i + 1) % YIELD_EVERY === 0 || i + 1 === total) {
      onProgress?.(i + 1, total);
      await new Promise((r) => setTimeout(r));
    }
  }

  // Diagrams first, so composites can be relinked to the ids that were saved.
  const newIdByOldId = new Map<string, string>();
  const diagramJsons = diagrams.map(({ json }) => ({ ...json, meta: { ...json.meta, id: newId() } }));
  applySaveResults(diagrams, diagramJsons, sldLibrary.saveMany(diagramJsons));
  diagrams.forEach(({ json, result }) => {
    if (result.id && !newIdByOldId.has(json.meta.id)) newIdByOldId.set(json.meta.id, result.id);
  });

  const compositeJsons = composites.map(({ json, result }) => {
    const missing = new Set<string>();
    const children = json.children.map((child) => {
      const relinked = newIdByOldId.get(child.libraryId);
      if (relinked) return { ...child, libraryId: relinked };
      if (!sldLibrary.exists(child.libraryId)) missing.add(child.libraryId);
      return child;
    });
    if (missing.size > 0) {
      result.messages.push(`${missing.size} referenced diagram(s) not found: ${[...missing].join(', ')}`);
    }
    return { ...json, meta: { ...json.meta, id: newId() }, children };
  });
  applySaveResults(composites, compositeJsons, sldLibrary.saveMany(compositeJsons));

  for (const result of results) {
    if (result.status === 'imported' && result.messages.length > 0) result.status = 'warning';
  }
  return results;
}

async function validateFile(
  file: File,
  result: ImportResult
): Promise<(Valid<SldDocumentJson | CompositeDocumentJson> & { kind: SldLibraryKind }) | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    result.status = 'error';
    result.messages.push(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const kind = detectDocumentKind(parsed);
  result.kind = kind;
  const rawName = (parsed as { meta?: { name?: unknown } } | null)?.meta?.name;
  if (typeof rawName === 'string') result.name = rawName;

  // `check` collects every problem at once; `validate` then returns the
  // normalized (and migrated) JSON.
  if (kind === 'composite') {
    const { ok, errors } = CompositeSerializer.check(parsed);
    if (!ok) {
      result.status = 'error';
      result.messages.push(...errors.map((e) => e.message));
      return null;
    }
    return { kind, result, json: CompositeSerializer.validate(parsed) };
  }

  const { ok, errors } = Serializer.check(parsed);
  if (!ok) {
    result.status = 'error';
    result.messages.push(...errors.map((e) => e.message));
    return null;
  }
  return { kind, result, json: Serializer.validate(parsed) };
}

function applySaveResults<T extends SldDocumentJson | CompositeDocumentJson>(
  items: Valid<T>[],
  saved: T[],
  outcomes: SaveResult[]
) {
  items.forEach(({ result }, i) => {
    const outcome = outcomes[i];
    if (outcome.ok) {
      result.id = saved[i].meta.id;
    } else {
      result.status = 'error';
      result.messages.push(outcome.error);
    }
  });
}
