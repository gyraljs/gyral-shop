// Lint rules are agent guardrails: every restriction message says how to fix it.
// Layers and allowed edges: ARCHITECTURE.md. No Effect in app code: docs/design-docs/0001-stack.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import compat from 'eslint-plugin-compat';
import globals from 'globals';
import gyral from '@gyral/core/eslint';

const NO_EFFECT = {
  group: ['effect', 'effect/*', '@effect/*'],
  message:
    'gyral-shop app code does not use Effect (docs/design-docs/0001-stack.md). Use plain TypeScript: tagged unions for errors, Promises for async.',
};
const NO_DIRECT_GYRAL_INTERNALS = {
  group: ['@gyral/*/src/*'],
  message: 'Import Gyral packages by their public entry point (@gyral/core, …), never src/ paths.',
};

// Gyral 0.3 has its own view layer (Gyral ADR 0018): html, css, nothing, each, raw and the hooks
// come from @gyral/core. Lit is not a dependency; a Lit import would add a second renderer.
const NO_LIT_MESSAGE =
  'Import html, css, nothing, each, raw and the element hooks from @gyral/core (Gyral 0.3 has its own view layer; Lit is not a dependency).';
const NO_LIT_PATH = { name: 'lit', message: NO_LIT_MESSAGE };
const NO_LIT = {
  group: [
    'lit/*',
    'lit-html',
    'lit-html/*',
    'lit-element',
    'lit-element/*',
    '@lit/*',
    '@lit-labs/*',
  ],
  message: NO_LIT_MESSAGE,
};

/** Layer rule: files in `layer` may not import from the listed layers. */
const layer = (name, forbidden, why) => ({
  files: [`src/${name}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [NO_LIT_PATH],
        patterns: [
          NO_EFFECT,
          NO_DIRECT_GYRAL_INTERNALS,
          NO_LIT,
          ...forbidden.map((f) => ({
            // Relative paths only, so npm packages that happen to share a layer name
            // (e.g. `@libsql/client`) are not caught.
            group: [`../${f}/*`, `../../${f}/*`, `../../../${f}/*`],
            message: `src/${name} must not import src/${f}: ${why} (ARCHITECTURE.md).`,
          })),
        ],
      },
    ],
  },
});

export default tseslint.config(
  {
    ignores: [
      '.beads/**',
      '**/dist/**',
      'coverage/**',
      '.pnpm-store/**',
      '.claude/worktrees/**',
      'drizzle/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': [
        'error',
        { paths: [NO_LIT_PATH], patterns: [NO_EFFECT, NO_DIRECT_GYRAL_INTERNALS, NO_LIT] },
      ],
    },
  },
  layer(
    'domain',
    ['config', 'db', 'services', 'server', 'ui', 'client'],
    'domain is pure business rules with no I/O',
  ),
  layer('config', ['db', 'services', 'server', 'ui', 'client'], 'config only parses settings'),
  layer(
    'db',
    ['services', 'server', 'ui', 'client'],
    'repositories know tables, not use-cases or HTTP',
  ),
  layer('services', ['server', 'ui', 'client'], 'use-cases are transport-agnostic'),
  layer('server', ['client'], 'the server renders ui/ but never imports the browser entry'),
  layer(
    'ui',
    ['config', 'db', 'services', 'server', 'client'],
    'ui/ ships to the browser; talk to the server over HTTP only',
  ),
  layer(
    'client',
    ['config', 'db', 'services', 'server'],
    'the browser bundle must not contain server code',
  ),
  // Gyral's template rules (view/09-template-rules.md) and pure `each` rows (view/03-lists.md),
  // with the same messages as `vite build`'s template compiler.
  { files: ['src/**/*.ts', 'test/**/*.ts'], ...gyral.configs.recommended },
  {
    files: ['src/ui/**/*.ts', 'src/client/**/*.ts'],
    plugins: { compat },
    languageOptions: { globals: globals.browser },
    rules: { 'compat/compat': 'error' },
  },
  {
    // Every database write goes through the write lock (src/db/tx.ts): libsql's synchronous
    // driver fails or deadlocks concurrent writers otherwise. Seed, migration and the lock
    // itself are the only exceptions.
    files: ['src/**/*.ts'],
    ignores: ['src/db/tx.ts', 'src/db/client.ts', 'src/db/seed/**', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          "CallExpression[callee.property.name=/^(insert|update|delete|transaction|run)$/][callee.object.name='db']",
          "CallExpression[callee.property.name=/^(insert|update|delete|transaction|run)$/][callee.object.property.name='db']",
        ].map((selector) => ({
          selector,
          message:
            'Write through the lock: lockedWrite(db, (w) => w.insert(…)) or writeTransaction(db, (tx) => …) from src/db/tx.ts. Unlocked writes fail with SQLITE_BUSY/TRANSACTION_ACTIVE under concurrency.',
        })),
      ],
    },
  },
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { globals: globals.node } },
);
