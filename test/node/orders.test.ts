// Order history, detail, cancellation and guest lookup (docs/product-specs/orders.md).
import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { variants } from '../../src/db/schema/catalog.js';
import { orderEvents, orders, payments } from '../../src/db/schema/commerce.js';
import { createMailer } from '../../src/services/mail.js';
import { ORDERS_PER_PAGE } from '../../src/services/order-history.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, loginAs, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { placeOrder } from '../support/orders.js';

let test: TestApp;
let member: TestSession;

const PASSWORD = 'correct-horse-battery-9';

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  await createMember(test, {
    email: 'grace@example.com',
    name: 'Grace Hopper',
    password: PASSWORD,
  });
  member = await loginAs(test, 'grace@example.com');
});

const stockOf = async (sku: string) =>
  (await test.db.select({ s: variants.stock }).from(variants).where(eq(variants.sku, sku)))[0]?.s;

/** Page text without Lit's comment markers, for matching visible text. */
const visible = async (res: Response) => (await res.text()).replace(/<!--[\s\S]*?-->/g, '');

const flashOf = (res: Response) =>
  decodeURIComponent(res.headers.getSetCookie().find((c) => c.startsWith('flash=')) ?? '');

/** Cookie header carrying the flash the last response set, as a browser would send it. */
const withFlash = (res: Response, who: TestSession) =>
  [
    who.cookie,
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith('flash='))
      ?.split(';')[0],
  ]
    .filter(Boolean)
    .join('; ');

describe('order history', () => {
  it('lists a member’s orders newest first, with status, items and totals', async () => {
    const first = await placeOrder(member, { qty: 2 });
    const second = await placeOrder(member, { sku: SKU.tv });
    const page = await visible(await member.get('/account/orders'));
    expect(page).toContain('<meta name="robots" content="noindex"');
    expect(page.indexOf(second)).toBeLessThan(page.indexOf(first));
    expect(page).toContain('data-region="order-history"');
    expect(page).toMatch(/data-status="paid"/);
    expect(page).toContain('2 orders, newest first.');
  });

  it('shows an empty state, requires login and paginates with a 404 past the end', async () => {
    expect(await visible(await member.get('/account/orders'))).toContain(
      "haven't placed any orders",
    );
    const anon = await test.get('/account/orders');
    expect(anon.status).toBe(303);
    expect(anon.headers.get('location')).toContain('/account/login?next=');
    for (let i = 0; i <= ORDERS_PER_PAGE; i += 1) await placeOrder(member);
    const one = await visible(await member.get('/account/orders'));
    expect(one).toContain('rel="next"');
    const two = await visible(await member.get('/account/orders?page=2'));
    expect(two).toContain('Page 2 of 2');
    expect((await member.get('/account/orders?page=3')).status).toBe(404);
    expect((await member.get('/account/orders?page=1')).status).toBe(301);
  });
});

describe('order detail', () => {
  it('shows lines, totals as charged, address, payment and the timeline to its member only', async () => {
    const number = await placeOrder(member, { qty: 2 });
    const res = await member.get(`/account/orders/${number}`);
    expect(res.status).toBe(200);
    const page = await visible(res);
    expect(page).toContain('data-region="order-timeline"');
    expect(page).toContain('Order placed');
    expect(page).toContain('Payment received');
    expect(page).toContain('1 Analytical Way');
    expect(page).toContain('ending 4242');
    expect(page).toContain('data-component="cancel-form"');
    await createMember(test, { email: 'other@example.com', name: 'Other', password: PASSWORD });
    const other = await loginAs(test, 'other@example.com');
    expect((await other.get(`/account/orders/${number}`)).status).toBe(404);
    expect((await member.get('/account/orders/GG-NOPE')).status).toBe(404);
  });
});

