// Golden SSR fixtures must be byte-stable across runs (scripts/check-fixtures.mjs enforces it).

/**
 * Replaces the session's CSRF token everywhere it appears (form fields, the <meta>, and
 * hydration seeds such as the header's account) with a fixed value.
 */
export function pinTokens(html: string): string {
  const token =
    /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ??
    /<meta name="csrf-token" content="([^"]+)"/.exec(html)?.[1] ??
    /"csrfToken":"([A-Za-z0-9_-]+)"/.exec(html)?.[1];
  return token === undefined ? html : html.replaceAll(token, 'test-csrf-token');
}

/**
 * Replaces content-hashed asset URLs (theme stylesheets `/themes/<name>.<hash>.css`) with their
 * unhashed form, so editing a theme's CSS doesn't rewrite every golden fixture.
 */
export function pinAssets(html: string): string {
  return html.replace(/\/themes\/([a-z0-9-]+)\.[A-Za-z0-9_-]{6,}\.css/g, '/themes/$1.css');
}

/**
 * The markup with every quoted attribute value removed. Attribute values may hold `<` as is
 * (the HTML spec only needs `&` and the quote escaped there, and Gyral writes them that way),
 * so "no raw `<script>` in the page" is asserted on what is left: element and text content.
 */
export const outsideAttributes = (html: string): string =>
  html.replace(/="[^"]*"/g, '=""').replace(/='[^']*'/g, "=''");

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matches one start tag with these attributes in any order: a string is the exact value, `true`
 * means present, `false` absent. Gyral writes a tag's static attributes before its bound ones,
 * so assertions must not depend on attribute order.
 */
export function startTag(
  name: string,
  attributes: Readonly<Record<string, string | boolean>>,
): RegExp {
  const checks = Object.entries(attributes).map(([attr, value]) => {
    const pattern = `[^>]*\\s${escapeRegExp(attr)}${typeof value === 'string' ? `="${escapeRegExp(value)}"` : '[\\s=>]'}`;
    return value === false ? `(?!${pattern})` : `(?=${pattern})`;
  });
  return new RegExp(`<${name}${checks.join('')}[^>]*>`);
}

/** Everything a golden SSR fixture needs pinned: session tokens and hashed asset URLs. */
export const stableHtml = (html: string): string => pinAssets(pinTokens(html));
