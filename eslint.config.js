// Lint rules are agent guardrails: every restriction message says how to fix it.
// Layers and allowed edges: ARCHITECTURE.md. No Effect in app code: docs/design-docs/0001-stack.md.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import compat from 'eslint-plugin-compat';
import globals from 'globals';

const NO_EFFECT = {
  group: ['effect', 'effect/*', '@effect/*'],
  message:
    'gyral-shop app code does not use Effect (docs/design-docs/0001-stack.md). Use plain TypeScript: tagged unions for errors, Promises for async.',
};
const NO_DIRECT_LIT_INTERNALS = {
  group: ['@gyral/*/src/*'],
  message: 'Import Gyral packages by their public entry point (@gyral/core, …), never src/ paths.',
};

// Lit is used only through Gyral (@gyral/core re-exports html, css, directives). Raw LitElement
// components are unsafe in production builds: the client entry's top-level await lets Rolldown
// evaluate Lit before '@gyral/ssr/hydrate', so Lit's hydrate support never patches LitElement.
// Gyral's define() hydrates by itself; raw Lit would render a second copy (gyral-czi.41).
const RAW_LIT_MESSAGE =
  "Build components with @gyral/core define() and import html/css/directives through it. Raw LitElement components break hydration in production builds (docs/design-docs/0005-testing.md, 'Production builds').";
/** The bare 'lit' module exports LitElement; matched by exact name (patterns are gitignore-style). */
const NO_RAW_LIT_PATH = { name: 'lit', message: RAW_LIT_MESSAGE };
const NO_RAW_LIT = {
  // Modules that export LitElement/ReactiveElement or decorators; directives such as
  // lit/directives/* and lit/static-html.js are fine.
  group: [
    'lit/decorators*',
    'lit-element',
    'lit-element/*',
    '@lit/reactive-element',
    '@lit/reactive-element/*',
  ],
  message: RAW_LIT_MESSAGE,
};

/** Layer rule: files in `layer` may not import from the listed layers. */
const layer = (name, forbidden, why) => ({
  files: [`src/${name}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [NO_RAW_LIT_PATH],
        patterns: [
          NO_EFFECT,
          NO_DIRECT_LIT_INTERNALS,
          NO_RAW_LIT,
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
      'no-restricted-syntax': [
        'error',
        {
          // Lit SSR serializes `.checked=${false}` as checked="false", which checks the box.
          selector:
            'TaggedTemplateExpression[tag.name=/^(html|serverHtml)$/] TemplateElement[value.raw=/\\.(checked|selected|open|indeterminate|defaultChecked)=$/]',
          message:
            'Bind boolean form state with ?checked=${liveBoolean(x)} (from @gyral/core), not a .checked property binding: server rendering turns .checked=${false} into checked="false" (Gyral ADR 0012).',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': [
        'error',
        { paths: [NO_RAW_LIT_PATH], patterns: [NO_EFFECT, NO_DIRECT_LIT_INTERNALS, NO_RAW_LIT] },
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
