import { count, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db/client.js';
import { products, users } from '../db/schema.js';
import { generateCatalog } from '../db/seed/generate.js';
import { CUSTOMER_PASSWORD, demoSeed, isEmpty, prepareDemo } from './demo.js';
import { verifyPassword } from './passwords.js';

describe('demo seeding', () => {
  it('hashes the admin password it is given and the public customer password', async () => {
    const data = generateCatalog({ productsPerCategory: 1, customers: 2 });
    const seed = await demoSeed('a-long-private-password', data);
    const admin = seed.passwordHashes.get('admin@shop.test') ?? '';
    expect(await verifyPassword('a-long-private-password', admin)).toBe(true);
    const customer = data.users.find((u) => u.role === 'customer')?.email ?? '';
    expect(await verifyPassword(CUSTOMER_PASSWORD, seed.passwordHashes.get(customer) ?? '')).toBe(
      true,
    );
  });

  it('migrates and seeds an empty database at startup, and keeps a seeded one', async () => {
    const db = await openDb(':memory:'); // not even migrated, like a new volume
    const config = {
      NODE_ENV: 'production',
      SEED_ADMIN_PASSWORD: 'a-long-private-password',
    } as const;
    expect(await prepareDemo(db, config)).toBe('seeded');
    expect(await isEmpty(db)).toBe(false);
    const [n] = await db.select({ n: count() }).from(products);
    const [admin] = await db.select().from(users).where(eq(users.email, 'admin@shop.test'));
    expect(await verifyPassword('a-long-private-password', admin?.passwordHash ?? '')).toBe(true);
    expect(await prepareDemo(db, config)).toBe('kept');
    const [again] = await db.select({ n: count() }).from(products);
    expect(again?.n).toBe(n?.n);
  }, 30_000);

  it('refuses to seed in production with the public admin password, before any write', async () => {
    const db = await openDb(':memory:');
    await expect(prepareDemo(db, { NODE_ENV: 'production' })).rejects.toThrow(
      /SEED_ADMIN_PASSWORD/,
    );
    expect(await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)).toEqual([]);
  });
});
