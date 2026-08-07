import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Static demo build — the version published to the dashboards site.
 *
 * It bundles the real route modules and runs them in the browser against a wasm
 * SQLite copy of the seeded portfolio, so the demo cannot drift from the tool.
 * Three aliases make that possible:
 *
 *   express      → a minimal router shim (the routes are otherwise unmodified)
 *   node:crypto  → a stub; the demo has no password flow
 *   @server      → the server source tree, imported directly
 *
 * Output is an entry page at the repository root — deliveryworkbench.html, to
 * match the sibling dashboards — with its runtime beside it in
 * workbench-assets/ (see scripts/bundle-demo.mjs).
 *
 * The assets are kept as separate files rather than inlined into the page. A
 * single ~1.8 MB HTML file was the previous shape, and every GitHub Pages
 * deployment stalled at the CDN publish step while it was present; splitting it
 * keeps the largest file near the size of files this site already serves.
 * Routing is hash-based, so the page still works from any URL with no server
 * rewrites.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  define: {
    'import.meta.env.VITE_STATIC_DEMO': JSON.stringify('1'),
  },
  resolve: {
    alias: {
      '@demo': path.resolve(here, 'src/demo/server.js'),
      express: path.resolve(here, 'src/demo/express-shim.js'),
      'node:crypto': path.resolve(here, 'src/demo/node-crypto.js'),
      '@server': path.resolve(here, '../server/src'),
    },
  },
  optimizeDeps: {
    include: ['sql.js'],
  },
  build: {
    outDir: path.resolve(here, 'dist-demo'),
    emptyOutDir: true,
    sourcemap: false,
    // Assets land beside the page rather than inside it.
    assetsDir: 'workbench-assets',
    // Default inlining: the wasm runtime and the seeded database stay as their
    // own files instead of becoming multi-megabyte data URIs.
    assetsInlineLimit: 4096,
    // One JS chunk, so the entry page needs a single <script> tag and no
    // relative-path juggling for lazy chunks.
    codeSplitting: false,
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: false,
  },
});
