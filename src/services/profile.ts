// Account settings a signed-in member changes about themselves: name, email, password
// (docs/product-specs/accounts.md, docs/design-docs/0002-security.md). Callers rate-limit and
// rotate the session; these functions only enforce what needs the database.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users } from '../db/schema/accounts.js';
import { lockedWrite } from '../db/tx.js';
import { err, ok, type Result } from '../domain/result.js';
import { normalizeEmail } from './auth.js';
import { hashPassword, verifyPassword } from './passwords.js';

export type ProfileError =
  | { readonly _tag: 'WrongPassword' }
  | { readonly _tag: 'EmailTaken' }
  | { readonly _tag: 'UnknownUser' };

const MESSAGES: Readonly<Record<ProfileError['_tag'], string>> = {
  WrongPassword: 'Your current password is not correct.',
  EmailTaken: 'Another account already uses this email.',
  UnknownUser: 'Your account could not be found. Sign in again.',
};

export const profileErrorMessage = (error: ProfileError): string => MESSAGES[error._tag];

export async function updateName(db: Db, userId: number, name: string): Promise<void> {
  await lockedWrite(db, () =>
    db.update(users).set({ name: name.trim() }).where(eq(users.id, userId)),
  );
}

/** Checks the member's current password (always runs scrypt, so timing is uniform). */
async function checkPassword(
  db: Db,
  userId: number,
  password: string,
): Promise<Result<void, ProfileError>> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (row === undefined) return err({ _tag: 'UnknownUser' });
  return (await verifyPassword(password, row.passwordHash))
    ? ok(undefined)
    : err({ _tag: 'WrongPassword' });
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  /UNIQUE constraint failed/i.test(`${error.message} ${String(error.cause)}`);

/** Changing the email needs the current password, and the new email must be free. */
export async function changeEmail(
  db: Db,
  userId: number,
  password: string,
  newEmail: string,
): Promise<Result<string, ProfileError>> {
  const checked = await checkPassword(db, userId, password);
  if (!checked.ok) return checked;
  const email = normalizeEmail(newEmail);
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (taken !== undefined && taken.id !== userId) return err({ _tag: 'EmailTaken' });
  try {
    await lockedWrite(db, () => db.update(users).set({ email }).where(eq(users.id, userId)));
  } catch (error) {
    if (isUniqueViolation(error)) return err({ _tag: 'EmailTaken' });
    throw error;
  }
  return ok(email);
}

export async function changePassword(
  db: Db,
  userId: number,
  current: string,
  next: string,
): Promise<Result<void, ProfileError>> {
  const checked = await checkPassword(db, userId, current);
  if (!checked.ok) return checked;
  await setPassword(db, userId, next);
  return ok(undefined);
}

/** Stores a new password hash (also used by password reset). */
export async function setPassword(db: Db, userId: number, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await lockedWrite(db, () => db.update(users).set({ passwordHash }).where(eq(users.id, userId)));
}
