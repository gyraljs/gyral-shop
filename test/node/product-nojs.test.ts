// The product page's add-to-cart form works with JavaScript disabled
// (docs/product-specs/product-page.md, quality.md "No-JS").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc, eq, sql } from 'drizzle-orm';
import { cartLines, products, variants } from '../../src/db/schema.js';
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

describe('product page without JavaScript', () => {
  it('chooses a SKU from the radio list and adds it to the cart', async () => {
    const [product] = await test.db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .innerJoin(variants, eq(variants.productId, products.id))
      .groupBy(products.id)
      .orderBy(desc(sql`count(${variants.id})`), products.id)
      .limit(1);
    if (product === undefined) throw new Error('no product');
    await test.db.update(variants).set({ stock: 20 }).where(eq(variants.productId, product.id));
    const skus = await test.db
      .select({ id: variants.id, sku: variants.sku })
      .from(variants)
      .where(eq(variants.productId, product.id))
      .orderBy(variants.position, variants.id);
    const target = skus[1];
    if (target === undefined) throw new Error('product has one SKU');

    const page = await openPage({ javaScript: false });
    await page.goto(served.url(`/p/${product.slug}`));
    await page.locator(`input[name="sku"][value="${target.sku}"]`).check();
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForURL(/\/cart$/);

    const lines = await test.db
      .select({ variantId: cartLines.variantId, quantity: cartLines.quantity })
      .from(cartLines);
    expect(lines).toEqual([{ variantId: target.id, quantity: 2 }]);
  });
});
