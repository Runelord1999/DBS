import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Static demo build — the version published to the DBS site.
 *
 * It bundles the real route modules and runs them in the browser against a wasm
 * SQLite copy of the seeded portfolio, so the demo cannot drift from the tool.
 * Three aliases make that possible:
 *
 *   express      → a minimal router shim (the routes are otherwise unmodified)
 *   node:crypto  → a stub; the demo has no password flow
 *   @server      → the server source tree, imported directly
 *
 * The output is folded into a single self-contained .html file at the
 * repository root (see scripts/bundle-demo.mjs), matching how the other DBS
 * dashboards are published. `assetsInlineLimit` is set high enough to embed the
 * SQLite wasm runtime and the seeded dataset as data URIs, and routing is
 * hash-based, so the page works from any URL with no server rewrites.
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
    // Embed every asset, including the ~660 KB wasm runtime and the seeded
    // database, so the bundler leaves nothing to fetch at runtime.
    assetsInlineLimit: 8 * 1024 * 1024,
    // One chunk, so the page has a single <script> to inline.
    codeSplitting: false,
    chunkSizeWarningLimit: 4000,
    reportCompressedSize: false,
  },
});
