// Route tests (Node): the real Hono app over a migrated in-memory database with a small,
// deterministic slice of the seed. See docs/design-docs/0005-testing.md.
import { createTestDb, type Db } from '../../src/db/client.js';
import { generateCatalog, type SeedData } from '../../src/db/seed/generate.js';
import { insertSeed } from '../../src/db/seed/insert.js';
import { createApp } from '../../src/server/app.js';

export const CLIENT_ENTRY = '/src/client/entry.ts';

/** Generated once per test file: 2 products per category (74 products), 5 customers. */
let small: SeedData | undefined;
export const smallCatalog = (): SeedData =>
  (small ??= generateCatalog({ productsPerCategory: 2, customers: 5 }));

/** Fake hash: route tests that log in will use services/passwords explicitly. */
const FAKE_HASH = 'scrypt$test$test';

export interface TestApp {
  readonly db: Db;
  readonly app: ReturnType<typeof createApp>;
  readonly get: (path: string, init?: RequestInit) => Promise<Response>;
  readonly html: (path: string) => Promise<string>;
}

export async function testApp(options: { readonly seed?: boolean } = {}): Promise<TestApp> {
  const db = await createTestDb();
  if (options.seed !== false) {
    const data = smallCatalog();
    await insertSeed(db, data, new Map(data.users.map((u) => [u.email, FAKE_HASH])));
  }
  const app = createApp({ clientEntry: CLIENT_ENTRY, db });
  const get = async (path: string, init?: RequestInit) => app.request(path, init);
  const html = async (path: string) => (await get(path)).text();
  return { db, app, get, html };
}
