import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // This build talks to the real API, so the in-browser demo — and with it
      // the server route modules and the SQLite wasm runtime — resolves to a
      // stub and stays out of the bundle.
      '@demo': path.resolve(here, 'src/demo/disabled.js'),
    },
  },
  server: {
    port: 5173,
    // The API runs as its own process in development; in production the same
    // Express process serves this build from web/dist.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
