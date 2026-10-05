// Admin shell, access control and dashboard (docs/product-specs/admin.md).
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { variants } from '../../src/db/schema/catalog.js';
import { orders } from '../../src/db/schema/commerce.js';
import { analyticsEvents } from '../../src/db/schema/system.js';
import { DashboardSchema } from '../../src/domain/admin.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, loginAs, type TestSession } from '../support/auth.js';
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

describe('admin access', () => {
  it('sends guests to sign in, and answers API calls with 401', async () => {
    const page = await test.get('/admin/products?q=tv');
    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe(
      `/account/login?next=${encodeURIComponent('/admin/products?q=tv')}`,
    );
    const visitor = await guest(test);
    expect((await visitor.get('/api/admin/dashboard')).status).toBe(401);
  });

  it('refuses customers with 403, for pages and for the API', async () => {
    expect((await customer.get('/admin')).status).toBe(403);
    expect((await customer.get('/admin/orders')).status).toBe(403);
    const api = await getJson(customer, '/api/admin/dashboard');
    expect(api).toEqual({ status: 403, body: { error: 'forbidden' } });
  });

  it('serves admins the client-rendered shell for every admin URL', async () => {
    for (const path of ['/admin', '/admin/products', '/admin/orders/GG-1', '/admin/nope']) {
      const res = await admin.get(path);
      expect(res.status, path).toBe(200);
      const body = await res.text();
      expect(body, path).toContain('<shop-admin');
      expect(body, path).toContain('name="robots" content="noindex"');
      expect(body, path).toContain('name="csrf-token"');
      expect(body, path).toContain('The admin needs JavaScript');
    }
    const home = await (await admin.get('/admin')).text();
    expect(home).toMatch(/<title>Dashboard — Admin — /);
    expect(home).toContain('aria-current="page"');
  });
});

describe('dashboard', () => {
  it('reports sales, statuses, low stock, best sellers and consented traffic', async () => {
    const first = await placeOrder(customer, { sku: SKU.lego, qty: 2 });
    const second = await placeOrder(customer, { sku: SKU.lego, qty: 1 });
    // A cancelled order is not a sale.
    await test.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.number, second));
    await test.db.update(variants).set({ stock: 0 }).where(eq(variants.sku, SKU.tv));
    await test.db.insert(analyticsEvents).values([
      { kind: 'page_view', path: '/', createdAt: T0 },
      { kind: 'page_view', path: '/d/toys-games', createdAt: T0 },
      { kind: 'add_to_cart', path: '/cart/add', createdAt: T0 },
      // Older than 30 days: outside every window.
      { kind: 'page_view', path: '/', createdAt: new Date(T0.getTime() - 40 * 86_400_000) },
    ]);

    const { status, body } = await getJson(admin, '/api/admin/dashboard');
    expect(status).toBe(200);
    const d = v.parse(DashboardSchema, body);
    const [placed] = await test.db.select().from(orders).where(eq(orders.number, first));
    expect(d.sales.today).toEqual({ orders: 1, cents: placed?.totalCents });
    expect(d.sales.month).toEqual(d.sales.today);
    expect(d.byStatus).toEqual(
      expect.arrayContaining([
        { status: 'paid', count: 1 },
        { status: 'cancelled', count: 1 },
      ]),
    );
    expect(d.lowStock.map((r) => r.sku)).toContain(SKU.tv);
    expect(d.lowStock.find((r) => r.sku === SKU.tv)?.stock).toBe(0);
    expect(d.lowStock.map((r) => r.sku)).not.toContain(SKU.old); // archived products are hidden
    expect(d.topProducts[0]).toMatchObject({ units: 2 });
    expect(d.pageViews).toEqual({ week: 2, month: 2 });
    expect(d.addToCart).toEqual({ week: 1, month: 1 });
  });

  it('starts empty on a quiet store', async () => {
    const d = v.parse(DashboardSchema, (await getJson(admin, '/api/admin/dashboard')).body);
    expect(d.sales.today).toEqual({ orders: 0, cents: 0 });
    expect(d.byStatus).toEqual([]);
    expect(d.topProducts).toEqual([]);
  });
});
