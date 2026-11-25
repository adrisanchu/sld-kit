/**
 * Write the FICTIONAL sample batch (see `src/samples/sampleBatch.ts`) to a
 * folder, one JSON file per diagram, to try the app's "Choose folder" import:
 *
 *   node scripts/gen-sample-batch.mjs <out-dir> [seed]
 *
 * Needs Node ≥ 22.18 (it imports the TypeScript source directly).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { sampleBatch } from '../src/samples/sampleBatch.ts';

const [outDir, seed] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/gen-sample-batch.mjs <out-dir> [seed]');
  process.exit(1);
}
const dir = resolve(outDir);
mkdirSync(dir, { recursive: true });
const files = sampleBatch(seed ? Number(seed) : undefined);
for (const f of files) writeFileSync(join(dir, basename(f.path)), f.text);
console.log(`Wrote ${files.length} fictional diagrams to ${dir}`);
