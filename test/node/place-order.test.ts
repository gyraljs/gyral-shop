// Placing an order through the routes (docs/product-specs/checkout.md, payments.md): every test
// card, a changed total, idempotent resubmits, the confirmation email and who may see the
// confirmation page. Concurrency is covered on a file database in place-order-race.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema/accounts.js';
import { variants } from '../../src/db/schema/catalog.js';
import { orders, payments } from '../../src/db/schema/commerce.js';
import { createMailer } from '../../src/services/mail.js';
import { testApp, type TestApp } from '../support/app.js';
import { guest, loginAs, createMember, type TestSession } from '../support/auth.js';
import { stableHtml } from '../support/fixtures.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let visitor: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  visitor = await guest(test);
});

export const CARDS = {
  success: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  insufficient: '4000 0000 0000 9995',
  processing: '4000 0000 0000 0119',
} as const;

const ADDRESS = {
  addressId: 'new',
  name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  line2: '',
  city: 'Albany',
  state: 'NY',
  postalCode: '12207',
  phone: '',
};

/** Fills every step and returns the review page's hidden place-order fields. */
async function toReview(who: TestSession, card: string = CARDS.success, qty = 1) {
  expect((await who.postForm('/cart/add', { sku: SKU.lego, quantity: String(qty) })).status).toBe(
    303,
  );
  for (const [path, fields] of [
    ['/checkout/contact', { email: 'ada@example.com' }],
    ['/checkout/address', ADDRESS],
    ['/checkout/shipping', { method: 'standard' }],
    ['/checkout/payment', { number: card, expiry: '12/30', cvc: '123' }],
  ] as const) {
    expect((await who.postForm(path, fields)).status, path).toBe(303);
  }
  return reviewFields(who);
}

async function reviewFields(who: TestSession) {
  const page = await (await who.get('/checkout')).text();
  const key = /name="key"\s+value="([^"]+)"/.exec(page)?.[1];
  const expectedTotal = /name="expectedTotal"\s+value="(\d+)"/.exec(page)?.[1];
  if (key === undefined || expectedTotal === undefined) throw new Error('no place-order fields');
  return { key, expectedTotal };
}

const place = (who: TestSession, fields: Record<string, string>) =>
  who.postForm('/checkout/place', { terms: 'on', ...fields });

const orderAccess = (res: Response) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith('orders='))
    ?.split(';')[0] ?? '';

/** The flash cookie as sent back by a browser ("flash=…"), and its decoded message. */
const flashCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith('flash='))
    ?.split(';')[0] ?? '';
const flashOf = (res: Response) => decodeURIComponent(flashCookie(res));

const stockOf = async (sku: string) =>
  (await test.db.select({ stock: variants.stock }).from(variants).where(eq(variants.sku, sku)))[0]
    ?.stock;

