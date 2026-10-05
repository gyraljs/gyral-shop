// CSRF protection (docs/design-docs/0002-security.md): state-changing requests must carry
// the session's token in the `_csrf` form field or the `x-csrf-token` header. Requests whose
// Origin is another site are refused outright; SameSite=Lax cookies are defence in depth.
import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { CSRF_FIELD, CSRF_HEADER } from '../../ui/forms/csrf.js';
import type { AppEnv } from './context.js';
import { reject } from './reject.js';
import { acceptedOrigins } from './request.js';
import { runtime } from './runtime.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data'];

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

async function submittedToken(request: Request): Promise<string | undefined> {
  const header = request.headers.get(CSRF_HEADER);
  if (header !== null) return header;
  const type = request.headers.get('content-type') ?? '';
  if (!FORM_TYPES.some((t) => type.startsWith(t))) return undefined;
  // A clone: handlers (and Gyral formAction) still need to read the original body.
  const value = (await request.clone().formData()).get(CSRF_FIELD);
  return typeof value === 'string' ? value : undefined;
}

function crossSite(request: Request, accepted: ReadonlySet<string>): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin !== 'null' && !accepted.has(origin);
}

/**
 * Paths verified by origin alone (no session token): the consent form is shown to every
 * first-time visitor, and requiring a token would start a session for each of them. These
 * requests must prove they come from this site with `Origin` or `Sec-Fetch-Site` (OWASP's
 * standard-header verification); a request with neither is refused. ADR 0002 addendum.
 */
export const ORIGIN_VERIFIED_PATHS: ReadonlySet<string> = new Set(['/consent']);

function provenSameOrigin(request: Request, accepted: ReadonlySet<string>): boolean {
  const origin = request.headers.get('origin');
  if (origin !== null) return accepted.has(origin);
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

export const csrfMiddleware = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const accepted = acceptedOrigins(c.req.raw, c.get('siteOrigin'), runtime(c).trustProxy ?? false);
  if (ORIGIN_VERIFIED_PATHS.has(c.req.path)) {
    return provenSameOrigin(c.req.raw, accepted) ? next() : reject(c, 'csrf');
  }
  const session = c.get('session');
  const token = await submittedToken(c.req.raw);
  if (crossSite(c.req.raw, accepted) || session === undefined || token === undefined) {
    return reject(c, 'csrf');
  }
  if (!same(token, session.csrfToken)) return reject(c, 'csrf');
  return next();
};
