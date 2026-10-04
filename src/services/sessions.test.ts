import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type Db } from '../db/client.js';
import { sessions, users } from '../db/schema/accounts.js';
import { carts } from '../db/schema/commerce.js';
import {
  createSession,
  destroySession,
  destroyUserSessions,
  loadSession,
  purgeExpiredSessions,
  rotateSession,
  SESSION_TTL_MS,
  sessionExists,
  TOUCH_AFTER_MS,
} from './sessions.js';

let db: Db;
let userId: number;
const t0 = new Date('2026-10-04T12:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);

beforeEach(async () => {
  db = await createTestDb();
  const [row] = await db
    .insert(users)
    .values({ email: 'ann@example.com', name: 'Ann', passwordHash: 'scrypt$x$y' })
    .returning({ id: users.id });
  if (row === undefined) throw new Error('insert failed');
  userId = row.id;
});

describe('sessions', () => {
  it('creates opaque 32-byte ids and CSRF tokens, anonymous or for a member', async () => {
    const guest = await createSession(db, { now: t0 });
    const member = await createSession(db, { userId, now: t0 });
    expect(Buffer.from(guest.id, 'base64url')).toHaveLength(32);
    expect(Buffer.from(guest.csrfToken, 'base64url')).toHaveLength(32);
    expect(guest.id).not.toBe(member.id);
    expect(guest.user).toBeUndefined();
    expect(member.user).toMatchObject({ id: userId, email: 'ann@example.com', role: 'customer' });
    expect(member.expiresAt.getTime()).toBe(t0.getTime() + SESSION_TTL_MS);
  });

  it('loads live sessions and slides the expiry only after TOUCH_AFTER_MS', async () => {
    const s = await createSession(db, { userId, now: t0 });
    const soon = await loadSession(db, s.id, later(1000));
    expect(soon?.renewed).toBe(false);
    expect(soon?.session.expiresAt).toEqual(s.expiresAt);
    const stale = await loadSession(db, s.id, later(TOUCH_AFTER_MS));
    expect(stale?.renewed).toBe(true);
    expect(stale?.session.expiresAt.getTime()).toBe(
      later(TOUCH_AFTER_MS + SESSION_TTL_MS).getTime(),
    );
  });

  it('destroys expired sessions on sight', async () => {
    const s = await createSession(db, { now: t0 });
    expect(await loadSession(db, s.id, later(SESSION_TTL_MS))).toBeUndefined();
    expect(await sessionExists(db, s.id)).toBe(false);
  });

  it('ends sessions of disabled accounts', async () => {
    const s = await createSession(db, { userId, now: t0 });
    await db.update(users).set({ disabled: true }).where(eq(users.id, userId));
    expect(await loadSession(db, s.id, later(1))).toBeUndefined();
    expect(await sessionExists(db, s.id)).toBe(false);
    await expect(createSession(db, { userId })).rejects.toThrow(/disabled/);
  });

  it('rotates to a new id and CSRF token, moving the guest cart and deleting the old id', async () => {
    const old = await createSession(db, { now: t0 });
    await db.insert(carts).values({ sessionId: old.id });
    const next = await rotateSession(db, old.id, { userId, now: t0 });
    expect(next.id).not.toBe(old.id);
    expect(next.csrfToken).not.toBe(old.csrfToken);
    expect(next.user?.id).toBe(userId);
    expect(await sessionExists(db, old.id)).toBe(false);
    const [cart] = await db.select().from(carts);
    expect(cart?.sessionId).toBe(next.id);
  });

  it('destroy detaches a guest cart instead of failing on the foreign key', async () => {
    const s = await createSession(db);
    await db.insert(carts).values({ sessionId: s.id });
    await destroySession(db, s.id);
    expect(await sessionExists(db, s.id)).toBe(false);
    const [cart] = await db.select().from(carts);
    expect(cart?.sessionId).toBeNull();
  });

  it('ends all of a member’s sessions except the current one', async () => {
    const a = await createSession(db, { userId });
    const b = await createSession(db, { userId });
    await destroyUserSessions(db, userId, { except: b.id });
    expect(await sessionExists(db, a.id)).toBe(false);
    expect(await sessionExists(db, b.id)).toBe(true);
  });

  it('purges expired sessions', async () => {
    await createSession(db, { now: t0 });
    const fresh = await createSession(db, { now: later(SESSION_TTL_MS) });
    expect(await purgeExpiredSessions(db, later(SESSION_TTL_MS + 1))).toBe(1);
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await sessionExists(db, fresh.id)).toBe(true);
  });
});
