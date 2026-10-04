// CSRF protection (docs/design-docs/0002-security.md): state-changing requests must carry
// the session's token in the `_csrf` form field or the `x-csrf-token` header. Requests whose
// Origin is another site are refused outright; SameSite=Lax cookies are defence in depth.
import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { CSRF_FIELD, CSRF_HEADER } from '../../ui/forms/csrf.js';
import type { AppEnv } from './context.js';
import { reject } from './reject.js';

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

function crossSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin !== 'null' && origin !== new URL(request.url).origin;
}

export const csrfMiddleware = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const session = c.get('session');
  const token = await submittedToken(c.req.raw);
  if (crossSite(c.req.raw) || session === undefined || token === undefined) {
    return reject(c, 'csrf');
  }
  if (!same(token, session.csrfToken)) return reject(c, 'csrf');
  return next();
};
