// Member registration (docs/product-specs/accounts.md). Validation happens at the boundary
// (the shared valibot schema); this only enforces what needs the database.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { users } from '../db/schema/accounts.js';
import { err, ok, type Result } from '../domain/result.js';
import { normalizeEmail } from './auth.js';
import { hashPassword } from './passwords.js';
import type { SessionUser } from './sessions.js';

export type RegisterError = { readonly _tag: 'EmailTaken' };

export interface NewMember {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  /UNIQUE constraint failed/i.test(`${error.message} ${String(error.cause)}`);

export async function registerMember(
  db: Db,
  member: NewMember,
): Promise<Result<SessionUser, RegisterError>> {
  const email = normalizeEmail(member.email);
  // Hash before looking the email up, so a taken email answers no faster than a new one.
  const passwordHash = await hashPassword(member.password);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing !== undefined) return err({ _tag: 'EmailTaken' });
  try {
    const [row] = await db
      .insert(users)
      .values({ email, name: member.name.trim(), passwordHash, role: 'customer' })
      .returning();
    if (row === undefined) throw new Error('registerMember: insert returned no row');
    return ok({ id: row.id, email: row.email, name: row.name, role: row.role });
  } catch (error) {
    // Two registrations racing for the same email: the second loses at the unique index.
    if (isUniqueViolation(error)) return err({ _tag: 'EmailTaken' });
    throw error;
  }
}

const MESSAGES: Readonly<Record<RegisterError['_tag'], string>> = {
  EmailTaken: 'An account with this email already exists. Sign in instead.',
};

export const registerErrorMessage = (error: RegisterError): string => MESSAGES[error._tag];
