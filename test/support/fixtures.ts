// Golden SSR fixtures must be byte-stable across runs (scripts/check-fixtures.mjs enforces it).

/**
 * Replaces the session's CSRF token everywhere it appears (form fields, the <meta>, and
 * hydration seeds such as the header's account) with a fixed value.
 */
export function pinTokens(html: string): string {
  const token =
    /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ??
    /<meta name="csrf-token" content="([^"]+)"/.exec(html)?.[1] ??
    /csrfToken&quot;:&quot;([A-Za-z0-9_-]+)&quot;/.exec(html)?.[1];
  return token === undefined ? html : html.replaceAll(token, 'test-csrf-token');
}
