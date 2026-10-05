import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

import { LIT_PACKAGES, optimizedDeps } from './vite.deps.js';

// Exactly one copy of Lit (ADR 0001, gyralVitePreset()).
const dedupe = [...LIT_PACKAGES];

export default defineConfig({
  resolve: { dedupe },
  test: {
    projects: [
      {
        resolve: { dedupe },
        // Every browser import, derived from the shop's source (vite.deps.ts), plus axe:
        // a new import changes this list, so Vite re-optimizes at startup instead of mid-run.
        optimizeDeps: { include: [...optimizedDeps(), 'axe-core'] },
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
