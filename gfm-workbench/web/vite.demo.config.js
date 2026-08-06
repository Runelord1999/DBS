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
 * Output goes to a folder at the repository root so GitHub Pages serves it
 * alongside the other dashboards. Paths are relative and routing is hash-based,
 * so it works from any sub-path without server rewrites.
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
    outDir: path.resolve(here, '../../gfm-workbench-demo'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
