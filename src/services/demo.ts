// The public demo (docs/design-docs/0007-deployment.md): the deterministic department store
// that `pnpm db:seed` writes, the startup step that migrates and seeds an empty database, and
// the reset that puts a live database back to that state every night (./demo-schedule.ts).
import { count } from 'drizzle-orm';
import { seedAdminPassword, type Config } from '../config/env.js';
import { migrateDb, type Db } from '../db/client.js';
import { products } from '../db/schema.js';
import { generateCatalog, type SeedData } from '../db/seed/generate.js';
import { insertSeed } from '../db/seed/insert.js';
import { resetToSeed } from '../db/seed/reset.js';
import { hashPassword } from './passwords.js';

/** Every seeded customer's password. Public on purpose: visitors sign in with it. */
export const CUSTOMER_PASSWORD = 'gyral-customer-2026';

/** Seed data with its users' password hashes, ready to write. */
export interface DemoSeed {
  readonly data: SeedData;
  readonly passwordHashes: ReadonlyMap<string, string>;
}

/**
 * The full catalog with hashed passwords: the admin gets `adminPassword`, customers
 * CUSTOMER_PASSWORD. Computed before any write, so a reset holds the write lock only to write.
 */
export async function demoSeed(
  adminPassword: string,
  data: SeedData = generateCatalog(),
): Promise<DemoSeed> {
  const [adminHash, customerHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword(CUSTOMER_PASSWORD),
  ]);
  const passwordHashes = new Map(
    data.users.map((u) => [u.email, u.role === 'admin' ? adminHash : customerHash]),
  );
  return { data, passwordHashes };
}

/** True when the database has no products yet (fresh, or never seeded). */
export async function isEmpty(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(products);
  return (row?.n ?? 0) === 0;
}

/** Puts a live database back to the seed state in one transaction (db/seed/reset.ts). */
export async function resetDemo(db: Db, seed: DemoSeed): Promise<void> {
  await resetToSeed(db, seed.data, seed.passwordHashes);
}

/**
 * Demo startup, before the server listens: applies pending migrations (an empty volume, or an
 * image with new ones), then seeds an empty database. A seeded database is left as it is, so
 * a restart keeps the day's orders until the next reset. Returns what it did, for the log.
 */
export async function prepareDemo(
  db: Db,
  config: Pick<Config, 'NODE_ENV' | 'SEED_ADMIN_PASSWORD'>,
): Promise<'seeded' | 'kept'> {
  const password = seedAdminPassword(config); // throws in production with the public default
  await migrateDb(db);
  if (!(await isEmpty(db))) return 'kept';
  const seed = await demoSeed(password);
  await insertSeed(db, seed.data, seed.passwordHashes);
  return 'seeded';
}
