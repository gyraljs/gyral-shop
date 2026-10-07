import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';
import { optimizedDeps } from './vite.deps.js';

// gyralVitePreset(): the template compiler for `vite build` (templates precompiled and checked
// against Gyral's template rules; the runtime preparer leaves the bundle). optimizeDeps lists
// every browser import up front so Vite never re-optimizes mid-run.
export default defineConfig({
  ...gyralVitePreset({ optimize: optimizedDeps() }),
  server: { port: 5200 },
  // Production client build (`pnpm build`, Gyral ADR 0016): only the browser entry is bundled;
  // the manifest maps it to its content-hashed file for the server and the prerender step.
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: 'src/client/entry.ts' }, // CLIENT_ENTRY_SOURCE in prod-app.ts
  },
});
