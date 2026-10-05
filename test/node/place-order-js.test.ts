// Fixtures for the browser test of placing an order with JavaScript
// (test/browser/place-order.test.ts): the review step as the server renders it, and the server's
// real JSON answers to Gyral's submitForm for a paid order and a declined card.
import { beforeEach, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { guest, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { stableHtml } from '../support/fixtures.js';
import { ADDRESS } from '../support/orders.js';

let test: TestApp;
let visitor: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  visitor = await guest(test);
});

async function toReview(card: string) {
  await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '1' });
  for (const [path, fields] of [
    ['/checkout/contact', { email: 'ada@example.com' }],
    ['/checkout/address', ADDRESS],
    ['/checkout/shipping', { method: 'standard' }],
    ['/checkout/payment', { number: card, expiry: '12/30', cvc: '123' }],
  ] as const) {
    expect((await visitor.postForm(path, fields)).status, path).toBe(303);
  }
  const page = await (await visitor.get('/checkout')).text();
  const key = /name="key"\s+value="([^"]+)"/.exec(page)?.[1] ?? '';
  const expectedTotal = /name="expectedTotal"\s+value="(\d+)"/.exec(page)?.[1] ?? '';
  return { page, key, expectedTotal };
}

describe('fixtures for placing an order with JavaScript', () => {
  it('writes the review page and the JSON answers for paid and declined', async () => {
    const paid = await toReview('4242 4242 4242 4242');
    const stable = (s: string) =>
      s
        .replaceAll(visitor.session.csrfToken, 'test-csrf-token')
        .replaceAll(paid.key, 'test-place-key');
    await expect(stableHtml(stable(paid.page))).toMatchFileSnapshot(
      '../fixtures/checkout-review.ssr.html',
    );
    const answer = await visitor.submitForm('/checkout/place', {
      terms: 'on',
      key: paid.key,
      expectedTotal: paid.expectedTotal,
    });
    expect(answer.status).toBe(200);
    const body = (await answer.json()) as { _tag: string; location: string };
    expect(body._tag).toBe('Redirected');
    expect(body.location).toMatch(/^\/order\/GG-[^/]+\/confirmation$/);
    const placed = { ...body, location: '/order/GG-20261004-TEST/confirmation' };
    await expect(`${JSON.stringify(placed, null, 2)}\n`).toMatchFileSnapshot(
      '../fixtures/checkout-placed.json',
    );

    visitor = await guest(test);
    const declined = await toReview('4000 0000 0000 0002');
    const refused = await visitor.submitForm('/checkout/place', {
      terms: 'on',
      key: declined.key,
      expectedTotal: declined.expectedTotal,
    });
    const refusedBody: unknown = await refused.json();
    expect(refused.status).toBe(200);
    await expect(`${JSON.stringify(refusedBody, null, 2)}\n`).toMatchFileSnapshot(
      '../fixtures/checkout-declined.json',
    );
  });
});
