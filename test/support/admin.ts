// Admin sessions for route tests (docs/design-docs/0005-testing.md).
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema/accounts.js';
import type { TestApp } from './app.js';
import { createMember, loginAs, type TestSession } from './auth.js';

export const ADMIN = { name: 'Ada Admin', email: 'ada.admin@example.com' } as const;

/** Creates an admin account (when missing) and signs in as it. */
export async function signInAdmin(test: TestApp): Promise<TestSession> {
  const [existing] = await test.db.select().from(users).where(eq(users.email, ADMIN.email));
  if (existing === undefined) {
    await createMember(test, { ...ADMIN, password: 'admin-password-for-tests-9' });
    await test.db.update(users).set({ role: 'admin' }).where(eq(users.email, ADMIN.email));
  }
  return loginAs(test, ADMIN.email);
}

/** GET a JSON API route as `who`, parsing the body. */
export async function getJson(
  who: TestSession,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const res = await who.get(path, { headers: { accept: 'application/json' } });
  return { status: res.status, body: await res.json() };
}
