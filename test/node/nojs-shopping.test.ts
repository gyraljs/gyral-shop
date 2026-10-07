// No-JS journeys on the seeded catalog (docs/product-specs/quality.md, "No-JS"): browsing,
// search, filters, product variants, the cart, accounts, the wishlist, password reset,
// contact and consent, all with JavaScript disabled. Checkout and orders are in
// test/node/nojs-orders.test.ts.
import { count, desc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyticsEvents, cartLines, outbox, products, variants } from '../../src/db/schema.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember } from '../support/auth.js';
import { fixtureCategory } from '../support/listing.js';
import { noJsPage, signInWithForm } from '../support/nojs.js';
import { closeBrowser, listen, type Served } from '../support/server.js';

const ADA = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical-engine' };

let test: TestApp;
let served: Served;
let listingPath: string;

/** The seeded product with the most SKUs, and one with a single SKU, both well stocked. */
async function products_(): Promise<{
  multi: { id: number; slug: string; name: string };
  single: { id: number; slug: string; name: string };
}> {
  const rows = await test.db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      n: sql<number>`count(${variants.id})`,
    })
    .from(products)
    .innerJoin(variants, eq(variants.productId, products.id))
    .where(eq(products.archived, false))
    .groupBy(products.id)
    .orderBy(desc(sql`count(${variants.id})`), products.id);
  const multi = rows[0];
  const single = rows.find((r) => r.n === 1);
  if (multi === undefined || single === undefined) throw new Error('seed lacks products');
  for (const p of [multi, single]) {
    await test.db.update(variants).set({ stock: 20 }).where(eq(variants.productId, p.id));
  }
  return { multi, single };
}

