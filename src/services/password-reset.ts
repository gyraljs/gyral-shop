// Password reset by emailed link (docs/product-specs/accounts.md, ADR 0002): single-use
// tokens, stored only as a SHA-256 hash, valid for 30 minutes. Callers rate-limit and always
// answer the request the same way, whether or not the email has an account.
import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { passwordResets, users } from '../db/schema/accounts.js';
import { err, ok, type Result } from '../domain/result.js';
import { normalizeEmail } from './auth.js';
import { setPassword } from './profile.js';
import { newToken, type SessionUser } from './sessions.js';

export const RESET_TTL_MINUTES = 30;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface ResetIssued {
  readonly to: string;
  readonly name: string;
  readonly token: string;
}

/**
 * Issues a reset token for an active account, replacing any earlier unused ones. Returns
 * undefined for unknown or disabled accounts (the caller must not reveal which).
 */
export async function issueReset(
  db: Db,
  email: string,
  now: Date = new Date(),
): Promise<ResetIssued | undefined> {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, disabled: users.disabled })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  const token = newToken(); // generated either way, so both branches do similar work
  if (user === undefined || user.disabled) return undefined;
  await db.transaction(async (tx) => {
    await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000),
      createdAt: now,
    });
  });
  return { to: user.email, name: user.name, token };
}

const live = (token: string, now: Date) =>
  and(
    eq(passwordResets.tokenHash, hashToken(token)),
    isNull(passwordResets.usedAt),
    gt(passwordResets.expiresAt, now),
  );

/** Whether a token can still be used (for showing the form). */
export async function resetIsValid(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (token === '') return false;
  const [row] = await db
    .select({ id: passwordResets.id })
    .from(passwordResets)
    .where(live(token, now));
  return row !== undefined;
}

export type ResetError = { readonly _tag: 'InvalidToken' };

/** Uses the token once and sets the new password. Returns the member to sign in. */
export async function completeReset(
  db: Db,
  token: string,
  password: string,
  now: Date = new Date(),
): Promise<Result<SessionUser, ResetError>> {
  // Marking it used first, in one statement, means two concurrent submits can't both win.
  const [claimed] = await db
    .update(passwordResets)
    .set({ usedAt: now })
    .where(live(token, now))
    .returning({ userId: passwordResets.userId });
  if (claimed === undefined) return err({ _tag: 'InvalidToken' });
  await setPassword(db, claimed.userId, password);
  const [user] = await db.select().from(users).where(eq(users.id, claimed.userId));
  if (user === undefined || user.disabled) return err({ _tag: 'InvalidToken' });
  return ok({ id: user.id, email: user.email, name: user.name, role: user.role });
}
