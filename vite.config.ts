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
});
