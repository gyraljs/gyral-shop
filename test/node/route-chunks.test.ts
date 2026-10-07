// The server's route-chunk table names exactly the modules the browser loads lazily, by their
// Vite manifest key (a wrong key would make production's preload() throw for that page).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTE_CHUNKS } from '../../src/server/route-chunks.js';

const lazySource = readFileSync(new URL('../../src/client/lazy.ts', import.meta.url), 'utf8');
const lazyModules = [...lazySource.matchAll(/import\('\.\.\/(ui\/[^']+)\.js'\)/g)].map(
  ([, path]) => `src/${String(path)}.ts`,
);

describe('route chunks', () => {
  it('match the modules src/client/lazy.ts imports, one for one', () => {
    expect(lazyModules.length).toBeGreaterThan(0);
    expect([...new Set(Object.values(ROUTE_CHUNKS))].sort()).toEqual(
      [...new Set(lazyModules)].sort(),
    );
  });
});
