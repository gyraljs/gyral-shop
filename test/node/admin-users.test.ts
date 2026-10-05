// Admin users and review moderation (docs/product-specs/admin.md, "Users" and "Reviews").
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { migrateDb, openDb } from '../../src/db/client.js';
import { users } from '../../src/db/schema/accounts.js';
import { products } from '../../src/db/schema/catalog.js';
import { createReview } from '../../src/db/repos/reviews.js';
import { AdminReviewListSchema, UserListSchema } from '../../src/domain/admin-manage.js';
import { changeUser } from '../../src/services/admin-users.js';
import type { SessionUser } from '../../src/services/sessions.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs, type TestSession } from '../support/auth.js';
import { ADMIN, getJson, signInAdmin } from '../support/admin.js';
import { insertCartFixture, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let admin: TestSession;

const GRACE = { name: 'Grace Hopper', email: 'grace@example.com', password: 'correct-horse-9x' };

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  await createMember(test, GRACE);
  admin = await signInAdmin(test);
});

const idOf = async (email: string) => {
  const [row] = await test.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (row === undefined) throw new Error(`no user ${email}`);
  return row.id;
};

const act = (id: number, action: string, confirm = 'yes') =>
  admin.submitForm(`/api/admin/users/${String(id)}`, { userId: String(id), action, confirm });

describe('users', () => {
  it('lists and searches members, marking the signed-in admin', async () => {
    const all = v.parse(UserListSchema, (await getJson(admin, '/api/admin/users')).body);
    expect(all.rows.map((r) => r.email)).toEqual(
      expect.arrayContaining([GRACE.email, ADMIN.email, 'ann@example.com']),
    );
    expect(all.self).toBe(await idOf(ADMIN.email));
    const found = v.parse(UserListSchema, (await getJson(admin, '/api/admin/users?q=HOPPER')).body);
    expect(found.rows.map((r) => r.email)).toEqual([GRACE.email]);
    const none = v.parse(UserListSchema, (await getJson(admin, '/api/admin/users?q=%25')).body);
    expect(none.total).toBe(0); // % is matched literally, not as a wildcard
  });

  it('promotes and demotes, ending the member’s sessions each time', async () => {
    const grace = await loginAs(test, GRACE.email);
    const id = await idOf(GRACE.email);
    const promoted = await act(id, 'promote');
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toEqual({
      _tag: 'UserUpdated',
      id,
      role: 'admin',
      disabled: false,
    });
    // The old session is gone: Grace signs in again to use her new role.
    expect((await grace.get('/api/admin/dashboard')).status).toBe(401);
    const again = await loginAs(test, GRACE.email);
    expect((await again.get('/api/admin/dashboard')).status).toBe(200);
    expect((await act(id, 'demote')).status).toBe(200);
    expect((await again.get('/api/admin/dashboard')).status).toBe(401);
  });

  it('disables an account (signed out, can’t sign in) and enables it again', async () => {
    const grace = await loginAs(test, GRACE.email);
    const id = await idOf(GRACE.email);
    expect((await act(id, 'disable')).status).toBe(200);
    expect((await grace.get('/account')).status).toBe(303);
    const [row] = await test.db.select().from(users).where(eq(users.id, id));
    expect(row?.disabled).toBe(true);
    expect((await act(id, 'enable')).status).toBe(200);
    expect((await (await loginAs(test, GRACE.email)).get('/account')).status).toBe(200);
  });

  it('needs confirmation, and refuses changes to the admin’s own account', async () => {
    const id = await idOf(GRACE.email);
    const unconfirmed = await act(id, 'disable', 'no');
    expect(unconfirmed.status).toBe(422);
    const self = await idOf(ADMIN.email);
    for (const action of ['demote', 'disable']) {
      const res = await act(self, action);
      expect(res.status, action).toBe(422);
      expect(((await res.json()) as { issues: { path: string }[] }).issues[0]?.path).toBe('');
    }
    expect((await act(9999, 'promote')).status).toBe(404);
    // The path and the form must name the same user.
    const mismatched = await admin.submitForm(`/api/admin/users/${String(id)}`, {
      userId: String(self),
      action: 'promote',
      confirm: 'yes',
    });
    expect(mismatched.status).toBe(404);
  });
});

describe('review moderation', () => {
  it('hides a review from the product’s rating and shows it again', async () => {
    const [lego] = await test.db.select().from(products).where(eq(products.slug, 'lego'));
    const productId = lego?.id ?? 0;
    const graceId = await idOf(GRACE.email);
    const annId = await idOf('ann@example.com');
    await createReview(test.db, {
      productId,
      userId: graceId,
      rating: 5,
      title: 'Great',
      body: 'Fun set.',
    });
    const second = await createReview(test.db, {
      productId,
      userId: annId,
      rating: 1,
      title: 'Spam',
      body: 'Buy now!!',
    });
    const reviewId = second.ok ? second.value.id : 0;

    const list = v.parse(
      AdminReviewListSchema,
      (await getJson(admin, '/api/admin/reviews?q=lego')).body,
    );
    expect(list.rows.map((r) => r.title)).toEqual(['Spam', 'Great']);

    const hide = await admin.submitForm(`/api/admin/reviews/${String(reviewId)}/visibility`, {
      reviewId: String(reviewId),
      hidden: 'yes',
    });
    expect(hide.status).toBe(200);
    expect(await hide.json()).toEqual({
      _tag: 'ReviewModerated',
      id: reviewId,
      hidden: true,
      rating: { sum: 5, count: 1 },
    });
    const hidden = v.parse(
      AdminReviewListSchema,
      (await getJson(admin, '/api/admin/reviews?filter=hidden')).body,
    );
    expect(hidden.rows.map((r) => r.id)).toEqual([reviewId]);

    const show = await admin.submitForm(`/api/admin/reviews/${String(reviewId)}/visibility`, {
      reviewId: String(reviewId),
      hidden: 'no',
    });
    expect(((await show.json()) as { rating: unknown }).rating).toEqual({ sum: 6, count: 2 });
    expect(
      (
        await admin.submitForm('/api/admin/reviews/9999/visibility', {
          reviewId: '9999',
          hidden: 'yes',
        })
      ).status,
    ).toBe(404);
  });
});

describe('the last-admin rule under concurrency', () => {
  // A file database: concurrent requests need more than the in-memory database's one connection.
  let dir: string;
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('never leaves the store without an active admin, even when two admins race', async () => {
    dir = mkdtempSync(join(tmpdir(), 'shop-admins-'));
    const db = await openDb(`file:${join(dir, 'shop.db')}`);
    await migrateDb(db);
    const rows = await db
      .insert(users)
      .values([
        { email: 'ada@example.com', name: 'Ada', passwordHash: 'scrypt$x$y', role: 'admin' },
        { email: 'grace@example.com', name: 'Grace', passwordHash: 'scrypt$x$y', role: 'admin' },
      ])
      .returning({ id: users.id });
    const [adaId, graceId] = rows.map((r) => r.id);
    if (adaId === undefined || graceId === undefined) throw new Error('no users');
    // Each admin acts on a snapshot taken before either change (two requests at once).
    const ada: SessionUser = { id: adaId, email: 'ada@example.com', name: 'Ada', role: 'admin' };
    const grace: SessionUser = {
      id: graceId,
      email: 'grace@example.com',
      name: 'Grace',
      role: 'admin',
    };
    const [first, second] = await Promise.all([
      changeUser(db, ada, graceId, 'demote'),
      changeUser(db, grace, adaId, 'demote'),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(await db.select().from(users).where(eq(users.role, 'admin'))).toHaveLength(1);
  });
});
