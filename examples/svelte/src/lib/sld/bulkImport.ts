import { get } from 'svelte/store';
import {
  ImportPlan,
  type ImportResult,
  type PlannedDocument,
  type SldDocumentJson,
  type CompositeDocumentJson
} from '@sld-kit/core';
import { sldLibrary } from '$lib/stores/sldLibrary';

/**
 * Bulk import of diagram/composite JSON files (e.g. a whole folder) into the
 * library. Core's `ImportPlan` does the batch logic (validation, duplicate-id
 * and name warnings, fresh ids, composite relinking); this module only reads
 * the files, saves to the library and reports progress.
 */
export type { ImportStatus, ImportResult } from '@sld-kit/core';

/** Yield to the browser every N files so progress can repaint. */
const YIELD_EVERY = 25;

export async function importFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<ImportResult[]> {
  // Dotfiles (.DS_Store, …) are OS noise, not user content — drop them silently.
  const candidates = files.filter((f) => !f.name.startsWith('.'));
  const total = candidates.length;
  const plan = new ImportPlan({
    existingIds: { has: sldLibrary.exists },
    existingNames: new Set(get(sldLibrary).map((e) => e.name))
  });

  for (let i = 0; i < total; i++) {
    const file = candidates[i];
    // Only JSON files are read; anything else is reported as skipped.
    const isJson = file.name.toLowerCase().endsWith('.json');
    plan.add({ path: file.webkitRelativePath || file.name, text: isJson ? await file.text() : undefined });

    if ((i + 1) % YIELD_EVERY === 0 || i + 1 === total) {
      onProgress?.(i + 1, total);
      await new Promise((r) => setTimeout(r));
    }
  }

  // Diagrams first, so composites only relink to the diagrams that were saved.
  save(plan, plan.diagrams());
  save(plan, plan.composites());
  return plan.results();
}

function save(plan: ImportPlan, items: PlannedDocument<SldDocumentJson | CompositeDocumentJson>[]) {
  sldLibrary.saveMany(items.map((item) => item.json)).forEach((outcome, i) => plan.markSaved(items[i], outcome));
}
