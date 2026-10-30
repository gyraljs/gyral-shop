import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

import { gyral } from '@gyral/core/vite';
import { componentModules, scanEntries } from './vite.components.js';

export default defineConfig({
  test: {
    projects: [
      {
        // `optimize: 'auto'`: Vite's startup scan starts at the component modules, the entries
        // scanEntries() adds and this project's tests, so every browser import (axe-core
        // included) is pre-bundled before the first test and Vite never re-optimizes mid-run
        // (ADR 0001). Vitest isn't a custom server, so 'auto' is named here; gyralDevServer gets
        // it by default.
        plugins: [
          gyral({ optimize: 'auto', components: { modules: componentModules } }),
          scanEntries(),
        ],
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
