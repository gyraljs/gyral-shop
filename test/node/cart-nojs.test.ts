// The cart works end to end with JavaScript disabled (docs/product-specs/cart.md, quality.md):
// add from a product page, see it on /cart, change the quantity, remove it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { products, variants } from '../../src/db/schema.js';
import { testApp, type TestApp } from '../support/app.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let test: TestApp;
let served: Served;

beforeAll(async () => {
  test = await testApp();
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('cart without JavaScript', () => {
  it('adds, updates and removes with plain form posts', async () => {
    const [product] = await test.db
      .select({ id: products.id, slug: products.slug, name: products.name })
      .from(products)
      .where(eq(products.archived, false))
      .orderBy(products.id)
      .limit(1);
    if (product === undefined) throw new Error('no product');
    await test.db.update(variants).set({ stock: 20 }).where(eq(variants.productId, product.id));

    const page = await openPage({ javaScript: false });
    await page.goto(served.url(`/p/${product.slug}`));
    const sku = page.locator('input[name="sku"]').first();
    if ((await sku.getAttribute('type')) === 'radio') await sku.check();
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForURL(/\/cart$/);

    await expect(page.getByRole('status').first().textContent()).resolves.toContain('Added 2');
    const quantity = page.getByLabel(`Quantity of ${product.name}`, { exact: true });
    expect(await quantity.inputValue()).toBe('2');
    // The header badge comes from the same seeded store, rendered on the server.
    await expect(page.locator('shop-mini-cart .badge').textContent()).resolves.toBe('2');

    await page.getByRole('button', { name: `Increase quantity of ${product.name}` }).click();
    await page.waitForURL(/\/cart$/);
    expect(await page.getByLabel(`Quantity of ${product.name}`, { exact: true }).inputValue()).toBe(
      '3',
    );

    await page.getByLabel(`Quantity of ${product.name}`, { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Update' }).click();
    await page.waitForURL(/\/cart$/);
    expect(await page.getByLabel(`Quantity of ${product.name}`, { exact: true }).inputValue()).toBe(
      '1',
    );

    await page.getByRole('button', { name: `Remove ${product.name}` }).click();
    await page.waitForURL(/\/cart$/);
    await expect(
      page.locator('shop-cart-page').getByText('Your cart is empty.').count(),
    ).resolves.toBe(1);
  });
});
