// The Content-Security-Policy for every response (docs/design-docs/0002-security.md).
//
// Scripts: same-origin only. Gyral pages load one module entry (plus modulepreload hints) and
// hydrate from JSON data blocks and attributes, which CSP does not execute, so no inline script
// is ever needed. Styles: same-origin stylesheets, the shells' global <style> elements and
// each shadow component's declarative-shadow-root <style>, all by SHA-256 hash, so `style-src`
// carries no 'unsafe-inline'. Views use no `style` attributes (ratings are `data-rating`
// steps). Constructed sheets, which Gyral adopts once a component hydrates, are not subject to
// `style-src`. Development adds `ws:` for the Vite HMR websocket, which runs on its own port.
//
// Pages pass `pageCsp()` to renderPage, which builds the header when the page renders, with
// the hash of every component registered by then and of the shell's own styles. Responses
// without a page carry the same directives without hashes; prerendered files get
// `staticPolicy()`.
import { contentSecurityPolicy, type CspDirectives, type CspOptions } from '@gyral/ssr';
import { DOCUMENT_STYLES } from './page-styles.js';

interface Variant {
  readonly dev: boolean;
  /** A route's own additions (the dev mail preview's `style-src-attr`). */
  readonly extra?: CspDirectives;
}

/** Every directive but the style hashes, which Gyral appends. */
export function policyDirectives(options: Variant): CspDirectives {
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
    ...options.extra,
  };
}

const variants = new Map<string, CspOptions>();

/**
 * `renderPage({ csp })` for a page: the options object per variant, always the same one, since
 * renderPage caches the built header per options object (until another component registers).
 * The page's `styles` are hashed by renderPage itself.
 */
export function pageCsp(options: Variant): CspOptions {
  const key = JSON.stringify([options.dev, options.extra ?? {}]);
  let csp = variants.get(key);
  if (csp === undefined) {
    csp = { directives: policyDirectives(options) };
    variants.set(key, csp);
  }
  return csp;
}

/** The header for responses that are not pages (JSON, redirects, images): no `<style>`. */
export function basePolicy(options: Variant): string {
  return Object.entries(policyDirectives(options))
    .map(([name, sources]) =>
      [name, ...(typeof sources === 'string' ? [sources] : sources)].join(' '),
    )
    .join('; ');
}

/**
 * The header for prerendered storefront pages served from disk (src/server/prod-app.ts), which
 * never pass through renderPage at request time: the storefront shell's styles and every
 * component registered when it is called (the app's modules are all imported by then).
 */
export function staticPolicy(): Promise<string> {
  return contentSecurityPolicy({
    styles: DOCUMENT_STYLES,
    directives: policyDirectives({ dev: false }),
  });
}
