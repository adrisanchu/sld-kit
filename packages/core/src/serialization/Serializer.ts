import type { SldDocumentJson } from '../types';
import { SldDocument } from '../SldDocument';
import { elementFromJson } from '../elements/factory';
import { SLD_SCHEMA_VERSION, SldParseError, parseDocument, registerMigration, type Migration } from './validate';

export { SLD_SCHEMA_VERSION, SldParseError };

/**
 * JSON (de)serialization of diagrams — the interchange format of the
 * library. Validation is hand-rolled structural checking (zero deps) and lives
 * in `./validate`; future schema versions register migrations keyed by their
 * FROM version, and `fromJSON` upgrades documents step by step before validating.
 *
 * The opaque `data` channel on elements and on `meta` is passed through
 * untouched — never validated, never interpreted (see the `data` docs).
 */
export class Serializer {
  static registerMigration(fromVersion: number, migrate: Migration): void {
    registerMigration(fromVersion, migrate);
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

  /**
   * Validate (and migrate) unknown input into a well-formed document JSON,
   * throwing the first `SldParseError` on malformed data. Use `check` to
   * collect every problem instead of throwing on the first.
   */
  static validate(input: unknown): SldDocumentJson {
    const { errors, doc } = parseDocument(input);
    if (!doc) throw errors[0];
    return doc;
  }

  /**
   * Non-throwing validation: returns `{ ok, errors }` with the full list of
   * problems (English, user-presentable). Ideal for a fix-then-recheck loop —
   * an editor surfacing all issues at once, or an LLM self-correcting generated
   * JSON without a round-trip per error.
   */
  static check(input: unknown): { ok: boolean; errors: SldParseError[] } {
    const { errors } = parseDocument(input);
    return { ok: errors.length === 0, errors };
  }
}
