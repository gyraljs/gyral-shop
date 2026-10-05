import { describe, expect, it } from 'vitest';
import { importsOf, optimizedDeps } from '../../vite.deps.js';

describe('vite.deps (pre-bundled browser dependencies)', () => {
  it('reads static, re-exported and dynamic imports but not type-only ones', () => {
    const source = [
      "import { html } from 'lit';",
      "import type { Foo } from 'not-at-runtime';",
      "export { x } from './local.js';",
      "import 'side-effect';",
      "const m = await import('lazy-module');",
    ].join('\n');
    expect(importsOf(source)).toEqual(['lit', './local.js', 'side-effect', 'lazy-module']);
  });

  it('covers the browser graph, including linked Gyral, and leaves server modules out', () => {
    const deps = optimizedDeps();
    expect(deps).toContain('valibot');
    expect(deps).toContain('@lit-labs/ssr-client');
    expect(deps).toContain('@gyral/core > effect');
    for (const serverOnly of [
      'hono',
      '@hono/node-server',
      'drizzle-orm',
      '@libsql/client',
      'playwright',
    ]) {
      expect(deps).not.toContain(serverOnly);
    }
  });
});
