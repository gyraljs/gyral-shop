// Sessions (docs/design-docs/0002-security.md): opaque random ids stored server-side, one
// CSRF token per session, sliding 30-day expiry, rotation on login and privilege change.
// Guests get anonymous sessions (userId null) so their cart survives until they log in.
import { randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions, users } from '../db/schema/accounts.js';
import { carts } from '../db/schema/commerce.js';
import { lockedWrite, writeTransaction } from '../db/tx.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding expiry is written at most this often, so most requests don't write. */
export const TOUCH_AFTER_MS = 5 * 60 * 1000;

export type Role = 'customer' | 'admin';

export interface SessionUser {
  readonly id: number;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

export interface Session {
  readonly id: string;
  readonly csrfToken: string;
  readonly userId: number | null;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  /** Present for member sessions whose account is active. */
  readonly user: SessionUser | undefined;
}

/** 32 random bytes, base64url: the cookie value and the CSRF token. */
export const newToken = (): string => randomBytes(32).toString('base64url');

const expiry = (now: Date): Date => new Date(now.getTime() + SESSION_TTL_MS);

async function findUser(db: Db, userId: number): Promise<SessionUser | undefined> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      disabled: users.disabled,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (row === undefined || row.disabled) return undefined;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Starts a session: anonymous (`userId` omitted) or for a member. */
export async function createSession(
  db: Db,
  options: { readonly userId?: number; readonly now?: Date } = {},
): Promise<Session> {
  const now = options.now ?? new Date();
  const userId = options.userId ?? null;
  const user = userId === null ? undefined : await findUser(db, userId);
  if (userId !== null && user === undefined) {
    throw new Error(`createSession: user ${String(userId)} does not exist or is disabled`);
  }
  const session: Session = {
    id: newToken(),
    csrfToken: newToken(),
    userId,
    expiresAt: expiry(now),
    lastSeenAt: now,
    user,
  };
  await lockedWrite(db, (w) =>
    w.insert(sessions).values({
      id: session.id,
      userId,
      csrfToken: session.csrfToken,
      createdAt: now,
      expiresAt: session.expiresAt,
      lastSeenAt: now,
    }),
  );
  return session;
}

/**
 * The live session for a cookie value, or undefined. Expired sessions and sessions of
 * disabled or deleted accounts are destroyed on sight. Renews the sliding expiry when the
 * last write is older than TOUCH_AFTER_MS (`renewed` tells the caller to re-send the cookie).
 */
export async function loadSession(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<{ readonly session: Session; readonly renewed: boolean } | undefined> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (row === undefined) return undefined;
  if (row.expiresAt.getTime() <= now.getTime()) {
    await destroySession(db, id);
    return undefined;
  }
  const user = row.userId === null ? undefined : await findUser(db, row.userId);
  if (row.userId !== null && user === undefined) {
    await destroySession(db, id);
    return undefined;
  }
  const stale = now.getTime() - row.lastSeenAt.getTime() >= TOUCH_AFTER_MS;
  const expiresAt = stale ? expiry(now) : row.expiresAt;
  const lastSeenAt = stale ? now : row.lastSeenAt;
  if (stale) {
    await lockedWrite(db, (w) =>
      w.update(sessions).set({ expiresAt, lastSeenAt }).where(eq(sessions.id, id)),
    );
  }
  const session: Session = {
    id: row.id,
    csrfToken: row.csrfToken,
    userId: row.userId,
    expiresAt,
    lastSeenAt,
    user,
  };
  return { session, renewed: stale };
}

/**
 * Replaces a session with a fresh id and CSRF token (login, logout-to-guest, role change),
 * so a session id known before the change is useless after it (session fixation).
 * The guest cart, if any, moves to the new session.
 */
export async function rotateSession(
  db: Db,
  oldId: string | undefined,
  options: { readonly userId?: number; readonly now?: Date } = {},
): Promise<Session> {
  return writeTransaction(db, async (tx) => {
    // A transaction has the same query API as the database for everything used here.
    const next = await createSession(tx as unknown as Db, options);
    if (oldId !== undefined) {
      await tx.update(carts).set({ sessionId: next.id }).where(eq(carts.sessionId, oldId));
      await tx.delete(sessions).where(eq(sessions.id, oldId));
    }
    return next;
  });
}

/** Ends a session. A guest cart attached to it is detached (kept for the cart epic to purge). */
export async function destroySession(db: Db, id: string): Promise<void> {
  await writeTransaction(db, async (tx) => {
    await tx.update(carts).set({ sessionId: null }).where(eq(carts.sessionId, id));
    await tx.delete(sessions).where(eq(sessions.id, id));
  });
}

/** Ends every session of a member (password change, account disabled). */
export async function destroyUserSessions(
  db: Db,
  userId: number,
  options: { readonly except?: string } = {},
): Promise<void> {
  const owned = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  for (const { id } of owned) {
    if (id !== options.except) await destroySession(db, id);
  }
}

/** Deletes expired sessions; returns how many. Safe to run on a timer. */
export async function purgeExpiredSessions(db: Db, now: Date = new Date()): Promise<number> {
  const expired = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(lt(sessions.expiresAt, now));
  for (const { id } of expired) await destroySession(db, id);
  return expired.length;
}

/** For tests and admin tools: the session row as stored. */
export async function sessionExists(db: Db, id: string): Promise<boolean> {
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, id));
  return rows.length > 0;
}
