import { defineConfig } from 'vite';
import { gyral } from '@gyral/core/vite';
import { componentModules, scanEntries } from './vite.components.js';

// gyral(): the template compiler for `vite build` (templates precompiled and checked against
// Gyral's template rules; the runtime preparer leaves the bundle), and automatic components:
// each page loads the components it rendered (vite.components.ts). In dev it pre-bundles
// Gyral's packages, and `optimize: 'auto'` (the default under gyralDevServer, a custom server)
// starts Vite's dependency scan at every module that defines a component, plus the entries
// scanEntries() adds, so every browser import is pre-bundled at startup and Vite never
// re-optimizes mid-run (ADR 0001).
export default defineConfig({
  plugins: [gyral({ components: { modules: componentModules } }), scanEntries()],
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