describe('placing an order', () => {
  it('charges, reserves stock, clears the cart, emails, and shows the confirmation', async () => {
    const before = await stockOf(SKU.lego);
    const res = await place(visitor, await toReview(visitor, CARDS.success, 2));
    expect(res.status).toBe(303);
    const location = res.headers.get('location') ?? '';
    expect(location).toMatch(/^\/order\/GG-20261004-[2-9A-Z]{6}\/confirmation$/);
    expect(await stockOf(SKU.lego)).toBe((before ?? 0) - 2);

    const [order] = await test.db.select().from(orders);
    expect(order).toMatchObject({ status: 'paid', email: 'ada@example.com', totalCents: 10_400 });
    const [payment] = await test.db.select().from(payments);
    expect(payment).toMatchObject({ status: 'succeeded', orderId: order?.id, amountCents: 10_400 });

    const mail = await createMailer(test.db).list();
    expect(mail.map((m) => m.subject)).toEqual([`Order ${order?.number ?? ''} confirmed`]);
    expect(mail[0]?.text).toContain(`http://localhost${location}`);

    const page = await test.get(location, {
      headers: { cookie: `${visitor.cookie}; ${orderAccess(res)}` },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Thank you, your order is placed');
    expect(html).toContain(order?.number ?? 'missing');
    expect(html).toContain('$104.00');
    expect(html).toContain('<meta name="robots" content="noindex"');
    // The cart is gone: the header badge and /cart are empty again.
    expect(await (await visitor.get('/cart')).text()).toContain('Your cart is empty');
  });

  it('answers a repeated submit with the same order, charging and reserving once', async () => {
    const fields = await toReview(visitor);
    const first = await place(visitor, fields);
    const second = await place(visitor, fields);
    expect(second.status).toBe(303);
    expect(second.headers.get('location')).toBe(first.headers.get('location'));
    expect(await test.db.select().from(orders)).toHaveLength(1);
    expect(await test.db.select().from(payments)).toHaveLength(1);
  });

  it('places with JSON for submitForm and answers with the redirect', async () => {
    const fields = await toReview(visitor);
    const res = await test.get('/checkout/place', {
      method: 'POST',
      headers: {
        cookie: visitor.cookie,
        accept: 'application/json',
        'x-csrf-token': visitor.session.csrfToken,
      },
      body: new URLSearchParams({ terms: 'on', ...fields }),
    });
    const body = (await res.json()) as { _tag: string; location: string };
    expect(body._tag).toBe('Redirected');
    expect(body.location).toMatch(/^\/order\/GG-/);
  });

  it('sends a declined card back to the payment step, releasing everything', async () => {
    for (const card of [CARDS.declined, CARDS.insufficient]) {
      const who = await guest(test);
      const before = await stockOf(SKU.lego);
      const res = await place(who, await toReview(who, card));
      expect(res.headers.get('location')).toBe('/checkout?edit=payment');
      expect(flashOf(res)).toMatch(/declined|funds/i);
      expect(await stockOf(SKU.lego)).toBe(before);
      expect(await test.db.select().from(orders)).toHaveLength(0);
      // The declined card is gone: the payment step is open again, showing the message.
      const page = await test.get('/checkout?edit=payment', {
        headers: { cookie: `${who.cookie}; ${flashCookie(res)}` },
      });
      const html = await page.text();
      expect(html).toMatch(/data-step="payment"[^>]*aria-current="step"/);
      expect(html).toMatch(/declined|funds/i);
    }
  });

  it('lets a processing error be retried with the same key', async () => {
    const fields = await toReview(visitor, CARDS.processing);
    const first = await place(visitor, fields);
    expect(first.headers.get('location')).toBe('/checkout?edit=payment');
    expect(await test.db.select().from(orders)).toHaveLength(0);
    const retry = await place(visitor, fields);
    expect(retry.headers.get('location')).toMatch(/^\/order\/GG-/);
  });

  it('refuses a total that changed since review, then charges the new total', async () => {
    const fields = await toReview(visitor);
    await visitor.postForm('/checkout/address', { ...ADDRESS, state: 'CA', city: 'Fresno' });
    await visitor.postForm('/checkout/shipping', { method: 'express' });
    const stale = await place(visitor, fields);
    expect(stale.headers.get('location')).toBe('/checkout?edit=review');
    expect(flashOf(stale)).toContain('Your total changed');
    const fresh = await reviewFields(visitor);
    expect(fresh.key).toBe(fields.key);
    expect(fresh.expectedTotal).not.toBe(fields.expectedTotal);
    const placed = await place(visitor, fresh);
    expect(placed.headers.get('location')).toMatch(/^\/order\/GG-/);
    const [payment] = await test.db.select().from(payments);
    expect(payment?.amountCents).toBe(Number(fresh.expectedTotal));
  });

  it('rejects a key from another checkout', async () => {
    await toReview(visitor);
    const res = await place(visitor, { key: 'pk_forged', expectedTotal: '5000' });
    expect(res.headers.get('location')).toBe('/checkout?edit=review');
    expect(await test.db.select().from(orders)).toHaveLength(0);
  });

  it('validates the terms checkbox with a 422 re-render', async () => {
    const fields = await toReview(visitor);
    const res = await visitor.postForm('/checkout/place', fields);
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('Accept the terms to place your order.');
  });
});

describe('who may see a confirmation', () => {
  it('the placing browser, the member and admins; others are sent to the lookup form', async () => {
    const email = 'grace@example.com';
    await createMember(test, { email, name: 'Grace Hopper', password: 'correct-horse-battery-9' });
    const member = await loginAs(test, email);
    const res = await place(member, await toReview(member));
    const location = res.headers.get('location') ?? '';
    expect((await member.get(location)).status).toBe(200);
    // Unknown and foreign orders answer alike, so numbers can't be probed (orders spec).
    const toLookup = (res: Response) => [res.status, res.headers.get('location')];
    const number = location.split('/')[2] ?? '';
    expect(toLookup(await visitor.get(location))).toEqual([303, `/order/lookup?number=${number}`]);
    expect(toLookup(await test.get(location))).toEqual([303, `/order/lookup?number=${number}`]);
    expect(toLookup(await test.get('/order/GG-20261004-AAAAAA/confirmation'))).toEqual([
      303,
      '/order/lookup?number=GG-20261004-AAAAAA',
    ]);
    const adminEmail = 'boss@example.com';
    await createMember(test, {
      email: adminEmail,
      name: 'Boss',
      password: 'correct-horse-battery-9',
    });
    await test.db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail));
    expect((await (await loginAs(test, adminEmail)).get(location)).status).toBe(200);
    const forged = await test.get(location, {
      headers: { cookie: `orders=${location.split('/')[2] ?? ''}.forged` },
    });
    expect(forged.status).toBe(303);
  });
});

describe('golden markup for the browser tests', () => {
  it('writes the confirmation page', async () => {
    const res = await place(visitor, await toReview(visitor, CARDS.success, 2));
    const location = res.headers.get('location') ?? '';
    const number = location.split('/')[2] ?? '';
    const page = await test.get(location, {
      headers: { cookie: `${visitor.cookie}; ${orderAccess(res)}` },
    });
    // Stable fixture: the random order number and session token are normalized.
    const html = (await page.text())
      .replaceAll(number, 'GG-20261004-FXTURE')
      .replaceAll(visitor.session.csrfToken, 'test-csrf-token');
    await expect(stableHtml(html)).toMatchFileSnapshot('../fixtures/order-confirmation.ssr.html');
  });
});
