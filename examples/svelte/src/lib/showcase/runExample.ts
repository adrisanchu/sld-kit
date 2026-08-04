/**
 * In-browser evaluation harness for the API showcase.
 *
 * The showcase lets a visitor edit real `@sld-kit/core` builder code and see the
 * generated JSON + SVG update live. To run TypeScript source in the browser we:
 *   1. transpile it with sucrase (strip types, ESM → CJS), then
 *   2. execute it inside a `new Function` closure with a `require` shim that only
 *      resolves `@sld-kit/core` — every other import is rejected.
 *
 * The example code is expected to `export const doc = …` an `SldDocument` and may
 * optionally `export const exportOptions = …` (an `SvgExportOptions`, e.g. a theme
 * overlay). The JSON and SVG panels are always derived here from that `doc`, so
 * the three columns can never drift from one another — they all come from one run
 * through the real public pipeline (`Serializer` → `SvgExporter`).
 *
 * This is a client-only static demo, so evaluating the visitor's own code in
 * their own browser via `new Function` is acceptable.
 */
import * as sldCore from '@sld-kit/core';
import type { SldDocument, SvgExportOptions } from '@sld-kit/core';
import { transform } from 'sucrase';

export interface RunResult {
  /** Pretty-printed `Serializer.toJSON(doc)`, or `null` on error. */
  json: string | null;
  /** `SvgExporter.export(doc, exportOptions)`, or `null` on error. */
  svg: string | null;
  /** A user-presentable error message, or `null` when the run succeeded. */
  error: string | null;
}

interface ExampleModule {
  doc?: unknown;
  exportOptions?: unknown;
}

/** Transpile + execute one showcase snippet and derive its JSON and SVG. */
export function runExample(code: string): RunResult {
  try {
    const transpiled = transform(code, {
      transforms: ['typescript', 'imports'],
      preserveDynamicImport: false
    }).code;

    const shimRequire = (id: string): unknown => {
      if (id === '@sld-kit/core') return sldCore;
      throw new Error(`Only '@sld-kit/core' can be imported in the showcase (got '${id}').`);
    };
    const module = { exports: {} as ExampleModule };

    const run = new Function('require', 'exports', 'module', transpiled);
    run(shimRequire, module.exports, module);

    const doc = module.exports.doc as SldDocument | undefined;
    if (!doc) {
      throw new Error('Your code must `export const doc = …` an SldDocument.');
    }

    const options = module.exports.exportOptions as SvgExportOptions | undefined;
    const json = JSON.stringify(sldCore.Serializer.toJSON(doc), null, 2);
    const svg = new sldCore.SvgExporter().export(doc, options);
    return { json, svg, error: null };
  } catch (err) {
    return { json: null, svg: null, error: err instanceof Error ? err.message : String(err) };
  }
}
