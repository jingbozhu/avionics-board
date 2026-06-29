/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// base:'./' → relative asset URLs so the built dist/ works when served from any
// host/IP on the LAN (the three TVs hit http://<pi-ip>:<port>/).
export default defineConfig({
  base: './',
  // `as any`: vitest bundles its own copy of vite, so @preact/preset-vite's Plugin
  // type (top-level vite) doesn't structurally match vitest/config's Plugin type.
  plugins: [preact() as any],
  server: {
    proxy: {
      // dev: forward the fleet API + SSE stream to the LAN node server (server/index.mjs)
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0, // never inline the Earth textures / heli art
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
