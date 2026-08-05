// CodePen "Prefill API" payload for a live, browser-side @sld-kit/core demo.
// Mirrors examples/node/index.ts, but imports the (published, zero-dep ESM) core
// from a CDN and injects the exported SVG into the DOM instead of writing a file.
// https://blog.codepen.io/documentation/prefill/

// Keep this spec in sync with examples/node/index.ts.
const demoJs = `import { buildDocument, SvgExporter } from 'https://esm.sh/@sld-kit/core';

// A document is a matrix of rows × cols bounded by bus bars. Describe it
// declaratively — buildDocument auto-names, auto-sizes, wires and validates.
const doc = buildDocument({
  meta: { name: 'My substation' },
  busbars: [
    { label: 'BB1', row: 0 },
    { label: 'BB2', row: 2 }
  ],
  bays: [
    {
      col: 0,
      positions: [{ type: 'line', row: 1, feeder: { asset: 'line', label: 'FEEDER A' } }]
    }
  ]
});

// One LayoutEngine backs both the live view and the exporter — office-safe SVG.
document.getElementById('app').innerHTML = new SvgExporter().export(doc);
`;

const demoHtml = `<!-- @sld-kit/core — build a single-line diagram and render its SVG -->
<div id="app" style="max-width: 640px; margin: 2rem auto;"></div>
`;

const demoCss = `body {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: #0b0f14;
}
#app svg {
  width: 100%;
  height: auto;
}
`;

/** JSON payload for a `<input name="data">` posted to codepen.io/pen/define. */
export const CODEPEN_PREFILL = JSON.stringify({
  title: '@sld-kit/core — quickstart',
  description: 'Build a single-line diagram and export an office-safe SVG.',
  tags: ['sld-kit', 'svg', 'diagram'],
  html: demoHtml,
  css: demoCss,
  js: demoJs,
  js_module: true,
  editors: '1110' // HTML+CSS+JS open, console closed
});
