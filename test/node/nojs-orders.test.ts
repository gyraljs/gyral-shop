// No-JS journeys through checkout and orders on the exact cart fixture (docs/product-specs/
// quality.md, "No-JS"; checkout.md; orders.md; wishlist-reviews.md): product → cart →
// every checkout step → place → confirmation → guest lookup; a member's history, cancel and
// reviews. Browsing, accounts and site forms are in test/node/nojs-shopping.test.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { noJsPage } from '../support/nojs.js';
import { placeOrder } from '../support/orders.js';
import { closeBrowser, listen, type Served } from '../support/server.js';

const PASSWORD = 'correct-horse-battery-9';

let test: TestApp;
let served: Served;

beforeAll(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  for (const [name, email] of [
    ['Grace Hopper', 'grace@example.com'],
    ['Alan Turing', 'alan@example.com'],
  ] as const) {
    await createMember(test, { name, email, password: PASSWORD });
  }
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('a guest without JavaScript', () => {
  it('checks out through every step and later finds the order by lookup', async () => {
    const page = await noJsPage(served);
    await page.goto(served.url('/p/lego'));
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.waitForURL(/\/cart$/);
    await page.getByRole('link', { name: 'Checkout' }).click();
    await page.waitForURL(/\/checkout$/);

    await page.getByLabel('Email for order updates').fill('ada@example.com');
    await page.getByRole('button', { name: 'Continue to shipping address' }).click();
    await page.getByLabel('Full name').fill('Ada Lovelace');
    await page.getByLabel('Street address').fill('1 Analytical Way');
    await page.getByLabel('City').fill('Albany');
    await page.getByLabel('State').selectOption('NY');
    await page.getByLabel('ZIP code').fill('12');
    await page.getByRole('button', { name: 'Continue to shipping method' }).click();
    // A rejected step re-renders with the error and keeps what was typed.
    await page.getByText('Enter a 5-digit ZIP code.').waitFor();
    expect(await page.getByLabel('City').inputValue()).toBe('Albany');
    await page.getByLabel('ZIP code').fill('12207');
    await page.getByRole('button', { name: 'Continue to shipping method' }).click();
    await page.locator('input[name="method"][value="express"]').check();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.getByLabel('Card number').fill('4242 4242 4242 4242');
    await page.getByLabel('Expiry (MM/YY)').fill('12/30');
    await page.getByLabel('Security code').fill('123');
    await page.getByRole('button', { name: 'Continue to review' }).click();

    const review = page.locator('shop-checkout');
    await review.getByText('Visa ending 4242, expires 12/30').waitFor();
    // $100 + $12.99 express; New York taxes 4% of goods and shipping: $4.52.
    await expect(review.locator('.total dd').textContent()).resolves.toBe('$117.51');
    await page.getByLabel('I accept the terms of sale.').check();
    await page.getByRole('button', { name: 'Place order' }).click();
    await page.waitForURL(/\/order\/GG-\d{8}-[2-9A-Z]{6}\/confirmation$/);
    await expect(page.getByRole('heading', { level: 1 }).textContent()).resolves.toBe(
      'Thank you, your order is placed',
    );
    const number = (await page.locator('[data-component="order-number"]').textContent()) ?? '';
    await expect(page.locator('.row.total dd').textContent()).resolves.toBe('$117.51');
    await page.goto(served.url('/dev/mail'));
    await expect(page.getByText(`Order ${number} confirmed`).count()).resolves.toBe(1);

    // Another browser: no access yet, so the order link leads to the lookup form.
    const other = await noJsPage(served);
    await other.goto(served.url(`/order/${number}`));
    await other.waitForURL(/\/order\/lookup\?number=/);
    expect(await other.getByLabel('Order number').inputValue()).toBe(number);
    await other.getByLabel('Email').fill('wrong@example.com');
    await other.getByRole('button', { name: 'Find order' }).click();
    await expect(other.getByRole('alert').textContent()).resolves.toContain("couldn't find");
    await other.getByLabel('Email').fill('ada@example.com');
    await other.getByRole('button', { name: 'Find order' }).click();
    await other.waitForURL(new RegExp(`/order/${number}$`));
    await expect(other.getByRole('heading', { level: 1 }).textContent()).resolves.toContain(number);
  }, 60_000);
});

describe('members without JavaScript', () => {
  it('open an order from their history and cancel it', async () => {
    const grace = await loginAs(test, 'grace@example.com');
    const number = await placeOrder(grace, { qty: 2 });
    const page = await noJsPage(served, grace);
    await page.goto(served.url('/account/orders'));
    await page.getByRole('link', { name: number }).click();
    await page.waitForURL(new RegExp(`/account/orders/${number}$`));
    await page.getByText('Cancel this order').click(); // <details> works without JS
    await page.getByRole('button', { name: `Yes, cancel order ${number}` }).click();
    await page.waitForURL(new RegExp(`/account/orders/${number}$`));
    await expect(page.getByRole('status').first().textContent()).resolves.toContain(
      'refund is on its way',
    );
    await expect(
      page.locator('[data-component="order-status"]').first().textContent(),
    ).resolves.toBe('Cancelled');
  }, 30_000);

  it('review a bought product, vote it helpful and sort reviews', async () => {
    const grace = await loginAs(test, 'grace@example.com');
    await placeOrder(grace, { sku: SKU.lego });
    const page = await noJsPage(served, grace);
    await page.goto(served.url('/p/lego'));
    await page.getByRole('link', { name: 'Write a review' }).click();
    await page.waitForURL(/\/p\/lego\/review$/);
    await page.getByLabel('Your rating').selectOption('4');
    await page.getByLabel('Title').fill('Great set');
    await page.getByLabel('Your review').fill('Sturdy bricks, clear instructions, happy kids.');
    await page.getByRole('button', { name: 'Post review' }).click();
    await page.waitForURL(/\/p\/lego\/reviews\?sort=newest#review-\d+$/);
    expect(await page.getByRole('heading', { name: 'Great set' }).isVisible()).toBe(true);

    const voter = await noJsPage(served, await loginAs(test, 'alan@example.com'));
    await voter.goto(served.url('/p/lego'));
    await voter.getByRole('button', { name: 'Helpful' }).click();
    await voter.waitForURL(/\/p\/lego#review-\d+$/);
    expect(await voter.getByText('1 person found this helpful').isVisible()).toBe(true);
    await voter.goto(served.url('/p/lego/reviews'));
    await voter.getByRole('link', { name: 'Newest' }).click();
    await voter.waitForURL(/\/p\/lego\/reviews\?sort=newest$/);
    expect(await voter.getByRole('heading', { level: 1 }).textContent()).toContain(
      'Reviews of LEGO',
    );
  }, 40_000);
});
