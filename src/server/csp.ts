// The Content-Security-Policy for every response (docs/design-docs/0002-security.md).
//
// Scripts: same-origin only. Gyral pages load one module entry (plus modulepreload hints) and
// hydrate from JSON data blocks and attributes, which CSP does not execute, so no inline script
// is ever needed. Styles: same-origin stylesheets, the shells' global <style> elements and
// each shadow component's declarative-shadow-root <style>, all by SHA-256 hash (Gyral's
// contentSecurityPolicy()), so `style-src` carries no 'unsafe-inline'. Views use no `style`
// attributes (ratings are `data-rating` steps). Constructed sheets, which Gyral adopts once a
// component hydrates, are not subject to `style-src`. Development adds `ws:` for the Vite HMR
// websocket, which runs on its own port.
import { contentSecurityPolicy, type CspDirectives } from '@gyral/ssr';
import { PAGE_STYLES } from './page-styles.js';

/** Every directive but the style hashes, which contentSecurityPolicy() appends. */
export function policyDirectives(options: { readonly dev: boolean }): CspDirectives {
  return {
    'default-src': "'self'",
    'script-src': "'self'",
    'style-src': "'self'",
    'img-src': "'self' data:",
    'font-src': "'self'",
    'connect-src': options.dev ? "'self' ws:" : "'self'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'none'",
  };
}

const policies = new Map<string, Promise<string>>();

/**
 * The header value: `policyDirectives` plus `extra` (a route's own additions), with the hash
 * of every page stylesheet and registered shadow component style. Computed once per variant
 * (hashing is async, WebCrypto) on first use, after the app has imported every component.
 */
export function pagePolicy(options: {
  readonly dev: boolean;
  readonly extra?: CspDirectives;
}): Promise<string> {
  const key = JSON.stringify([options.dev, options.extra ?? {}]);
  let policy = policies.get(key);
  if (policy === undefined) {
    policy = contentSecurityPolicy({
      styles: PAGE_STYLES,
      directives: { ...policyDirectives(options), ...options.extra },
    });
    policies.set(key, policy);
  }
  return policy;
}
