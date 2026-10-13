// The nightly demo reset (docs/design-docs/0007-deployment.md): after a day of shopping, admin
// edits and sign-ups, resetToSeed leaves exactly what a fresh seed writes: every table's rows,
// the search index and the AUTOINCREMENT counters. Sessions are gone, so every visitor is
// signed out.
import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type Db } from '../../src/db/client.js';
import {
  analyticsEvents,
  departments,
  passwordResets,
  products,
  promoCodes,
  reviews,
  sessions,
  users,
  variants,
} from '../../src/db/schema.js';
import { insertSeed } from '../../src/db/seed/insert.js';
import { resetToSeed, resettableTables } from '../../src/db/seed/reset.js';
import { createSession, sessionExists } from '../../src/services/sessions.js';
import { smallCatalog, testApp } from '../support/app.js';
import { createMember, guest, loginAs } from '../support/auth.js';
import { placeOrder } from '../support/orders.js';

const SEEDED_AT = new Date('2026-10-13T07:00:00Z');
const hashes = () => new Map(smallCatalog().users.map((u) => [u.email, 'scrypt$test$test']));

/** Seeds with the clock at SEEDED_AT, so `created_at` defaults match between databases. */
async function atSeedTime<T>(write: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'], now: SEEDED_AT });
  try {
    return await write();
  } finally {
    vi.useRealTimers();
  }
}

/** Every row of every application table, the search index and the id counters. */
async function snapshot(db: Db): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of [
    ...(await resettableTables(db)),
    'sqlite_sequence',
    '__drizzle_migrations',
  ]) {
    out[table] = await db.all(sql.raw(`SELECT rowid AS _rowid, * FROM "${table}" ORDER BY rowid`));
  }
  return out;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('demo reset', () => {
  it('finds every table to empty, but not the search index internals or the journal', async () => {
    const tables = await resettableTables(await createTestDb());
    expect(tables).toContain('products_fts');
    expect(tables).toContain('sessions');
    expect(tables).toContain('outbox');
    expect(tables.some((t) => t.startsWith('products_fts_'))).toBe(false);
    expect(tables.some((t) => t.startsWith('sqlite_') || t.startsWith('__drizzle'))).toBe(false);
  });

  it('leaves exactly the fresh seed after a day of use', async () => {
    const fresh = await createTestDb();
    await atSeedTime(() => insertSeed(fresh, smallCatalog(), hashes()));
    const expected = await snapshot(fresh);

    const test = await testApp({ seed: false });
    await atSeedTime(() => insertSeed(test.db, smallCatalog(), hashes()));
    expect(await snapshot(test.db)).toEqual(expected);

    // A day of use: a sign-up who orders (cart, checkout, payment, stock, mail), reviews and
    // saves, a guest cart, consented analytics, a reset request, and admin edits.
    await createMember(test, {
      name: 'Demo Visitor',
      email: 'v@demo.test',
      password: 'pw-12345678',
    });
    const member = await loginAs(test, 'v@demo.test');
    const [variant] = await test.db
      .select({ sku: variants.sku, productId: variants.productId })
      .from(variants)
      .where(sql`${variants.stock} > 5`)
      .limit(1);
    if (variant === undefined) throw new Error('no variant in stock');
    const [product] = await test.db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, variant.productId));
    const slug = product?.slug ?? '';
    await placeOrder(member, { sku: variant.sku, qty: 2, email: 'v@demo.test' });
    const review = { rating: '5', title: 'Great demo', body: 'Bought it in the demo store.' };
    expect((await member.postForm(`/p/${slug}/review`, review)).status).toBe(303);
    expect((await member.postForm('/wishlist/add', { product: slug })).status).toBe(303);
    const someone = await guest(test);
    expect((await someone.postForm('/cart/add', { sku: variant.sku, quantity: '1' })).status).toBe(
      303,
    );
    const [visitor] = await test.db.select().from(users).where(eq(users.email, 'v@demo.test'));
    await test.db.insert(analyticsEvents).values({ kind: 'page_view', path: '/' });
    await test.db.insert(passwordResets).values({
      tokenHash: 'x',
      userId: visitor?.id ?? 0,
      expiresAt: new Date(),
    });
    await test.db.update(departments).set({ name: 'Renamed' }).where(eq(departments.id, 1));
    await test.db.update(promoCodes).set({ usedCount: 7 }).where(eq(promoCodes.code, 'WELCOME10'));
    await test.db.delete(reviews).where(eq(reviews.id, 1));
    expect(await snapshot(test.db)).not.toEqual(expected);

    await atSeedTime(() => resetToSeed(test.db, smallCatalog(), hashes()));

    expect(await snapshot(test.db)).toEqual(expected);
    expect(await test.db.select().from(sessions)).toEqual([]);
    expect(await sessionExists(test.db, member.session.id)).toBe(false);
    // The signed-out visitor is a guest again, and the store works on the new data.
    const page = await member.get('/');
    expect(page.status).toBe(200);
    expect(page.headers.get('set-cookie')).toContain('sid=;');
    expect((await test.get(`/p/${slug}`)).status).toBe(200);
  });

  it('rolls back completely when the reset fails, leaving the store as it was', async () => {
    const test = await testApp();
    await createMember(test, { name: 'Kept', email: 'kept@demo.test', password: 'pw-12345678' });
    const before = await snapshot(test.db);
    // A seed whose user has no password hash fails halfway through the inserts.
    await expect(resetToSeed(test.db, smallCatalog(), new Map())).rejects.toThrow(/password/);
    expect(await snapshot(test.db)).toEqual(before);
  });

  it('makes concurrent writers wait for it, then land on the new data', async () => {
    const test = await testApp({ seed: false });
    await atSeedTime(() => insertSeed(test.db, smallCatalog(), hashes()));
    const before = await guest(test);
    // Started while the reset runs: the write lock queues it behind the reset, so it neither
    // fails nor gets wiped by it.
    const reset = resetToSeed(test.db, smallCatalog(), hashes());
    const during = createSession(test.db);
    await reset;
    const after = await during;
    expect(await sessionExists(test.db, before.session.id)).toBe(false);
    expect(await sessionExists(test.db, after.id)).toBe(true);
  });
});
