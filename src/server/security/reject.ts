// Turning a request away: an HTML page for browsers, JSON for fetch/API callers.
import type { Context } from 'hono';
import type { SecurityRejection } from '../../ui/pages/security-errors.js';
import { wantsJson } from './request.js';
import { runtime } from './runtime.js';

const STATUS: Readonly<Record<SecurityRejection, 403 | 429>> = {
  csrf: 403,
  forbidden: 403,
  'rate-limited': 429,
};

export async function reject(
  c: Context,
  kind: SecurityRejection,
  retryAfterMs = 0,
): Promise<Response> {
  const status = STATUS[kind];
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const response = wantsJson(c)
    ? Response.json({ error: kind }, { status })
    : await runtime(c).render(c, kind, status, retryAfterSeconds);
  if (kind === 'rate-limited') response.headers.set('retry-after', String(retryAfterSeconds));
  response.headers.set('cache-control', 'no-store');
  return response;
}
