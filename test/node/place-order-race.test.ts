// Concurrency for placing orders (checkout spec: "two concurrent places for the last unit →
// one succeeds"). A real file database, so concurrent requests use separate connections as in
// the dev server; the in-memory test database has a single connection.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrateDb, openDb, type Db } from '../../src/db/client.js';
import { variants } from '../../src/db/schema/catalog.js';
import { orders, payments, promoCodes } from '../../src/db/schema/commerce.js';
import { addToCart, applyPromoCode } from '../../src/services/cart.js';
import {
  loadCheckout,
  saveAddress,
  saveContact,
  savePayment,
  saveShipping,
  type Shopper,
} from '../../src/services/checkout.js';
import { createServices, type Services } from '../../src/services/container.js';
import { placeKey, placeOrder } from '../../src/services/orders.js';
import { createSession } from '../../src/services/sessions.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';

let dir: string;
let db: Db;
let services: Services;
const SECRET = 's'.repeat(32);
const ORIGIN = 'http://shop.test';

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'shop-race-'));
  db = await openDb(`file:${join(dir, 'shop.db')}`);
  await migrateDb(db);
  await insertCartFixture(db);
  services = createServices({ db, now: () => T0, secret: SECRET });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ADDRESS = {
  name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  line2: '',
  city: 'Albany',
  state: 'NY',
  postalCode: '12207',
  phone: '',
} as const;

/** A guest with `sku` in the cart and every checkout step saved; returns the place key. */
async function readyGuest(sku: string, promo?: string): Promise<{ shopper: Shopper; key: string }> {
  const session = await createSession(db, { now: T0 });
  const shopper: Shopper = { owner: { kind: 'guest', sessionId: session.id } };
  const added = await addToCart(db, shopper.owner, sku, 1);
  if (!added.ok) throw new Error(`add: ${added.error._tag}`);
  if (promo !== undefined) {
    const applied = await applyPromoCode(db, shopper.owner, promo, T0);
    if (!applied.ok) throw new Error(`promo: ${applied.error._tag}`);
  }
  const state = async () => {
    const loaded = await loadCheckout(db, shopper, T0);
    if (!loaded.ok) throw new Error(`checkout: ${loaded.error._tag}`);
    return loaded.value;
  };
  await saveContact(db, await state(), 'ada@example.com', T0);
  await saveAddress(db, await state(), shopper, { choice: { address: ADDRESS }, save: false }, T0);
  await saveShipping(db, await state(), 'standard', T0);
  const card = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };
  const paid = await savePayment(db, await state(), card, services.payments, T0);
  if (!paid.ok) throw new Error('payment step');
  const ready = await state();
  if (ready.draft.card === undefined) throw new Error('no card');
  return { shopper, key: placeKey(SECRET, ready.cartId, ready.draft.card.paymentRef) };
}

const place = (g: { shopper: Shopper; key: string }) =>
  placeOrder(services, g.shopper, { key: g.key, origin: ORIGIN });

describe('concurrent orders', () => {
  it('sells the last unit once: one order succeeds, the other gets a stock error', async () => {
    const [a, b] = [await readyGuest(SKU.tv), await readyGuest(SKU.tv)];
    await db.update(variants).set({ stock: 1 }).where(eq(variants.sku, SKU.tv));
    const results = await Promise.all([place(a), place(b)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed).toMatchObject({ ok: false, error: { _tag: 'OutOfStock' } });
    expect((await db.select().from(variants).where(eq(variants.sku, SKU.tv)))[0]?.stock).toBe(0);
    expect(await db.select().from(orders)).toHaveLength(1);
    // Only the winner was charged; the loser's intent was never confirmed.
    const statuses = (await db.select().from(payments)).map((p) => p.status).sort();
    expect(statuses).toEqual(['requires_confirmation', 'succeeded']);
  });

  it('never uses a promo code past its limit', async () => {
    await db.insert(promoCodes).values({ code: 'ONCE', kind: 'fixed', amount: 500, usageLimit: 1 });
    const [a, b] = [await readyGuest(SKU.lego, 'ONCE'), await readyGuest(SKU.lego, 'ONCE')];
    const results = await Promise.all([place(a), place(b)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({
      ok: false,
      error: { _tag: 'PromoExhausted', code: 'ONCE' },
    });
    const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, 'ONCE'));
    expect(promo?.usedCount).toBe(1);
  });

  it('answers a concurrent double submit of one checkout with one order', async () => {
    const g = await readyGuest(SKU.lego);
    const before = (await db.select().from(variants).where(eq(variants.sku, SKU.lego)))[0]?.stock;
    const [first, second] = await Promise.all([place(g), place(g)]);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.value.number).toBe(first.value.number);
    expect(await db.select().from(orders)).toHaveLength(1);
    const after = (await db.select().from(variants).where(eq(variants.sku, SKU.lego)))[0]?.stock;
    expect(after).toBe((before ?? 0) - 1);
  });
});
