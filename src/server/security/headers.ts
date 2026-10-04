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

export const securityHeaders =
  (options: { readonly dev: boolean }): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    await next();
    const headers = c.res.headers;
    // A route may set a stricter policy of its own.
    if (!headers.has('content-security-policy')) {
      headers.set('content-security-policy', contentSecurityPolicy(options));
    }
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    headers.set('cross-origin-opener-policy', 'same-origin');
    headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (isHttps(c)) headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  };
