// Wishlist (docs/product-specs/wishlist-reviews.md): members save products from cards and
// product pages, guests are sent to sign in and the product is saved afterwards, and the
// wishlist page moves items to the cart. Form posts and the JSON API the store uses.
import { describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { products, variants } from '../../src/db/schema/catalog.js';
import { cartLines, wishlistItems } from '../../src/db/schema/commerce.js';
import { users } from '../../src/db/schema/accounts.js';
import { SESSION_COOKIE, WISHLIST_SAVE_COOKIE } from '../../src/server/security/index.js';
import { CSRF_FIELD, CSRF_HEADER } from '../../src/ui/forms/csrf.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, loginAs, sessionCookie, type TestSession } from '../support/auth.js';

const ADA = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical-engine' };

/** A product with exactly one SKU (moves straight to the cart) and one with several. */
async function products2(test: TestApp) {
  const rows = await test.db
    .select({ id: products.id, slug: products.slug, n: count(variants.id) })
    .from(products)
    .innerJoin(variants, eq(variants.productId, products.id))
    .where(eq(products.archived, false))
    .groupBy(products.id)
    .orderBy(products.id);
  const single = rows.find((r) => r.n === 1);
  const multi = rows.find((r) => r.n > 1);
  if (single === undefined || multi === undefined) throw new Error('seed lacks product shapes');
  await test.db.update(variants).set({ stock: 10 }).where(eq(variants.productId, single.id));
  return { single, multi };
}

async function ada(): Promise<{ test: TestApp; s: TestSession; userId: number }> {
  const test = await testApp();
  await createMember(test, ADA);
  const s = await loginAs(test, ADA.email);
  const [row] = await test.db.select().from(users).where(eq(users.email, ADA.email));
  if (row === undefined) throw new Error('no Ada');
  return { test, s, userId: row.id };
}

const saved = async (test: TestApp, userId: number) =>
  (await test.db.select().from(wishlistItems).where(eq(wishlistItems.userId, userId))).length;

describe('wishlist', () => {
  it('sends guests from /account/wishlist to sign in', async () => {
    const test = await testApp();
    const res = await test.get('/account/wishlist');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account/login?next=%2Faccount%2Fwishlist');
  });

  it('saves from a form post, shows a pressed toggle and lists the product', async () => {
    const { test, s, userId } = await ada();
    const { single } = await products2(test);
    const res = await s.postForm('/wishlist/add', {
      product: single.slug,
      next: `/p/${single.slug}`,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/p/${single.slug}`);
    expect(await saved(test, userId)).toBe(1);
    expect(decodeURIComponent(res.headers.get('set-cookie') ?? '')).toContain('Saved ');

    const product = await (await s.get(`/p/${single.slug}`)).text();
    expect(product).toMatch(/<shop-wish-toggle[^>]*data-gyral-light/);
    expect(product).toMatch(/action="\/wishlist\/remove"/);
    expect(product).toContain('aria-pressed="true"');

    const page = await s.get('/account/wishlist');
    const html = await page.text();
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toContain('data-region="wishlist"');
    expect(html).toContain(`href="/p/${single.slug}"`);
  });

  it('is idempotent and removes again', async () => {
    const { test, s, userId } = await ada();
    const { single } = await products2(test);
    await s.postForm('/wishlist/add', { product: single.slug });
    await s.postForm('/wishlist/add', { product: single.slug });
    expect(await saved(test, userId)).toBe(1);
    await s.postForm('/wishlist/remove', { product: single.slug });
    expect(await saved(test, userId)).toBe(0);
  });

  it('answers the store over JSON with the saved slugs', async () => {
    const { test, s } = await ada();
    const { single, multi } = await products2(test);
    const add = await s.postJson('/api/wishlist/items', { product: single.slug });
    expect(add.status).toBe(200);
    await s.postJson('/api/wishlist/items', { product: multi.slug });
    const body = (await add.json()) as { slugs: string[]; message: string };
    expect(body.slugs).toEqual([single.slug]);
    expect(body.message).toMatch(/^Saved /);
    const del = await s.get(`/api/wishlist/items/${multi.slug}`, {
      method: 'DELETE',
      headers: { [CSRF_HEADER]: s.session.csrfToken },
    });
    expect(((await del.json()) as { slugs: string[] }).slugs).toEqual([single.slug]);
    const missing = await s.postJson('/api/wishlist/items', { product: 'no-such-product' });
    expect(missing.status).toBe(404);
  });

  it('rejects writes without a CSRF token and JSON from guests', async () => {
    const { test, s } = await ada();
    const { single } = await products2(test);
    const res = await test.get('/wishlist/add', {
      method: 'POST',
      headers: { cookie: s.cookie },
      body: new URLSearchParams({ product: single.slug }),
    });
    expect(res.status).toBe(403);
    const visitor = await guest(test);
    expect((await visitor.postJson('/api/wishlist/items', { product: single.slug })).status).toBe(
      401,
    );
  });

  it("remembers a guest's product through sign-in and saves it", async () => {
    const test = await testApp();
    await createMember(test, ADA);
    const { single } = await products2(test);
    const hop = await test.get(
      `/wishlist/sign-in?product=${single.slug}&next=${encodeURIComponent(`/p/${single.slug}`)}`,
    );
    expect(hop.status).toBe(303);
    expect(hop.headers.get('location')).toBe(
      `/account/login?next=${encodeURIComponent(`/p/${single.slug}`)}`,
    );
    expect(hop.headers.get('set-cookie')).toContain(`${WISHLIST_SAVE_COOKIE}=${single.slug}`);

    const visitor = await guest(test);
    const login = await test.get('/account/login', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE}=${visitor.session.id}; ${WISHLIST_SAVE_COOKIE}=${single.slug}`,
      },
      body: new URLSearchParams({
        email: ADA.email,
        password: ADA.password,
        next: `/p/${single.slug}`,
        [CSRF_FIELD]: visitor.session.csrfToken,
      }),
    });
    expect(login.status).toBe(303);
    expect(login.headers.get('set-cookie')).toContain(`${WISHLIST_SAVE_COOKIE}=;`);
    const [user] = await test.db.select().from(users).where(eq(users.email, ADA.email));
    expect(await saved(test, user?.id ?? -1)).toBe(1);
    expect(sessionCookie(login)).toBeDefined();
  });

  it('moves a single-SKU product to the cart and sends options products to their page', async () => {
    const { test, s, userId } = await ada();
    const { single, multi } = await products2(test);
    await s.postForm('/wishlist/add', { product: single.slug });
    await s.postForm('/wishlist/add', { product: multi.slug });

    const moved = await s.postForm('/wishlist/move', {
      product: single.slug,
      next: '/account/wishlist',
    });
    expect(moved.headers.get('location')).toBe('/account/wishlist');
    const lines = await test.db.select().from(cartLines);
    expect(lines).toHaveLength(1);
    expect(
      await test.db
        .select()
        .from(wishlistItems)
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, single.id))),
    ).toEqual([]);

    const options = await s.postForm('/wishlist/move', {
      product: multi.slug,
      next: '/account/wishlist',
    });
    expect(options.headers.get('location')).toBe(`/p/${multi.slug}`);
    expect(await saved(test, userId)).toBe(1);
  });

  it('gives guests a sign-in link instead of a form on cards and product pages', async () => {
    const test = await testApp();
    const { single } = await products2(test);
    const html = await test.html(`/p/${single.slug}`);
    expect(html).toMatch(/<a class="wish-toggle"[^>]*href="\/wishlist\/sign-in\?product=/);
    expect(html).not.toContain('action="/wishlist/add"');
  });

  describe('golden markup for the browser tests', () => {
    const pinToken = (html: string): string => {
      const token =
        /csrf-token" content="([^"]+)"/.exec(html)?.[1] ?? /csrf-token="([^"]+)"/.exec(html)?.[1];
      if (token === undefined) throw new Error('no csrf token in page');
      return html.replaceAll(token, 'test-csrf-token');
    };

    it('wishlist page with two items', async () => {
      const { test, s } = await ada();
      const { single, multi } = await products2(test);
      await s.postForm('/wishlist/add', { product: multi.slug });
      await s.postForm('/wishlist/add', { product: single.slug });
      await s.get('/account/wishlist'); // consumes the flash, so the fixture has none
      const html = pinToken(await (await s.get('/account/wishlist')).text());
      await expect(html).toMatchFileSnapshot('../fixtures/wishlist.ssr.html');
    });

    it('product page for a member with nothing saved', async () => {
      const { test, s } = await ada();
      const { single } = await products2(test);
      const html = pinToken(await (await s.get(`/p/${single.slug}`)).text());
      await expect(html).toMatchFileSnapshot('../fixtures/wishlist-product.ssr.html');
    });
  });
});
