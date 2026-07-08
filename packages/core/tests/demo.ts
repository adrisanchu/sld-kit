/**
 * Smoke demo — builds the "Example 400 kV" fixture, checks the JSON
 * roundtrip, and prints the exported standalone SVG to stdout.
 *
 *   pnpm --filter @sld-kit/core demo > /tmp/example.svg
 *
 * Open the SVG in a browser (or drop it into PowerPoint) to eyeball the
 * rendering. The same logic is asserted by the vitest suite.
 */
import { Serializer, SvgExporter } from '../src';
import { buildExampleHv } from './fixtures';

const doc = buildExampleHv();

const json = Serializer.toJSON(doc);
const restored = Serializer.fromJSON(JSON.parse(JSON.stringify(json)));
if (restored.all().length !== doc.all().length) {
  console.error(`Roundtrip mismatch: ${doc.all().length} elements in, ${restored.all().length} out`);
  process.exit(1);
}

const svg = new SvgExporter().export(restored);
console.error(`OK: ${restored.all().length} elements, roundtrip stable, SVG ${svg.length} bytes`);
console.log(svg);
