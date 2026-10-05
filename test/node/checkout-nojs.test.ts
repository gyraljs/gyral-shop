// Checkout works end to end with JavaScript disabled (docs/product-specs/checkout.md,
// quality.md): every step is a plain form post, errors re-render the step, and placing the
// order lands on the confirmation page with the confirmation email in the outbox.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { insertCartFixture, T0 } from '../support/cart-fixture.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let test: TestApp;
let served: Served;

beforeAll(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('checkout without JavaScript', () => {
  // A real browser through eight page loads: well past Vitest's 5 s default under a busy run.
  it(
    'goes from the product page through every step to the order confirmation',
    { timeout: 20_000 },
    async () => {
      const page = await openPage({ javaScript: false });
      await page.goto(served.url('/p/lego'));
      await page.getByLabel('Quantity').fill('2');
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await page.waitForURL(/\/cart$/);
      await page.getByRole('link', { name: 'Checkout' }).click();
      await page.waitForURL(/\/checkout$/);

      await page.getByLabel('Email for order updates').fill('ada@example.com');
      await page.getByRole('button', { name: 'Continue to shipping address' }).click();
      await page.waitForURL(/\/checkout$/);

      await page.getByLabel('Full name').fill('Ada Lovelace');
      await page.getByLabel('Street address').fill('1 Analytical Way');
      await page.getByLabel('City').fill('Albany');
      await page.getByLabel('State').selectOption('NY');
      await page.getByLabel('ZIP code').fill('12');
      await page.getByRole('button', { name: 'Continue to shipping method' }).click();
      await expect(page.getByText('Enter a 5-digit ZIP code.').textContent()).resolves.toBeTruthy();
      // The rejected step keeps what was typed.
      expect(await page.getByLabel('City').inputValue()).toBe('Albany');
      await page.getByLabel('ZIP code').fill('12207');
      await page.getByRole('button', { name: 'Continue to shipping method' }).click();
      await page.waitForURL(/\/checkout$/);

      await page.locator('input[name="method"][value="express"]').check();
      await page.getByRole('button', { name: 'Continue to payment' }).click();
      await page.waitForURL(/\/checkout$/);

      await page.getByLabel('Card number').fill('4242 4242 4242 4242');
      await page.getByLabel('Expiry (MM/YY)').fill('12/30');
      await page.getByLabel('Security code').fill('123');
      await page.getByRole('button', { name: 'Continue to review' }).click();
      await page.waitForURL(/\/checkout$/);

      const review = page.locator('shop-checkout');
      await expect(review.getByText('Visa ending 4242, expires 12/30').count()).resolves.toBe(1);
      // $100 + $12.99 express; New York taxes 4% of goods and shipping: $4.52.
      await expect(review.locator('.total dd').textContent()).resolves.toBe('$117.51');
      await page.getByLabel('I accept the terms of sale.').check();
      await page.getByRole('button', { name: 'Place order' }).click();
      await page.waitForURL(/\/order\/GG-\d{8}-[2-9A-Z]{6}\/confirmation$/);
      await expect(page.getByRole('heading', { level: 1 }).textContent()).resolves.toBe(
        'Thank you, your order is placed',
      );
      const number = await page.locator('[data-component="order-number"]').textContent();
      await expect(page.locator('.row.total dd').textContent()).resolves.toBe('$117.51');
      // The confirmation email is in the mock outbox (/dev/mail).
      await page.goto(served.url('/dev/mail'));
      await expect(page.getByText(`Order ${number ?? '?'} confirmed`).count()).resolves.toBe(1);
    },
  );
});
