// Placing real orders through the checkout routes, for order-history tests
// (docs/design-docs/0005-testing.md). Uses the exact cart fixture (test/support/cart-fixture.ts).
import { expect } from 'vitest';
import { SKU } from './cart-fixture.js';
import type { TestSession } from './auth.js';

export const TEST_CARD = '4242 4242 4242 4242';

export const ADDRESS = {
  addressId: 'new',
  name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  line2: '',
  city: 'Albany',
  state: 'NY',
  postalCode: '12207',
  phone: '',
} as const;

/** Adds `qty` of `sku`, fills every checkout step, places the order; returns its number. */
export async function placeOrder(
  who: TestSession,
  options: { readonly sku?: string; readonly qty?: number; readonly email?: string } = {},
): Promise<string> {
  const sku = options.sku ?? SKU.lego;
  const add = await who.postForm('/cart/add', { sku, quantity: String(options.qty ?? 1) });
  expect(add.status, 'add to cart').toBe(303);
  for (const [path, fields] of [
    ['/checkout/contact', { email: options.email ?? 'ada@example.com' }],
    ['/checkout/address', ADDRESS],
    ['/checkout/shipping', { method: 'standard' }],
    ['/checkout/payment', { number: TEST_CARD, expiry: '12/30', cvc: '123' }],
  ] as const) {
    expect((await who.postForm(path, fields)).status, path).toBe(303);
  }
  const page = await (await who.get('/checkout')).text();
  const key = /name="key"\s+value="([^"]+)"/.exec(page)?.[1];
  const expectedTotal = /name="expectedTotal"\s+value="(\d+)"/.exec(page)?.[1];
  if (key === undefined || expectedTotal === undefined) throw new Error('no place-order fields');
  const placed = await who.postForm('/checkout/place', { terms: 'on', key, expectedTotal });
  const location = placed.headers.get('location') ?? '';
  const number = /^\/order\/([^/]+)\/confirmation$/.exec(location)?.[1];
  if (placed.status !== 303 || number === undefined) {
    throw new Error(`place order failed: ${String(placed.status)} ${location}`);
  }
  return number;
}
