// The wishlist works with JavaScript disabled (docs/product-specs/quality.md, "No-JS"):
// a guest presses Save, signs in, and the product is saved; then it moves to the cart.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { products, variants } from '../../src/db/schema/catalog.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember } from '../support/auth.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let test: TestApp;
let served: Served;

beforeAll(async () => {
  test = await testApp();
  await createMember(test, {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('wishlist without JavaScript', () => {
  it('saves after sign-in and moves to the cart', async () => {
    const rows = await test.db
      .select({ id: products.id, slug: products.slug, name: products.name, n: count(variants.id) })
      .from(products)
      .innerJoin(variants, eq(variants.productId, products.id))
      .where(eq(products.archived, false))
      .groupBy(products.id)
      .orderBy(products.id);
    const single = rows.find((r) => r.n === 1);
    if (single === undefined) throw new Error('no single-SKU product');
    await test.db.update(variants).set({ stock: 10 }).where(eq(variants.productId, single.id));

    const page = await openPage({ javaScript: false });
    await page.goto(served.url(`/p/${single.slug}`));
    await page.locator('.product-wish').getByRole('link', { name: /Save/ }).click();
    await page.waitForURL(/\/account\/login/);
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password').fill('analytical-engine');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(new RegExp(`/p/${single.slug}$`));
    await expect(page.locator('.product-wish button').getAttribute('aria-pressed')).resolves.toBe(
      'true',
    );

    await page.goto(served.url('/account/wishlist'));
    await page.getByRole('heading', { name: 'Wishlist', exact: true }).waitFor();
    await page.getByRole('button', { name: `Move to cart ${single.name}` }).click();
    await page.waitForURL(/\/account\/wishlist$/);
    await expect(page.getByRole('status').first().textContent()).resolves.toContain('Moved');
    await page.goto(served.url('/cart'));
    await page.locator('main').getByText(single.name).first().waitFor();
  }, 20_000);
});
