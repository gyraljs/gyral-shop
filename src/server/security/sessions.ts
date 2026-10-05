// Session middleware and the route helpers built on it (docs/design-docs/0002-security.md).
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  createSession,
  destroySession,
  loadSession,
  rotateSession,
  SESSION_TTL_MS,
  type Session,
  type SessionUser,
} from '../../services/sessions.js';
import { mergeGuestCart } from '../../services/cart.js';
import type { AppEnv } from './context.js';
import { isHttps } from './request.js';
import { now, runtime } from './runtime.js';

export const SESSION_COOKIE = 'sid';

/** Requests that never need a session (images and icons): no cookie lookup, no DB read. */
const SKIP = [/^\/img\//, /^\/favicon\.svg$/];

function sendCookie(c: Context, session: Session): void {
  setCookie(c, SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: isHttps(c),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function use(c: Context<AppEnv>, session: Session | undefined): void {
  c.set('session', session);
  c.set('user', session?.user);
}

export const sessionMiddleware = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  use(c, undefined);
  if (SKIP.some((re) => re.test(c.req.path))) return next();
  const id = getCookie(c, SESSION_COOKIE);
  if (id !== undefined) {
    const loaded = await loadSession(runtime(c).db, id, now(c));
    if (loaded === undefined) deleteCookie(c, SESSION_COOKIE, { path: '/' });
    else {
      use(c, loaded.session);
      if (loaded.renewed) sendCookie(c, loaded.session);
    }
  }
  await next();
};

/** The visitor's session, starting an anonymous one if needed (guest carts, CSRF tokens). */
export async function ensureSession(c: Context<AppEnv>): Promise<Session> {
  const current = c.get('session');
  if (current !== undefined) return current;
  const session = await createSession(runtime(c).db, { now: now(c) });
  use(c, session);
  sendCookie(c, session);
  return session;
}

/** The CSRF token to embed in a page's forms (starts a session if needed). */
export async function csrfTokenFor(c: Context<AppEnv>): Promise<string> {
  return (await ensureSession(c)).csrfToken;
}

/**
 * After a successful login (or a role change): a fresh session id and CSRF token for this
 * member. The guest cart moves along and is merged into the member's cart.
 */
export async function startMemberSession(c: Context<AppEnv>, user: SessionUser): Promise<Session> {
  const session = await rotateSession(runtime(c).db, c.get('session')?.id, {
    userId: user.id,
    now: now(c),
  });
  // The guest cart moved to the new session with the rotation; fold it into the member's cart.
  await mergeGuestCart(runtime(c).db, session.id, user.id);
  use(c, session);
  sendCookie(c, session);
  return session;
}

/** Logout: the session is destroyed and the cookie cleared. */
export async function endSession(c: Context<AppEnv>): Promise<void> {
  const current = c.get('session');
  if (current !== undefined) await destroySession(runtime(c).db, current.id);
  use(c, undefined);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
