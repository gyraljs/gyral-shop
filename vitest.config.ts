import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

import { LIT_PACKAGES } from './vite.config.js';

// Lit must be a single copy even though Gyral is linked from another repo (ADR 0001).
const dedupe = LIT_PACKAGES;

export default defineConfig({
  resolve: { dedupe },
  test: {
    projects: [
      {
        resolve: { dedupe },
        // Pre-bundle Lit directive modules and axe so the first run doesn't reload mid-test.
        optimizeDeps: {
          include: [
            'lit',
            'lit/directive.js',
            'lit/static-html.js',
            'lit/directives/class-map.js',
            'lit/directives/keyed.js',
            'lit/directives/live.js',
            'lit/directives/repeat.js',
            'lit/directives/style-map.js',
            '@lit-labs/ssr-client/lit-element-hydrate-support.js',
            'axe-core',
          ],
        },
        test: {
          name: 'browser',
          include: ['src/ui/**/*.test.ts', 'test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: [
            'src/{domain,config,db,services,server}/**/*.test.ts',
            'test/node/**/*.test.ts',
            'scripts/test/**/*.test.mjs',
          ],
          environment: 'node',
          // No-JS journeys drive a real Chromium through several page loads; under a loaded
          // machine (parallel agents, CI) the 5 s default flakes. Real hangs still fail.
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
