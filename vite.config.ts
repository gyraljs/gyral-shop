import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';
import { componentModules } from './vite.components.js';
import { optimizedDeps } from './vite.deps.js';

// gyralVitePreset(): the template compiler for `vite build` (templates precompiled and checked
// against Gyral's template rules; the runtime preparer leaves the bundle), and automatic
// components: each page loads the components it rendered (vite.components.ts). optimizeDeps
// lists every browser import up front so Vite never re-optimizes mid-run.
export default defineConfig({
  ...gyralVitePreset({ optimize: optimizedDeps(), components: { modules: componentModules } }),
  server: { port: 5200 },
  // Production client build (`pnpm build`, Gyral ADR 0016): the browser entry (shell components
  // and the page-wide http driver) plus the components loader and each component's chunk; the
  // manifests map them to content-hashed files for the server and the prerender step.
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: 'src/client/entry.ts' }, // CLIENT_ENTRY_SOURCE in prod-app.ts
  },
});