describe('cancelling', () => {
  it('cancels a paid order: stock back, payment refunded, timeline and email, once', async () => {
    const before = await stockOf(SKU.lego);
    const number = await placeOrder(member, { qty: 3 });
    expect(await stockOf(SKU.lego)).toBe((before ?? 0) - 3);
    const res = await member.postForm(`/account/orders/${number}/cancel`);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/account/orders/${number}`);
    expect(flashOf(res)).toContain('refund is on its way');
    expect(await stockOf(SKU.lego)).toBe(before);
    const [order] = await test.db.select().from(orders).where(eq(orders.number, number));
    expect(order?.status).toBe('cancelled');
    expect(order?.refundedCents).toBe(order?.totalCents);
    const [payment] = await test.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, order?.id ?? 0));
    expect(payment?.status).toBe('refunded');
    const notes = (
      await test.db
        .select()
        .from(orderEvents)
        .where(eq(orderEvents.orderId, order?.id ?? 0))
    ).map((e) => e.note);
    expect(notes).toContain('Cancelled at your request');
    expect(notes.some((n) => n?.startsWith('Refunded'))).toBe(true);
    const mail = await createMailer(test.db).list();
    expect(mail.map((m) => m.subject)).toContain(`Order ${number} cancelled`);

    // The page shows the result once, and cancelling twice changes nothing.
    const after = await test.get(`/account/orders/${number}`, {
      headers: { cookie: withFlash(res, member) },
    });
    const html = await visible(after);
    expect(html).toContain('refund is on its way');
    expect(html).not.toContain('data-component="cancel-form"');
    const again = await member.postForm(`/account/orders/${number}/cancel`);
    expect(flashOf(again)).toContain('can');
    expect(await stockOf(SKU.lego)).toBe(before);
  });

  it('refuses fulfilled orders, other members’ orders and posts without CSRF', async () => {
    const number = await placeOrder(member);
    await test.db.update(orders).set({ status: 'fulfilled' }).where(eq(orders.number, number));
    const res = await member.postForm(`/account/orders/${number}/cancel`);
    expect(flashOf(res)).toMatch(/fulfilled|no longer/);
    await createMember(test, { email: 'other@example.com', name: 'Other', password: PASSWORD });
    const other = await loginAs(test, 'other@example.com');
    expect((await other.postForm(`/account/orders/${number}/cancel`)).status).toBe(404);
    const noCsrf = await test.get(`/account/orders/${number}/cancel`, {
      method: 'POST',
      headers: { cookie: member.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    expect(noCsrf.status).toBe(403);
  });
});

describe('guest lookup', () => {
  it('finds an order by number and email (any case) and opens it on this browser', async () => {
    const shopper = await guest(test);
    const number = await placeOrder(shopper, { email: 'guest@example.com' });
    const browser = await guest(test); // a new device: no access cookie
    const blocked = await browser.get(`/order/${number}`);
    expect(blocked.status).toBe(303);
    expect(blocked.headers.get('location')).toBe(`/order/lookup?number=${number}`);
    const form = await (await browser.get(`/order/lookup?number=${number}`)).text();
    expect(form).toContain(`value="${number}"`);
    const found = await browser.postForm('/order/lookup', {
      number: number.toLowerCase(),
      email: 'GUEST@example.com',
    });
    expect(found.status).toBe(303);
    expect(found.headers.get('location')).toBe(`/order/${number}`);
    const access = found.headers
      .getSetCookie()
      .find((c) => c.startsWith('orders='))
      ?.split(';')[0];
    const detail = await test.get(`/order/${number}`, {
      headers: { cookie: [browser.cookie, access].filter(Boolean).join('; ') },
    });
    expect(detail.status).toBe(200);
    const html = await detail.text();
    expect(html).toContain('data-region="order-detail"');
    expect(html).not.toContain('data-component="cancel-form"'); // guests contact support
  });

  it('answers the same for a wrong email and an unknown number, and rate-limits', async () => {
    const shopper = await guest(test);
    const number = await placeOrder(shopper, { email: 'guest@example.com' });
    const browser = await guest(test);
    const wrongEmail = await browser.postForm('/order/lookup', { number, email: 'x@example.com' });
    const unknown = await browser.postForm('/order/lookup', {
      number: 'GG-20261004-ZZZZ',
      email: 'guest@example.com',
    });
    expect(wrongEmail.status).toBe(422);
    expect(unknown.status).toBe(422);
    const message = (html: string) => /role="alert"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1]?.trim();
    expect(message(await wrongEmail.text())).toBe(message(await unknown.text()));
    let last: Response | undefined;
    for (let i = 0; i < 5; i += 1) {
      last = await browser.postForm('/order/lookup', { number, email: 'x@example.com' });
    }
    expect(last?.status).toBe(429);
  });
});

describe('golden markup for the browser tests', () => {
  it('writes the history and detail pages', async () => {
    const number = await placeOrder(member, { qty: 2 });
    const history = await (await member.get('/account/orders')).text();
    const detail = await (await member.get(`/account/orders/${number}`)).text();
    const lookup = await (await test.get(`/order/lookup?number=${number}`)).text();
    // Stable across runs: the order number and CSRF token vary.
    const stable = (html: string) =>
      html
        .replaceAll(number, 'GG-20261004-TEST')
        .replace(/name="_csrf" value="[^"]+"/g, 'name="_csrf" value="token"')
        .replace(/content="[A-Za-z0-9_-]{43}"/g, 'content="token"');
    writeFileSync('test/fixtures/order-history.ssr.html', stable(history));
    writeFileSync('test/fixtures/order-detail.ssr.html', stable(detail));
    writeFileSync('test/fixtures/order-lookup.ssr.html', stable(lookup));
  });
});
