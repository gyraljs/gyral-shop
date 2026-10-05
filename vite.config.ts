import { defineConfig } from 'vite';
import { LIT_PACKAGES, optimizedDeps } from './vite.deps.js';

// gyralVitePreset() (via vite.deps.ts): exactly one copy of Lit (ADR 0001). optimizeDeps lists
// every browser import up front so Vite never re-optimizes mid-run.
export default defineConfig({
  resolve: { dedupe: [...LIT_PACKAGES] },
  optimizeDeps: { include: optimizedDeps() },
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
