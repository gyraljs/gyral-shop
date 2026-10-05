import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cartLines, carts, checkouts, users, variants } from '../db/schema.js';
import { testApp } from '../../test/support/app.js';
import { purgeOrphanedCarts, purgeStale, startPurgeSchedule } from './maintenance.js';
import { createSession, SESSION_TTL_MS, sessionExists } from './sessions.js';

const t0 = new Date('2026-10-04T12:00:00Z');
const later = (ms: number) => new Date(t0.getTime() + ms);

/** A seeded database with a guest cart (one line + a checkout draft) on a fresh session. */
async function guestWithCart() {
  const { db } = await testApp();
  const session = await createSession(db, { now: t0 });
  const [variant] = await db.select({ id: variants.id }).from(variants).limit(1);
  if (variant === undefined) throw new Error('no variants');
  const [cart] = await db
    .insert(carts)
    .values({ sessionId: session.id })
    .returning({ id: carts.id });
  if (cart === undefined) throw new Error('no cart');
  await db.insert(cartLines).values({ cartId: cart.id, variantId: variant.id, quantity: 1 });
  await db.insert(checkouts).values({ cartId: cart.id, email: 'guest@example.com' });
  return { db, session, cartId: cart.id };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('maintenance', () => {
  it('purges expired sessions and the guest carts they orphan, with lines and drafts', async () => {
    const { db, session, cartId } = await guestWithCart();
    expect(await purgeStale(db, later(SESSION_TTL_MS - 1))).toEqual({ sessions: 0, carts: 0 });

    expect(await purgeStale(db, later(SESSION_TTL_MS + 1))).toEqual({ sessions: 1, carts: 1 });
    expect(await sessionExists(db, session.id)).toBe(false);
    expect(await db.select().from(carts).where(eq(carts.id, cartId))).toEqual([]);
    expect(await db.select().from(cartLines).where(eq(cartLines.cartId, cartId))).toEqual([]);
    expect(await db.select().from(checkouts).where(eq(checkouts.cartId, cartId))).toEqual([]);
  });

  it("keeps live guest carts and members' carts", async () => {
    const { db } = await guestWithCart();
    const [member] = await db.select({ id: users.id }).from(users).limit(1);
    if (member === undefined) throw new Error('no users');
    await db.insert(carts).values({ userId: member.id });
    expect(await purgeOrphanedCarts(db)).toBe(0);
    expect(await db.select().from(carts)).toHaveLength(2);
  });

  it('runs at start and then on every interval, without overlapping', async () => {
    vi.useFakeTimers();
    const { db } = await guestWithCart();
    const log = vi.fn();
    let now = t0;
    const stop = startPurgeSchedule(db, { intervalMs: 1000, now: () => now, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(log).not.toHaveBeenCalled(); // nothing stale yet

    now = later(SESSION_TTL_MS + 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toHaveBeenCalledWith('purged 1 sessions, 1 guest carts');

    stop();
    log.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(log).not.toHaveBeenCalled();
  });
});
