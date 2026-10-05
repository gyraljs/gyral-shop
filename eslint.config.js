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

/** Layer rule: files in `layer` may not import from the listed layers. */
const layer = (name, forbidden, why) => ({
  files: [`src/${name}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          NO_EFFECT,
          NO_DIRECT_LIT_INTERNALS,
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
      'no-restricted-imports': ['error', { patterns: [NO_EFFECT, NO_DIRECT_LIT_INTERNALS] }],
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
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { globals: globals.node } },
);