beforeAll(async () => {
  test = await testApp();
  await createMember(test, ADA);
  listingPath = (await fixtureCategory(test.db)).path;
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('a shopper without JavaScript', () => {
  it('browses, searches, filters, picks a variant and edits the cart', async () => {
    const { multi } = await products_();
    const page = await noJsPage(served);
    await page.goto(served.url('/'));
    await expect(page.title()).resolves.toBe('Gyral Goods');
    // The header is server-rendered light DOM: its department links work without JavaScript.
    expect(
      await page.getByRole('navigation', { name: 'Departments' }).getByRole('link').count(),
    ).toBe(8);

    // Header search; extra spaces are redirected to one canonical URL; refine with the form.
    await page.getByRole('searchbox', { name: 'Search products' }).first().fill('  smart  ');
    await page.getByRole('button', { name: 'Search' }).first().click();
    await page.waitForURL(/\/search\?q=smart$/);
    await expect(page.title()).resolves.toBe('Results for “smart” — Gyral Goods');
    const search = page.getByRole('form', { name: 'Filter and sort' });
    await search.getByLabel('Sort by').selectOption('price-asc');
    await search.getByRole('button', { name: 'Apply' }).click();
    await page.waitForURL(/\/search\?q=smart&sort=price-asc$/);
    await page.goto(served.url('/search?q=xylophonequartz'));
    expect(await page.getByRole('heading', { name: 'Browse departments' }).count()).toBe(1);

    // A listing filtered and sorted by the plain GET form.
    await page.goto(served.url(listingPath));
    const filters = page.getByRole('form', { name: 'Filter and sort' });
    await filters.getByLabel('On sale').check();
    await filters.getByLabel('Sort by').selectOption('price-asc');
    await filters.getByRole('button', { name: 'Apply' }).click();
    await page.waitForURL((url) => url.search === '?sort=price-asc&sale=1');
    const names = await page.locator('.product-card h3').allTextContents();
    expect(names.map((n) => n.trim())).toEqual(['Bravo', 'Delta', 'Golf']);

    // A variant chosen from the server-rendered SKU radio list.
    const skus = await test.db
      .select({ id: variants.id, sku: variants.sku })
      .from(variants)
      .where(eq(variants.productId, multi.id))
      .orderBy(variants.position, variants.id);
    const target = skus[1];
    if (target === undefined) throw new Error('product has one SKU');
    await page.goto(served.url(`/p/${multi.slug}`));
    await page.locator(`input[name="sku"][value="${target.sku}"]`).check();
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForURL(/\/cart$/);
    expect(
      await test.db.select({ v: cartLines.variantId, q: cartLines.quantity }).from(cartLines),
    ).toEqual([{ v: target.id, q: 2 }]);
    await expect(page.locator('shop-mini-cart .badge').textContent()).resolves.toBe('2');

    // Increase, set, remove: every cart action is a plain form post.
    const qty = () => page.getByLabel(`Quantity of ${multi.name}`, { exact: true });
    await page.getByRole('button', { name: `Increase quantity of ${multi.name}` }).click();
    await page.waitForURL(/\/cart$/);
    expect(await qty().inputValue()).toBe('3');
    await qty().fill('1');
    await page.getByRole('button', { name: 'Update' }).click();
    await page.waitForURL(/\/cart$/);
    expect(await qty().inputValue()).toBe('1');
    await page.getByRole('button', { name: `Remove ${multi.name}` }).click();
    await page.waitForURL(/\/cart$/);
    await expect(
      page.locator('shop-cart-page').getByText('Your cart is empty.').count(),
    ).resolves.toBe(1);
  }, 60_000);
});

describe('a member without JavaScript', () => {
  it('registers, signs out, signs back in, saves and moves a wishlist item, edits settings', async () => {
    const { single } = await products_();
    const page = await noJsPage(served);
    await page.goto(served.url('/account/register'));
    await page.getByLabel('Full name').fill('Grace Hopper');
    await page.getByLabel('Email').fill('grace@example.com');
    await page.getByLabel('Password', { exact: true }).fill('cobol-compiler');
    await page.getByLabel('Repeat password').fill('cobol-compiler');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/account$/);
    await page.getByText('Hi, Grace').click(); // <details> opens without JavaScript
    await page
      .getByRole('navigation', { name: 'Account and cart' })
      .getByRole('button', { name: 'Sign out' })
      .click();
    await page.waitForURL(served.url('/'));

    // Saving while signed out asks for sign-in (wrong password first), then saves.
    await page.goto(served.url(`/p/${single.slug}`));
    await page.locator('.product-wish').getByRole('link', { name: /Save/ }).click();
    await page.waitForURL(/\/account\/login/);
    await signInWithForm(page, 'grace@example.com', 'not-the-password');
    await expect(page.getByRole('alert').textContent()).resolves.toContain(
      'That email and password do not match an account.',
    );
    await signInWithForm(page, 'grace@example.com', 'cobol-compiler');
    await page.waitForURL(new RegExp(`/p/${single.slug}$`));
    await expect(page.locator('.product-wish button').getAttribute('aria-pressed')).resolves.toBe(
      'true',
    );
    await page.goto(served.url('/account/wishlist'));
    await page.getByRole('button', { name: `Move to cart ${single.name}` }).click();
    await page.waitForURL(/\/account\/wishlist$/);
    await expect(page.getByRole('status').first().textContent()).resolves.toContain('Moved');

    // Settings: rename, then add, edit and delete an address.
    await page.goto(served.url('/account/profile'));
    await page.getByLabel('Full name').fill('Grace Murray Hopper');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('status').textContent()).resolves.toContain('Your name is saved.');
    await page.getByRole('link', { name: 'Addresses' }).click();
    const add = page.locator('shop-address-form');
    await add.getByLabel('Full name').fill('Grace Hopper');
    await add.getByLabel('Street address').fill('12 Navy Yard');
    await add.getByLabel('City').fill('Albany');
    await add.getByLabel('State').selectOption('NY');
    await add.getByLabel('ZIP code').fill('12207');
    await add.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByText('Albany, New York 12207').isVisible()).resolves.toBe(true);
    await page.getByRole('link', { name: /^Edit/ }).click();
    await page.getByLabel('Street address').fill('1 Fleet Way');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('1 Fleet Way').isVisible()).resolves.toBe(true);
    await page.getByRole('button', { name: /^Delete/ }).click();
    await expect(page.getByText("You haven't saved an address yet.").isVisible()).resolves.toBe(
      true,
    );
  }, 60_000);

  it('resets a forgotten password through the mail outbox', async () => {
    const page = await noJsPage(served);
    await page.goto(served.url('/account/login'));
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.getByLabel('Email').fill(ADA.email);
    await page.getByRole('button', { name: 'Email me a reset link' }).click();
    await page.getByRole('heading', { name: 'Check your email' }).waitFor();
    const [mail] = await test.db.select().from(outbox).orderBy(desc(outbox.id)).limit(1);
    const link = /https?:\/\/\S+\/account\/reset\?token=\S+/.exec(mail?.text ?? '')?.[0];
    if (link === undefined) throw new Error('no reset link in the outbox');
    await page.goto(served.url('/dev/mail')); // the mail is listed for humans too
    await expect(
      page
        .getByText(mail?.subject ?? '?')
        .first()
        .isVisible(),
    ).resolves.toBe(true);
    const url = new URL(link);
    await page.goto(served.url(`${url.pathname}${url.search}`));
    await page.getByLabel('New password', { exact: true }).fill('brand-new-password');
    await page.getByLabel('Repeat new password').fill('brand-new-password');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await page.waitForURL(/\/account$/);
    await expect(page.getByRole('status').textContent()).resolves.toContain('You are signed in.');
  }, 30_000);
});

describe('site forms without JavaScript', () => {
  it('sends the contact form to the outbox', async () => {
    const page = await noJsPage(served);
    await page.goto(served.url('/contact'));
    await page.getByLabel('Your name').fill('Ada Lovelace');
    await page.getByLabel('Email').fill(ADA.email);
    await page.getByLabel('Topic').selectOption('product');
    await page.getByLabel('Message').fill('Do the engines ship with punch cards?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.waitForURL(/\/contact\/sent$/);
    const [mail] = await test.db.select().from(outbox).orderBy(desc(outbox.id)).limit(1);
    expect(mail?.text).toContain('punch cards');
  }, 30_000);

  it('rejects analytics from the banner, then opts in from the footer', async () => {
    const before = async () =>
      (await test.db.select({ n: count() }).from(analyticsEvents))[0]?.n ?? 0;
    const start = await before();
    const page = await noJsPage(served);
    await page.goto(served.url('/d/books'));
    const banner = () => page.getByRole('region', { name: 'Cookies on Gyral Goods' });
    await banner().getByRole('button', { name: 'Reject non-essential' }).click();
    await page.waitForURL(/\/d\/books$/);
    await page.goto(served.url('/'));
    expect(await banner().count()).toBe(0);
    expect(await before()).toBe(start);
    await page.getByRole('link', { name: 'Cookie settings' }).click();
    await page.getByLabel(/Analytics/).check();
    await page.getByRole('button', { name: 'Save choices' }).click();
    await page.waitForURL(/\/consent$/);
    await page.goto(served.url('/about'));
    expect(await before()).toBeGreaterThan(start);
  }, 30_000);
});
