// Security headers (docs/design-docs/0002-security.md). The Content-Security-Policy itself is
// built in ../csp.ts (style hashes need the page stylesheets and Gyral's component registry).
import type { MiddlewareHandler } from 'hono';
import { pagePolicy } from '../csp.js';
import type { AppEnv } from './context.js';
import { isHttps } from './request.js';

/**
 * Every security header for a response. Pure, so the production server can apply the same set
 * to prerendered files it serves without going through the app (src/server/prod-app.ts).
 */
export function securityHeaderValues(options: {
  readonly https: boolean;
  /** The Content-Security-Policy header value (../csp.ts pagePolicy). */
  readonly csp: string;
}): Readonly<Record<string, string>> {
  return {
    'content-security-policy': options.csp,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    ...(options.https
      ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' }
      : {}),
  };
}

export const securityHeaders =
  (options: { readonly dev: boolean }): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    await next();
    const headers = c.res.headers;
    const csp = await pagePolicy({ dev: options.dev });
    for (const [name, value] of Object.entries(securityHeaderValues({ https: isHttps(c), csp }))) {
      // A route may set a content security policy of its own (e.g. the dev mail preview).
      if (name === 'content-security-policy' && headers.has(name)) continue;
      headers.set(name, value);
    }
  };
