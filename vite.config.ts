import { defineConfig } from 'vite';

// Gyral is linked from ../cyclejs-web-framework, which has its own node_modules. Exactly one
// copy of Lit must run (ADR 0001): dedupe resolves these from this project's node_modules.
export const LIT_PACKAGES = [
  'lit',
  'lit-html',
  'lit-element',
  '@lit/reactive-element',
  '@lit-labs/ssr',
  '@lit-labs/ssr-client',
];

export default defineConfig({
  resolve: { dedupe: LIT_PACKAGES },
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
