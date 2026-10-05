// Admin orders API: list, detail, and status changes through the state machine
// (docs/product-specs/admin.md, "Orders").
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { variants } from '../../src/db/schema/catalog.js';
import { orderEvents, orders, payments } from '../../src/db/schema/commerce.js';
import { outbox } from '../../src/db/schema/system.js';
import { AdminOrderListSchema, AdminOrderSchema } from '../../src/domain/admin.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs, type TestSession } from '../support/auth.js';
import { getJson, signInAdmin } from '../support/admin.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { placeOrder } from '../support/orders.js';

let test: TestApp;
let admin: TestSession;
let customer: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  await createMember(test, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: 'correct-horse-battery-9',
  });
  customer = await loginAs(test, 'grace@example.com');
  admin = await signInAdmin(test);
});

const act = async (number: string, fields: Record<string, string>) => {
  const res = await admin.submitForm(`/api/admin/orders/${number}/transition`, fields);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const order = async (number: string) =>
  v.parse(AdminOrderSchema, (await getJson(admin, `/api/admin/orders/${number}`)).body);
const stockOf = async (sku: string) =>
  (await test.db.select().from(variants).where(eq(variants.sku, sku)))[0]?.stock;
const subjects = async () => (await test.db.select().from(outbox)).map((m) => m.subject);

describe('order list', () => {
  it('filters by status, number or email, and date; admins only', async () => {
    const a = await placeOrder(customer, { sku: SKU.lego });
    const b = await placeOrder(customer, { sku: SKU.lego, email: 'other@example.com' });
    await act(b, { action: 'Fulfil' });
    const list = async (query: string) =>
      v.parse(AdminOrderListSchema, (await getJson(admin, `/api/admin/orders${query}`)).body);
    expect((await list('')).total).toBe(2);
    expect((await list('?status=fulfilled')).rows.map((r) => r.number)).toEqual([b]);
    expect((await list(`?q=${a.slice(-6)}`)).rows.map((r) => r.number)).toEqual([a]);
    expect((await list('?q=other@')).rows.map((r) => r.number)).toEqual([b]);
    expect((await list('?from=2026-10-04&to=2026-10-04')).total).toBe(2);
    expect((await list('?to=2026-10-03')).total).toBe(0);
    expect((await list('')).rows[0]).toMatchObject({ name: 'Ada Lovelace', items: 1 });
    expect((await getJson(admin, '/api/admin/orders?status=bogus')).status).toBe(400);
    expect((await getJson(customer, '/api/admin/orders')).status).toBe(403);
    expect(
      (await customer.submitForm(`/api/admin/orders/${a}/transition`, { action: 'Fulfil' })).status,
    ).toBe(403);
  });
});

describe('order changes', () => {
  it('ships then delivers, emailing on shipment, with a timeline', async () => {
    const number = await placeOrder(customer, { sku: SKU.lego });
    expect((await order(number)).actions).toEqual(['Fulfil', 'Cancel', 'Refund']);
    expect(await act(number, { action: 'Deliver' })).toMatchObject({ status: 409 });
    expect(await act(number, { action: 'Fulfil' })).toEqual({
      status: 200,
      body: { _tag: 'Transitioned', status: 'fulfilled', notice: 'Marked as shipped.' },
    });
    expect(await act(number, { action: 'Fulfil' })).toMatchObject({ status: 409 });
    expect((await act(number, { action: 'Deliver' })).body).toMatchObject({ status: 'delivered' });
    const detail = await order(number);
    expect(detail.events.map((e) => e.status)).toEqual(
      expect.arrayContaining(['fulfilled', 'delivered']),
    );
    expect(detail.actions).toEqual(['Refund']);
    expect(await subjects()).toContain(`Order ${number} has shipped`);
  });

  it('cancels a paid order: stock back, full refund, email; never twice', async () => {
    const number = await placeOrder(customer, { sku: SKU.lego, qty: 2 });
    expect(await stockOf(SKU.lego)).toBe(18);
    const [first, second] = await Promise.all([
      act(number, { action: 'Cancel' }),
      act(number, { action: 'Cancel' }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await stockOf(SKU.lego)).toBe(20);
    const detail = await order(number);
    expect(detail).toMatchObject({ status: 'cancelled', refundableCents: 0 });
    expect(detail.refundedCents).toBe(detail.totals.total);
    expect(await subjects()).toContain(`Order ${number} cancelled`);
  });

  it('refunds partially, then the rest, and refuses more than was paid', async () => {
    const number = await placeOrder(customer, { sku: SKU.lego });
    const total = (await order(number)).totals.total;
    expect(await act(number, { action: 'Refund', amount: '' })).toMatchObject({
      status: 422,
      body: { intent: 'Transition', issues: [{ path: 'amount' }] },
    });
    expect((await act(number, { action: 'Refund', amount: '10.00' })).body).toMatchObject({
      status: 'partially_refunded',
    });
    expect((await order(number)).refundableCents).toBe(total - 1000);
    const over = await act(number, { action: 'Refund', amount: String(total / 100) });
    expect(over).toMatchObject({ status: 422, body: { issues: [{ path: 'amount' }] } });
    const rest = ((total - 1000) / 100).toFixed(2);
    expect((await act(number, { action: 'Refund', amount: rest })).body).toMatchObject({
      status: 'refunded',
    });
    const [row] = await test.db.select().from(orders).where(eq(orders.number, number));
    expect(row).toMatchObject({ status: 'refunded', refundedCents: total });
    expect(await subjects()).toEqual(expect.arrayContaining([`Refund for order ${number}`]));
  });

  it('undoes a refund the payment provider refuses', async () => {
    const number = await placeOrder(customer, { sku: SKU.lego });
    const [row] = await test.db.select().from(orders).where(eq(orders.number, number));
    // The provider believes the payment is already fully refunded, so it refuses.
    await test.db
      .update(payments)
      .set({ refundedCents: row?.totalCents ?? 0 })
      .where(eq(payments.orderId, row?.id ?? 0));
    const res = await act(number, { action: 'Refund', amount: '5.00' });
    expect(res).toMatchObject({ status: 409, body: { error: 'conflict' } });
    const [after] = await test.db.select().from(orders).where(eq(orders.number, number));
    expect(after).toMatchObject({ status: 'paid', refundedCents: 0 });
    const notes = (
      await test.db
        .select()
        .from(orderEvents)
        .where(eq(orderEvents.orderId, row?.id ?? 0))
    ).map((e) => e.note);
    expect(notes).toContain('Refund of $5.00 failed: nothing was refunded');
  });

  it('answers 404 for an unknown order', async () => {
    expect((await getJson(admin, '/api/admin/orders/GG-NOPE')).status).toBe(404);
    expect((await act('GG-NOPE', { action: 'Fulfil' })).status).toBe(404);
  });
});
