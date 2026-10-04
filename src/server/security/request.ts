// Small request facts shared by the security middleware.
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/** True when the client wants JSON (fetch with an API Accept header, JSON body or CSRF header). */
export function wantsJson(c: Context): boolean {
  const accept = c.req.header('accept') ?? '';
  const type = c.req.header('content-type') ?? '';
  return (
    c.req.path.startsWith('/api/') ||
    type.includes('application/json') ||
    (accept.includes('application/json') && !accept.includes('text/html'))
  );
}

/** HTTPS, directly or behind a proxy that says so. */
export function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';
}

/**
 * The client IP for rate limiting. Proxy headers are only trusted when `trustProxy` is set,
 * otherwise anyone could pick their own key. In-process test requests have no socket.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded !== undefined && forwarded !== '') return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** A `?next=` target that is a same-site path, or `/` (prevents open redirects). */
export function safeNext(next: string | undefined): string {
  if (next === undefined || !next.startsWith('/') || next.startsWith('//')) return '/';
  let hasControl = false;
  for (let i = 0; i < next.length; i += 1) if (next.charCodeAt(i) < 0x20) hasControl = true;
  if (next.includes('\\') || hasControl) return '/';
  return next;
}
