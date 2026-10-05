// Consent banner and mock analytics (docs/product-specs/consent.md; ADR 0002 addendum for the
// origin-verified POST).
import { count, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { analyticsEvents, products, variants } from '../../src/db/schema.js';
import { CONSENT_COOKIE } from '../../src/server/consent.js';
import { SESSION_COOKIE } from '../../src/server/security/index.js';
import { testApp, type TestApp } from '../support/app.js';
import { guest } from '../support/auth.js';

const ORIGIN = 'http://localhost';

const choose = (
  test: TestApp,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) =>
  test.get(`${ORIGIN}/consent`, {
    method: 'POST',
    headers: { origin: ORIGIN, ...headers },
    body: new URLSearchParams(fields),
  });

const consentCookie = (response: Response): string | undefined =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.split(';')[0];

const events = async (test: TestApp) =>
  (await test.db.select({ n: count() }).from(analyticsEvents))[0]?.n ?? 0;

describe('consent banner', () => {
  it('shows a non-modal labelled region to undecided visitors, without starting a session', async () => {
    const test = await testApp();
    const response = await test.get(`${ORIGIN}/d/electronics`);
    const html = await response.text();
    expect(html).toMatch(/<shop-consent\s+mode="banner"\s+return-to="\/d\/electronics"/);
    expect(html).toMatch(/<section[^>]*data-region="consent"[^>]*aria-labelledby="consent-title"/);
    expect(html).not.toMatch(/aria-modal|<dialog/);
    expect(html).toContain('Accept all');
    expect(html).toContain('Reject non-essential');
    expect(response.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(
      false,
    );
  });

  it('saves the choice in a cookie and returns to the page, without JavaScript', async () => {
    const test = await testApp();
    const response = await choose(test, { choice: 'reject', return: '/d/electronics?x=1' });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/d/electronics?x=1');
    const cookie = consentCookie(response);
    expect(cookie).toBe(`${CONSENT_COOKIE}=v1.a0`);
    const next = await (await test.get(`${ORIGIN}/`, { headers: { cookie: cookie ?? '' } })).text();
    expect(next).not.toContain('<shop-consent');
    expect(next).toContain('href="/consent">Cookie settings</a>');
  });

  it('maps accept, reject and customize to analytics on or off', async () => {
    const test = await testApp();
    const cases: [Record<string, string>, string][] = [
      [{ choice: 'accept' }, 'v1.a1'],
      [{ choice: 'reject', analytics: 'on' }, 'v1.a0'],
      [{ choice: 'save', analytics: 'on' }, 'v1.a1'],
      [{ choice: 'save' }, 'v1.a0'],
    ];
    for (const [fields, value] of cases) {
      expect(consentCookie(await choose(test, fields)), JSON.stringify(fields)).toBe(
        `${CONSENT_COOKIE}=${value}`,
      );
    }
  });

  it('only returns to paths on this site', async () => {
    const test = await testApp();
    const response = await choose(test, { choice: 'accept', return: '//evil.example/x' });
    expect(response.headers.get('location')).toBe('/');
  });

  it('refuses cross-site posts and posts that cannot prove their origin', async () => {
    const test = await testApp();
    const crossSite = await choose(test, { choice: 'accept' }, { origin: 'https://evil.example' });
    expect(crossSite.status).toBe(403);
    const unproven = await test.get(`${ORIGIN}/consent`, {
      method: 'POST',
      body: new URLSearchParams({ choice: 'accept' }),
    });
    expect(unproven.status).toBe(403);
    const fetchMetadata = await test.get(`${ORIGIN}/consent`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
      body: new URLSearchParams({ choice: 'accept' }),
    });
    expect(fetchMetadata.status).toBe(303);
  });

  it('answers the JavaScript path with JSON and still sets the cookie', async () => {
    const test = await testApp();
    const body = new FormData();
    body.append('choice', 'accept');
    const response = await test.get(`${ORIGIN}/consent`, {
      method: 'POST',
      headers: { origin: ORIGIN, accept: 'application/json' },
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ _tag: 'Redirected' });
    expect(consentCookie(response)).toBe(`${CONSENT_COOKIE}=v1.a1`);
  });

  it('rejects an unknown choice with 422 and re-renders the settings page', async () => {
    const test = await testApp();
    const response = await choose(test, { choice: 'maybe' });
    expect(response.status).toBe(422);
    expect(await response.text()).toContain('Cookie settings');
  });

  it('offers a settings page to change the choice later (noindex, current choice shown)', async () => {
    const test = await testApp();
    const html = await (
      await test.get(`${ORIGIN}/consent`, { headers: { cookie: `${CONSENT_COOKIE}=v1.a1` } })
    ).text();
    expect(html).toMatch(/<meta name="robots" content="noindex"/);
    expect(html).toMatch(/<shop-consent\s+mode="page"/);
    expect(html).toMatch(/<input[^>]*name="analytics"[^>]*checked/s);
  });
});

describe('mock analytics', () => {
  async function addToCart(test: TestApp, cookie: string) {
    // The best-stocked live SKU, so the add always succeeds.
    const [v] = await test.db
      .select({ sku: variants.sku })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.archived, false))
      .orderBy(desc(variants.stock))
      .limit(1);
    const sku = v?.sku ?? '';
    // A guest session (for the CSRF token) plus the consent cookie, on one request.
    const session = await guest(test);
    return test.get('/cart/add', {
      method: 'POST',
      headers: { cookie: `${session.cookie}; ${cookie}` },
      body: new URLSearchParams({ sku, quantity: '1', _csrf: session.session.csrfToken }),
    });
  }

  it('records nothing before consent or after rejecting', async () => {
    const test = await testApp();
    await test.get('/');
    await test.get('/d/electronics');
    await addToCart(test, '');
    await test.get('/', { headers: { cookie: `${CONSENT_COOKIE}=v1.a0` } });
    await addToCart(test, `${CONSENT_COOKIE}=v1.a0`);
    expect(await events(test)).toBe(0);
  });

  it('records page views and add-to-cart clicks after consent', async () => {
    const test = await testApp();
    const cookie = `${CONSENT_COOKIE}=v1.a1`;
    await test.get('/d/electronics', { headers: { cookie } });
    await test.get('/no-such-page', { headers: { cookie } }); // 404s are not page views
    await test.get('/sitemap.xml', { headers: { cookie } }); // not HTML
    const added = await addToCart(test, cookie);
    expect(added.status).toBe(303);
    const rows = await test.db.select().from(analyticsEvents);
    expect(rows.map((r) => [r.kind, r.path])).toEqual([
      ['page_view', '/d/electronics'],
      ['add_to_cart', '/cart/add'],
    ]);
    expect(rows[1]?.data).toMatchObject({ quantity: 1 });
    expect(typeof (rows[1]?.data as { sku?: unknown } | null)?.sku).toBe('string');
  });
});
