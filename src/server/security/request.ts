// Small request facts shared by the security middleware.
import type { Context } from 'hono';

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
 * The peer address `toNodeListener` (`@gyral/ssr/node`) passes as the env's `remoteAddress`
 * (src/server/prod.ts, dev.ts). In-process requests (`app.request` in tests) have no env.
 */
function remoteAddress(env: unknown): string | undefined {
  if (typeof env !== 'object' || env === null || !('remoteAddress' in env)) return undefined;
  return typeof env.remoteAddress === 'string' ? env.remoteAddress : undefined;
}

/**
 * The client IP for rate limiting. Proxy headers are only trusted when `trustProxy` is set,
 * otherwise anyone could pick their own key.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded !== undefined && forwarded !== '') return forwarded;
  }
  return remoteAddress(c.env) ?? 'unknown';
}

/** A `?next=` target that is a same-site path, or `/` (prevents open redirects). */
export function safeNext(next: string | undefined): string {
  if (next === undefined || !next.startsWith('/') || next.startsWith('//')) return '/';
  let hasControl = false;
  for (let i = 0; i < next.length; i += 1) if (next.charCodeAt(i) < 0x20) hasControl = true;
  if (next.includes('\\') || hasControl) return '/';
  return next;
}

/**
 * Origins a same-site request may claim. The request URL's own origin always counts; behind a
 * reverse proxy that URL is internal, so the configured SITE_ORIGIN counts too, and, only when
 * `trustProxy` is set, the origin the proxy forwards (X-Forwarded-Proto/Host).
 */
export function acceptedOrigins(
  request: Request,
  siteOrigin: string | undefined,
  trustProxy: boolean,
): ReadonlySet<string> {
  const origins = new Set([new URL(request.url).origin]);
  if (siteOrigin !== undefined) origins.add(siteOrigin);
  if (trustProxy) {
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'https';
    if (host !== undefined && host !== '' && /^https?$/.test(proto)) {
      origins.add(`${proto}://${host}`);
    }
  }
  return origins;
}
