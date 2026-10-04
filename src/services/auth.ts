// Credential checks for login (docs/design-docs/0002-security.md). Callers rate-limit first.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users } from '../db/schema/accounts.js';
import { err, ok, type Result } from '../domain/result.js';
import { hashPassword, verifyPassword } from './passwords.js';
import type { SessionUser } from './sessions.js';

export type LoginError = { readonly _tag: 'InvalidCredentials' } | { readonly _tag: 'Disabled' };

/** Emails are stored lowercased and trimmed; compare the same way. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// Verifying against a real hash when the email is unknown keeps the response time the same,
// so timing doesn't reveal which emails have accounts.
let decoy: Promise<string> | undefined;
const decoyHash = () => (decoy ??= hashPassword('not-a-real-password-decoy'));

export async function authenticate(
  db: Db,
  email: string,
  password: string,
): Promise<Result<SessionUser, LoginError>> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  if (row === undefined) {
    await verifyPassword(password, await decoyHash());
    return err({ _tag: 'InvalidCredentials' });
  }
  if (!(await verifyPassword(password, row.passwordHash))) {
    return err({ _tag: 'InvalidCredentials' });
  }
  // Checked after the password, so a wrong password never reveals that an account is disabled.
  if (row.disabled) return err({ _tag: 'Disabled' });
  return ok({ id: row.id, email: row.email, name: row.name, role: row.role });
}

/** User-facing text. Never says whether the email exists. */
export function loginErrorMessage(error: LoginError): string {
  switch (error._tag) {
    case 'InvalidCredentials':
      return 'That email and password do not match an account.';
    case 'Disabled':
      return 'This account is disabled. Contact support.';
  }
}
