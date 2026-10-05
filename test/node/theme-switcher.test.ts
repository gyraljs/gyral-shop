// Theme switching (ADR 0006 rule 8): the theme registry, the stylesheet routes, the footer
// form and the theme cookie. The JS swap is in test/browser/theme-switcher.test.ts.
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../../src/server/security/index.js';
import { CURRENT_THEME_PATH, THEME_COOKIE, themeHash, themeHref } from '../../src/server/theme.js';
import { DEFAULT_THEME, findTheme, THEMES } from '../../src/ui/themes/registry.js';
import { testApp, type TestApp } from '../support/app.js';

const ORIGIN = 'http://localhost';
const defaultTheme = findTheme(DEFAULT_THEME);
if (defaultTheme === undefined) throw new Error('no default theme');

const choose = (
  test: TestApp,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) =>
  test.get(`${ORIGIN}/theme`, {
    method: 'POST',
    headers: { origin: ORIGIN, ...headers },
    body: new URLSearchParams(fields),
  });

const setCookies = (response: Response) => response.headers.getSetCookie();
/** The theme <link> in the head (attributes may be split across lines). */
const themeLinkOf = (html: string) =>
  /<link\s+rel="stylesheet"\s+id="theme-css"\s+href="([^"]+)"(?:\s+data-theme="([^"]+)")?/.exec(
    html,
  );
const themeCookie = (response: Response) =>
  setCookies(response).find((c) => c.startsWith(`${THEME_COOKIE}=`));

describe('theme registry', () => {
  it('registers every theme file, with a valid unique name, and the default', () => {
    const files = readdirSync(new URL('../../src/ui/themes/', import.meta.url)).filter((f) =>
      f.endsWith('.css.ts'),
    );
    const names = THEMES.map((t) => t.name);
    expect(names.map((n) => `${n}.css.ts`).sort()).toEqual(files.sort());
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(names).toContain(DEFAULT_THEME);
    for (const theme of THEMES) expect(theme.css).toMatch(/^\s*@layer theme\s*\{/);
  });
});

describe('theme stylesheets', () => {
  it('serves each theme at a content-hashed URL, cached for a year', async () => {
    const test = await testApp({ seed: false });
    const response = await test.get(themeHref(defaultTheme));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toBe(defaultTheme.css);
  });

  it('refuses stale hashes and unknown themes', async () => {
    const test = await testApp({ seed: false });
    expect((await test.get(`/themes/${defaultTheme.name}.AAAAAAAAAA.css`)).status).toBe(404);
    expect((await test.get(`/themes/nope.${themeHash(defaultTheme)}.css`)).status).toBe(404);
  });

  it('answers /themes/current.css from the cookie, revalidated per visitor', async () => {
    const test = await testApp({ seed: false });
    const fresh = await test.get(CURRENT_THEME_PATH, {
      headers: { cookie: `${THEME_COOKIE}=nonsense` },
    });
    expect(await fresh.text()).toBe(defaultTheme.css);
    expect(fresh.headers.get('vary')).toBe('Cookie');
    expect(fresh.headers.get('cache-control')).toBe('private, no-cache');
    const etag = fresh.headers.get('etag') ?? '';
    expect(etag).not.toBe('');
    const again = await test.get(CURRENT_THEME_PATH, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });
});

describe('theme in pages', () => {
  it('links the visitor theme by hashed URL and renders the no-JS switcher in the footer', async () => {
    const test = await testApp();
    const html = await (await test.get(`${ORIGIN}/d/electronics`)).text();
    expect(themeLinkOf(html)?.slice(1)).toEqual([themeHref(defaultTheme), 'default']);
    expect(html).not.toContain(defaultTheme.css.trim().slice(0, 40)); // never inlined
    expect(html).toMatch(
      /<form[^>]*method="post"[^>]*action="\/theme"[^>]*data-region="theme-switcher"/,
    );
    expect(html).toMatch(/<legend>Theme<\/legend>/);
    expect(html).toMatch(
      /<input[^>]*type="radio"[^>]*name="theme"[^>]*value="default"[^>]*checked/,
    );
    expect(html).toMatch(/<input type="hidden" name="return" value="\/d\/electronics"/);
  });

  it('falls back to the default theme for an unknown cookie', async () => {
    const test = await testApp();
    const html = await (
      await test.get(`${ORIGIN}/`, { headers: { cookie: `${THEME_COOKIE}=../../etc` } })
    ).text();
    expect(themeLinkOf(html)?.slice(1)).toEqual([themeHref(defaultTheme), 'default']);
  });

  it('gives prerendered pages the cookie-driven stylesheet and a deferred switcher', async () => {
    const test = await testApp({ seed: false });
    const html = await (await test.get(`${ORIGIN}/about`)).text();
    expect(themeLinkOf(html)?.slice(1)).toEqual([CURRENT_THEME_PATH, undefined]);
    expect(html).toMatch(/<shop-theme-switcher[^>]*\sdeferred/);
    expect(html).not.toMatch(/name="theme"[^>]*checked/);
  });
});

describe('POST /theme', () => {
  it('saves the theme and returns to the page (no-JS), without starting a session', async () => {
    const test = await testApp({ seed: false });
    const response = await choose(test, { theme: 'default', return: '/c/electronics/tv' });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/c/electronics/tv');
    expect(themeCookie(response)).toMatch(/^theme=default;.*HttpOnly.*SameSite=Lax/i);
    expect(setCookies(response).some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it('answers JSON for submitForm', async () => {
    const test = await testApp({ seed: false });
    const response = await choose(
      test,
      { theme: 'default', return: '/' },
      { accept: 'application/json' },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ _tag: 'Redirected', location: '/' });
    expect(themeCookie(response)).toBeDefined();
  });

  it('refuses unknown themes with a 422 page, and off-site return paths', async () => {
    const test = await testApp({ seed: false });
    const unknown = await choose(test, { theme: 'neon', return: '/' });
    expect(unknown.status).toBe(422);
    expect(await unknown.text()).toContain('Choose one of the listed themes.');
    expect(themeCookie(unknown)).toBeUndefined();
    const offSite = await choose(test, { theme: 'default', return: 'https://evil.example/' });
    expect(offSite.headers.get('location')).toBe('/');
  });

  it('refuses cross-site posts', async () => {
    const test = await testApp({ seed: false });
    const response = await choose(test, { theme: 'default' }, { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(themeCookie(response)).toBeUndefined();
  });
});
