#!/usr/bin/env node
/**
 * Folds the demo build into a single self-contained HTML file.
 *
 * The other dashboards on the DBS site are standalone .html files served from
 * the repository root, and this one is published the same way. Vite has already
 * inlined the SQLite runtime and the seeded dataset as data URIs (the demo
 * config sets a very high assetsInlineLimit); this step inlines the remaining
 * stylesheet and script so the page has no external references at all.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(here, '../web/dist-demo');
const output = path.resolve(here, '../../deliveryworkbench.html');

const indexPath = path.join(buildDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`No demo build at ${buildDir}. Run the Vite demo build first.`);
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

const readAsset = (src) => {
  const relative = src.replace(/^\.?\//, '');
  const file = path.join(buildDir, relative);
  if (!fs.existsSync(file)) throw new Error(`Referenced asset is missing: ${src}`);
  return fs.readFileSync(file, 'utf8');
};

// <link rel="stylesheet" href="./assets/x.css"> → <style>…</style>
html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_match, href) => `<style>\n${readAsset(href)}\n</style>`
);

// <script type="module" src="./assets/x.js"> → <script type="module">…</script>
html = html.replace(
  /<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>/g,
  (_match, before, src, after) => {
    const attrs = `${before}${after}`.replace(/\scrossorigin/g, '').trim();
    // The bundle is inlined verbatim; </script> inside a string literal would
    // otherwise close the tag early.
    const code = readAsset(src).replace(/<\/script>/gi, '<\\/script>');
    return `<script ${attrs}>\n${code}\n</script>`;
  }
);

if (/(src|href)="\.?\/?assets\//.test(html)) {
  console.error('Refusing to write: the page still references external assets.');
  process.exit(1);
}

fs.writeFileSync(output, html);

const mb = (fs.statSync(output).size / (1024 * 1024)).toFixed(2);
console.log(`Wrote self-contained demo → ${output} (${mb} MB)`);
