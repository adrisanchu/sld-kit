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
    const entries = readIndex();
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) entries[idx] = entry;
    else entries.unshift(entry);
    // Newest first.
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    persistIndex(entries);
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
    remove,
    duplicate,
    exists,
    resolver
  };
}

export const sldLibrary = createLibrary();
