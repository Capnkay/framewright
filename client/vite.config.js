// client/vite.config.js
//
// Port 5173 is stated in README.md's run-command table, so it is pinned rather
// than left to Vite's "next free port" behaviour — a demo script that names a
// URL should not depend on what else happens to be listening.
//
// `strictPort` makes a clash fail loudly at boot instead of quietly serving on
// 5174 while the rehearsed URL 404s.
//
// The /api proxy exists so the browser talks to one origin in development. The
// Node API is on 5000 (.env.example's VITE_API_URL), and without this every
// fetch from the preview would be a cross-origin request needing CORS on the
// server. VITE_API_URL still governs at build time; this only smooths dev.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
