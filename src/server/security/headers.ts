// Security headers (docs/design-docs/0002-security.md).
//
// The CSP allows only same-origin scripts: Gyral pages load one module entry and hydrate
// from JSON data blocks (`<script type="application/json">`), which CSP does not execute,
// so no inline script is ever needed. Styles need 'unsafe-inline' because server-rendered
// components carry their styles as <style> elements inside Declarative Shadow DOM templates
// (and the shell's global <style>); hashing every component stylesheet isn't practical.
// Development adds `ws:` for the Vite HMR websocket, which runs on its own port.
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './context.js';
import { isHttps } from './request.js';

export function contentSecurityPolicy(options: { readonly dev: boolean }): string {
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': "'self'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data:",
    'font-src': "'self'",
    'connect-src': options.dev ? "'self' ws:" : "'self'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'none'",
  };
  return Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`)
    .join('; ');
}

/**
 * Every security header for a response. Pure, so the production server can apply the same set
 * to prerendered files it serves without going through the app (src/server/prod-app.ts).
 */
export function securityHeaderValues(options: {
  readonly dev: boolean;
  readonly https: boolean;
}): Readonly<Record<string, string>> {
  return {
    'content-security-policy': contentSecurityPolicy(options),
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
    for (const [name, value] of Object.entries(
      securityHeaderValues({ dev: options.dev, https: isHttps(c) }),
    )) {
      // A route may set a stricter content security policy of its own.
      if (name === 'content-security-policy' && headers.has(name)) continue;
      headers.set(name, value);
    }
  };
