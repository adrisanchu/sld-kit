import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import {
  Serializer,
  newId,
  type SldDocument,
  type SldDocumentJson,
  type DocumentResolver,
  type CompositeDocumentJson
} from '@sld-kit/core';

/**
 * Browser-local diagram library for the SLD tool. Deliberately DB-independent:
 * an index of lightweight entries lives at `sld:index` and each diagram's full
 * JSON at `sld:doc:<id>`. The store value is the index array, so the list page
 * reacts to saves/deletes. Follows the mapDrawingSettings localStorage pattern
 * (browser guard + try/catch).
 *
 * Both regular diagrams and composites ("diagram of diagrams") live in the same
 * library and storage keys; the stored JSON's `kind` field (absent = diagram)
 * disambiguates on read.
 */
export type SldLibraryKind = 'diagram' | 'composite';

export interface SldLibraryEntry {
  id: string;
  name: string;
  substation?: string;
  voltageKv?: number;
  updatedAt: string;
  /** Absent on legacy entries — read as `entry.kind ?? 'diagram'`. */
  kind?: SldLibraryKind;
}

const INDEX_KEY = 'sld:index';
const docKey = (id: string) => `sld:doc:${id}`;

/** Discriminate stored/imported JSON without fully parsing it. */
export function detectDocumentKind(input: unknown): SldLibraryKind {
  if (input && typeof input === 'object' && (input as { kind?: unknown }).kind === 'composite') {
    return 'composite';
  }
  return 'diagram';
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

function readIndex(): SldLibraryEntry[] {
  if (!browser) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function entryOf(json: SldDocumentJson): SldLibraryEntry {
  return {
    id: json.meta.id,
    name: json.meta.name,
    substation: json.meta.substation,
    voltageKv: json.meta.voltageKv,
    updatedAt: json.meta.updatedAt,
    kind: 'diagram'
  };
}

function entryOfComposite(json: CompositeDocumentJson): SldLibraryEntry {
  return {
    id: json.meta.id,
    name: json.meta.name,
    updatedAt: json.meta.updatedAt,
    kind: 'composite'
  };
}

/** Merge entries into an index (replacing by id), newest first. */
function mergeEntries(entries: SldLibraryEntry[], incoming: SldLibraryEntry[]): SldLibraryEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type SaveResult = { ok: true } | { ok: false; error: string };

const STORAGE_FULL = 'Browser storage is full';

function createLibrary() {
  const store = writable<SldLibraryEntry[]>(readIndex());

  function persistIndex(entries: SldLibraryEntry[]) {
    if (browser) localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
    store.set(entries);
  }

  function readDoc(id: string): unknown {
    if (!browser) return null;
    try {
      const raw = localStorage.getItem(docKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function loadJson(id: string): SldDocumentJson | null {
    const json = readDoc(id);
    return json && detectDocumentKind(json) === 'diagram' ? (json as SldDocumentJson) : null;
  }

  function loadCompositeJson(id: string): CompositeDocumentJson | null {
    const json = readDoc(id);
    return json && detectDocumentKind(json) === 'composite' ? (json as CompositeDocumentJson) : null;
  }

  function kindOf(id: string): SldLibraryKind | null {
    const json = readDoc(id);
    return json ? detectDocumentKind(json) : null;
  }

  function load(id: string): SldDocument | null {
    const json = loadJson(id);
    if (!json) return null;
    try {
      return Serializer.fromJSON(json);
    } catch {
      return null;
    }
  }

  function upsertEntry(entry: SldLibraryEntry) {
    persistIndex(mergeEntries(readIndex(), [entry]));
  }

  function save(json: SldDocumentJson) {
    if (browser) localStorage.setItem(docKey(json.meta.id), JSON.stringify(json));
    upsertEntry(entryOf(json));
  }

  function saveDoc(doc: SldDocument) {
    save(Serializer.toJSON(doc));
  }

  function saveComposite(json: CompositeDocumentJson) {
    if (browser) localStorage.setItem(docKey(json.meta.id), JSON.stringify(json));
    upsertEntry(entryOfComposite(json));
  }

  /**
   * Bulk save for imports: writes every document, then the index once (one
   * store emission instead of one per file). Stops writing at the first quota
   * error — that item and the rest report `Browser storage is full`. If the
   * grown index no longer fits, the most recently written documents are removed
   * again until it does, so no orphaned `sld:doc:*` keys are left behind.
   */
  function saveMany(jsons: Array<SldDocumentJson | CompositeDocumentJson>): SaveResult[] {
    if (!browser) return jsons.map(() => ({ ok: false, error: 'Storage unavailable' }));
    const results: SaveResult[] = [];
    const saved: { index: number; entry: SldLibraryEntry }[] = [];
    let full = false;
    jsons.forEach((json, index) => {
      if (full) {
        results.push({ ok: false, error: STORAGE_FULL });
        return;
      }
      try {
        localStorage.setItem(docKey(json.meta.id), JSON.stringify(json));
        const entry =
          detectDocumentKind(json) === 'composite'
            ? entryOfComposite(json as CompositeDocumentJson)
            : entryOf(json as SldDocumentJson);
        saved.push({ index, entry });
        results.push({ ok: true });
      } catch (err) {
        full = isQuotaError(err);
        results.push({ ok: false, error: full ? STORAGE_FULL : 'Could not write to storage' });
      }
    });
    const current = readIndex();
    while (saved.length > 0) {
      try {
        persistIndex(
          mergeEntries(
            current,
            saved.map((s) => s.entry)
          )
        );
        break;
      } catch {
        const dropped = saved.pop();
        if (dropped) {
          localStorage.removeItem(docKey(dropped.entry.id));
          results[dropped.index] = { ok: false, error: STORAGE_FULL };
        }
      }
    }
    return results;
  }

  function remove(id: string) {
    if (browser) localStorage.removeItem(docKey(id));
    persistIndex(readIndex().filter((e) => e.id !== id));
  }

  function duplicate(id: string): string | null {
    const json = readDoc(id);
    if (!json) return null;
    const now = new Date().toISOString();
    if (detectDocumentKind(json) === 'composite') {
      const src = json as CompositeDocumentJson;
      const copy: CompositeDocumentJson = {
        ...src,
        meta: { ...src.meta, id: newId(), name: `${src.meta.name} (copia)`, createdAt: now, updatedAt: now },
        // Re-mint child instance ids — uniqueness is only required per composite.
        children: src.children.map((c) => ({ ...c, id: newId() }))
      };
      saveComposite(copy);
      return copy.meta.id;
    }
    const src = json as SldDocumentJson;
    const copy: SldDocumentJson = {
      ...src,
      meta: { ...src.meta, id: newId(), name: `${src.meta.name} (copia)`, createdAt: now, updatedAt: now }
    };
    save(copy);
    return copy.meta.id;
  }

  function exists(id: string): boolean {
    return browser && localStorage.getItem(docKey(id)) !== null;
  }

  /** Adapter for the composite core: resolve a child's library JSON by id. */
  const resolver: DocumentResolver = {
    resolve: (libraryId: string) => loadJson(libraryId)
  };

  return {
    subscribe: store.subscribe,
    refresh: () => store.set(readIndex()),
    loadJson,
    loadCompositeJson,
    kindOf,
    load,
    save,
    saveDoc,
    saveComposite,
    saveMany,
    remove,
    duplicate,
    exists,
    resolver
  };
}

export const sldLibrary = createLibrary();
