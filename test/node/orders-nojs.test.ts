// Orders without JavaScript (docs/product-specs/orders.md, quality.md): a member sees their
// history, opens an order and cancels it; a guest finds an order with the lookup form.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, loginAs } from '../support/auth.js';
import { insertCartFixture, T0 } from '../support/cart-fixture.js';
import { placeOrder } from '../support/orders.js';
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

describe('orders without JavaScript', () => {
  it('a member opens an order from their history and cancels it', async () => {
    await createMember(test, {
      email: 'grace@example.com',
      name: 'Grace Hopper',
      password: 'correct-horse-battery-9',
    });
    const member = await loginAs(test, 'grace@example.com');
    const number = await placeOrder(member, { qty: 2 });

    const page = await openPage({ javaScript: false });
    await page
      .context()
      .addCookies([{ name: 'sid', value: member.session.id, url: served.url('/') }]);
    await page.goto(served.url('/account/orders'));
    await page.getByRole('link', { name: number }).click();
    await page.waitForURL(new RegExp(`/account/orders/${number}$`));
    await expect(page.getByRole('heading', { level: 1 }).textContent()).resolves.toContain(number);
    await page.getByText('Cancel this order').click(); // <details> works without JS
    await page.getByRole('button', { name: `Yes, cancel order ${number}` }).click();
    await page.waitForURL(new RegExp(`/account/orders/${number}$`));
    await expect(page.getByRole('status').first().textContent()).resolves.toContain(
      'refund is on its way',
    );
    await expect(
      page.locator('[data-component="order-status"]').first().textContent(),
    ).resolves.toBe('Cancelled');
    await page.close();
  }, 20_000);

  it('a guest finds an order with the lookup form', async () => {
    const shopper = await guest(test);
    const number = await placeOrder(shopper, { email: 'guest@example.com' });
    const page = await openPage({ javaScript: false });
    await page.goto(served.url(`/order/${number}`)); // no access yet: sent to lookup
    await page.waitForURL(/\/order\/lookup\?number=/);
    expect(await page.getByLabel('Order number').inputValue()).toBe(number);
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByRole('button', { name: 'Find order' }).click();
    await expect(page.getByRole('alert').textContent()).resolves.toContain("couldn't find");
    await page.getByLabel('Email').fill('guest@example.com');
    await page.getByRole('button', { name: 'Find order' }).click();
    await page.waitForURL(new RegExp(`/order/${number}$`));
    await expect(page.getByRole('heading', { level: 1 }).textContent()).resolves.toContain(number);
    await page.close();
  }, 20_000);
});
