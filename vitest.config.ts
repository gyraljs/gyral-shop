import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Lit must be a single copy even though Gyral is linked from another repo (ADR 0001).
const dedupe = ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'];

export default defineConfig({
  resolve: { dedupe },
  test: {
    projects: [
      {
        resolve: { dedupe },
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
        },
      },
    ],
  },
});
