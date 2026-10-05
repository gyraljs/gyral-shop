// Rate-limited forms answer like any other rejected form (docs/product-specs/accounts.md): the
// same page re-rendered with a form-level message, but with status 429 and Retry-After, rather
// than the generic security error page. JSON callers (submitForm) get the plain 429.
import type { Context } from 'hono';
import type { IntentRejected } from '@gyral/core';
import { wantsJson, type AppEnv, type SlidingWindowLimiter } from './security/index.js';

/** Counts an attempt against every key; returns the wait in ms when any key is over. */
export function overLimit(
  limiter: SlidingWindowLimiter,
  keys: readonly string[],
): number | undefined {
  const result = limiter.hitAll(keys);
  return result.allowed ? undefined : Math.max(1000, result.retryAfterMs);
}

export const tooManyAttempts = (intent: string, retryAfterMs: number): IntentRejected => {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return {
    _tag: 'IntentRejected',
    intent,
    issues: [
      {
        path: '',
        message: `Too many attempts. Try again in ${String(minutes)} minute${minutes === 1 ? '' : 's'}.`,
      },
    ],
  };
};

/** The 429 answer: the form page with a message (HTML) or a JSON error. */
export async function limitedResponse(
  c: Context<AppEnv>,
  intent: string,
  retryAfterMs: number,
  renderPage: (rejected: IntentRejected) => Promise<Response>,
): Promise<Response> {
  const seconds = String(Math.ceil(retryAfterMs / 1000));
  const response = wantsJson(c)
    ? Response.json({ error: 'rate-limited' }, { status: 429 })
    : await renderPage(tooManyAttempts(intent, retryAfterMs));
  const headers = new Headers(response.headers);
  headers.set('retry-after', seconds);
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: 429, headers });
}
