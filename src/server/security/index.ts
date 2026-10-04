// Security for gyral-shop (docs/design-docs/0002-security.md). Install once in createApp:
//
//   installSecurity(app, { db, dev, render });
//
// Then, in routes:
//   app.get('/account', requireUser(), …)        members only (guests → login?next=…)
//   app.get('/admin/*', requireAdmin(), …)       admins only
//   const token = await csrfTokenFor(c)          → csrfField(token) in every POST form
//   const limited = limit(c, loginLimiter, [`ip:${ip(c)}`, `acct:${email}`]); if (limited) return limited;
//   await startMemberSession(c, user)            after authenticate() succeeds (rotates the id)
//   await endSession(c)                          logout
import type { Context, Hono } from 'hono';
import type { AppEnv } from './context.js';
import { csrfMiddleware } from './csrf.js';
import { securityHeaders } from './headers.js';
import type { SlidingWindowLimiter } from './rate-limit.js';
import { reject } from './reject.js';
import { clientIp } from './request.js';
import { attachRuntime, runtime, type SecurityOptions } from './runtime.js';
import { sessionMiddleware } from './sessions.js';

export type { AppEnv, SecurityVariables } from './context.js';
export { scriptSafeJson } from './json.js';
export { LIMITS, SlidingWindowLimiter, type RateLimitResult } from './rate-limit.js';
export { safeNext, wantsJson } from './request.js';
export { LOGIN_PATH, loginRedirect, requireAdmin, requireUser } from './roles.js';
export type { SecurityOptions } from './runtime.js';
export {
  csrfTokenFor,
  endSession,
  ensureSession,
  SESSION_COOKIE,
  startMemberSession,
} from './sessions.js';

/** Registers headers, sessions and CSRF checks, in that order, for every route. */
export function installSecurity(app: Hono<AppEnv>, options: SecurityOptions): void {
  app.use('*', async (c, next) => {
    attachRuntime(c, options);
    await next();
  });
  app.use('*', securityHeaders({ dev: options.dev ?? false }));
  app.use('*', sessionMiddleware());
  app.use('*', csrfMiddleware());
}

/** The client IP used as a rate-limit key. */
export const ip = (c: Context): string => clientIp(c, runtime(c).trustProxy ?? false);

/**
 * Counts an attempt against every key (e.g. per IP and per account). Returns the 429
 * response to send when any key is over its limit, or undefined to carry on.
 */
export async function limit(
  c: Context,
  limiter: SlidingWindowLimiter,
  keys: readonly string[],
): Promise<Response | undefined> {
  const result = limiter.hitAll(keys);
  return result.allowed ? undefined : reject(c, 'rate-limited', result.retryAfterMs);
}
