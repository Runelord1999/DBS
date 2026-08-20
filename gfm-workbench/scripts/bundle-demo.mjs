#!/usr/bin/env node
/**
 * Places the demo build where GitHub Pages serves it.
 *
 *   deliveryworkbench.html   entry page at the repository root, alongside the
 *                            sibling dashboards
 *   workbench-assets/        script, stylesheet, SQLite wasm runtime, dataset
 *
 * The assets are deliberately separate files. An earlier version inlined
 * everything into a single ~1.8 MB page, and every Pages deployment stalled at
 * the CDN publish step for as long as that file was present; this keeps the
 * largest file in the same range as the dashboards the site already serves.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(here, '../web/dist-demo');
const repoRoot = path.resolve(here, '../..');
const pageOut = path.join(repoRoot, 'deliveryworkbench.html');
const assetsOut = path.join(repoRoot, 'workbench-assets');

const indexPath = path.join(buildDir, 'index.html');
const assetsIn = path.join(buildDir, 'workbench-assets');

if (!fs.existsSync(indexPath) || !fs.existsSync(assetsIn)) {
  console.error(`Incomplete demo build at ${buildDir}. Run the Vite demo build first.`);
  process.exit(1);
}

// Replace the previous publish wholesale, so renamed hashed assets do not
// accumulate in the repository.
fs.rmSync(assetsOut, { recursive: true, force: true });
fs.cpSync(assetsIn, assetsOut, { recursive: true });
fs.copyFileSync(indexPath, pageOut);

const files = fs.readdirSync(assetsOut)
  .map((name) => ({ name, size: fs.statSync(path.join(assetsOut, name)).size }))
  .sort((a, b) => b.size - a.size);

const total = files.reduce((sum, f) => sum + f.size, fs.statSync(pageOut).size);
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

console.log(`Published demo → ${pageOut}`);
console.log(`  ${'deliveryworkbench.html'.padEnd(34)} ${mb(fs.statSync(pageOut).size)}`);
for (const f of files) {
  console.log(`  ${path.join('workbench-assets', f.name).padEnd(34)} ${mb(f.size)}`);
}
console.log(`  ${'total'.padEnd(34)} ${mb(total)}`);
