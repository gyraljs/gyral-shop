// Session helpers for route tests (docs/design-docs/0005-testing.md): sign in without going
// through the login form, then send requests carrying the session cookie and CSRF token.
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema/accounts.js';
import { SESSION_COOKIE } from '../../src/server/security/index.js';
import { registerMember } from '../../src/services/accounts.js';
import { createSession, type Session } from '../../src/services/sessions.js';
import { CSRF_FIELD, CSRF_HEADER } from '../../src/ui/forms/csrf.js';
import type { TestApp } from './app.js';

export interface TestSession {
  readonly session: Session;
  /** `Cookie` header value. */
  readonly cookie: string;
  /** GET with the session cookie. */
  readonly get: (path: string, init?: RequestInit) => Promise<Response>;
  /** POST a form with the session cookie and CSRF field. */
  readonly postForm: (path: string, fields?: Record<string, string>) => Promise<Response>;
  /** POST JSON with the session cookie and `x-csrf-token` header. */
  readonly postJson: (path: string, body: unknown) => Promise<Response>;
}

function bind(test: TestApp, session: Session): TestSession {
  const cookie = `${SESSION_COOKIE}=${session.id}`;
  const withCookie = (init: RequestInit = {}): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), cookie },
  });
  return {
    session,
    cookie,
    get: (path, init) => test.get(path, withCookie(init)),
    postForm: (path, fields = {}) =>
      test.get(
        path,
        withCookie({
          method: 'POST',
          body: new URLSearchParams({ ...fields, [CSRF_FIELD]: session.csrfToken }),
        }),
      ),
    postJson: (path, body) =>
      test.get(
        path,
        withCookie({
          method: 'POST',
          headers: { 'content-type': 'application/json', [CSRF_HEADER]: session.csrfToken },
          body: JSON.stringify(body),
        }),
      ),
  };
}

/** Signs in as an existing user (seeded or created by the test). */
export async function loginAs(test: TestApp, email: string): Promise<TestSession> {
  const [user] = await test.db.select().from(users).where(eq(users.email, email));
  if (user === undefined) throw new Error(`loginAs: no user ${email}`);
  return bind(test, await createSession(test.db, { userId: user.id, now: test.now() }));
}

/** An anonymous (guest) session. */
export async function guest(test: TestApp): Promise<TestSession> {
  return bind(test, await createSession(test.db, { now: test.now() }));
}

/** The seeded admin and a seeded customer. */
export const ADMIN_EMAIL = 'admin@shop.test';
export async function anyCustomerEmail(test: TestApp): Promise<string> {
  const [row] = await test.db.select().from(users).where(eq(users.role, 'customer')).limit(1);
  if (row === undefined) throw new Error('no seeded customer');
  return row.email;
}

/** Creates a member with a real password hash, for tests that sign in through the forms. */
export async function createMember(
  test: TestApp,
  member: { readonly name: string; readonly email: string; readonly password: string },
): Promise<void> {
  const created = await registerMember(test.db, member);
  if (!created.ok) throw new Error(`createMember: ${created.error._tag}`);
}

/** The session id a response set (login rotates it), or undefined. */
export function sessionCookie(response: Response): string | undefined {
  const header = response.headers.get('set-cookie') ?? '';
  const id = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(header)?.[1];
  return id === undefined || id === '' ? undefined : id;
}
