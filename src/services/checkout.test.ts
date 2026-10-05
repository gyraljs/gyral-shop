import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '../db/client.js';
import { addresses, checkouts, payments, promoCodes } from '../db/schema.js';
import { insertCartFixture, SKU, T0 } from '../../test/support/cart-fixture.js';
import { addToCart, applyPromoCode, type CartOwner } from './cart.js';
import {
  loadCheckout,
  saveAddress,
  saveContact,
  savePayment,
  saveShipping,
  type CheckoutState,
  type Shopper,
} from './checkout.js';
import { createPaymentProvider } from './payments.js';
import { createSession } from './sessions.js';

let db: Db;
let userId: number;
let guest: Shopper;

const NY = {
  name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  line2: '',
  city: 'Albany',
  state: 'NY',
  postalCode: '12207',
  phone: '',
} as const;

beforeEach(async () => {
  db = await createTestDb();
  ({ userId } = await insertCartFixture(db));
  const session = await createSession(db, { now: T0 });
  guest = { owner: { kind: 'guest', sessionId: session.id } };
});

async function ready(shopper: Shopper): Promise<CheckoutState> {
  const loaded = await loadCheckout(db, shopper, T0);
  if (!loaded.ok) throw new Error(`blocked: ${loaded.error._tag}`);
  return loaded.value;
}

const add = (owner: CartOwner, sku: string, qty: number) => addToCart(db, owner, sku, qty);

describe('guards', () => {
  it('blocks an empty or missing cart and a cart with line issues', async () => {
    expect(await loadCheckout(db, guest, T0)).toMatchObject({ error: { _tag: 'EmptyCart' } });
    await add(guest.owner, SKU.lego, 1);
    expect((await loadCheckout(db, guest, T0)).ok).toBe(true);
    await db.run(`UPDATE variants SET stock = 0 WHERE sku = '${SKU.lego}'`);
    expect(await loadCheckout(db, guest, T0)).toMatchObject({ error: { _tag: 'CartHasIssues' } });
  });
});

describe('pricing', () => {
  it('taxes by the destination state once an address is saved', async () => {
    await add(guest.owner, SKU.lego, 1); // $50, free standard shipping
    expect((await ready(guest)).breakdown).toMatchObject({ taxPending: true });
    const taxFor = async (state: string) => {
      await saveAddress(
        db,
        await ready(guest),
        guest,
        { choice: { address: { ...NY, state: state as 'NY' } }, save: false },
        T0,
      );
      return (await ready(guest)).breakdown.tax.cents;
    };
    expect(await taxFor('NY')).toBe(200); // 4%
    expect(await taxFor('CA')).toBe(363); // 7.25%, rounded half away from zero
    expect(await taxFor('OR')).toBe(0);
  });

  it('judges free shipping on the subtotal after the promo discount', async () => {
    await db.insert(promoCodes).values({ code: 'HALF', kind: 'percent', amount: 5000 });
    await add(guest.owner, SKU.lego, 1); // $50 ≥ $35 → free
    const free = (await ready(guest)).shippingOptions.find((o) => o.method === 'standard');
    expect(free?.price.cents).toBe(0);
    await applyPromoCode(db, guest.owner, 'HALF', T0); // $25 < $35 → $5.99
    const state = await ready(guest);
    expect(state.shippingOptions.find((o) => o.method === 'standard')?.price.cents).toBe(599);
    await saveShipping(db, state, 'express', T0);
    expect((await ready(guest)).breakdown.shipping.cents).toBe(1299);
  });
});

describe('steps', () => {
  it('saves contact, address, shipping and payment, keeping only safe card data', async () => {
    await add(guest.owner, SKU.lego, 2);
    expect(await saveContact(db, await ready(guest), 'ada@example.com', T0)).toMatchObject({
      ok: true,
    });
    expect(
      await saveAddress(
        db,
        await ready(guest),
        guest,
        { choice: { address: { ...NY, postalCode: '122071234' } }, save: true },
        T0,
      ),
    ).toMatchObject({ ok: true });
    await saveShipping(db, await ready(guest), 'standard', T0);
    const provider = createPaymentProvider(db, { now: () => T0 });
    const invalidNumber = await savePayment(
      db,
      await ready(guest),
      { number: '4242 4242 4242 4241', expiry: '12/30', cvc: '123' },
      provider,
      T0,
    );
    expect(invalidNumber).toMatchObject({ ok: false, error: { issues: [{ path: 'number' }] } });
    const saved = await savePayment(
      db,
      await ready(guest),
      { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' },
      provider,
      T0,
    );
    expect(saved.ok).toBe(true);

    const state = await ready(guest);
    expect(state.draft).toMatchObject({
      email: 'ada@example.com',
      address: { postalCode: '12207-1234', state: 'NY' },
      shippingMethod: 'standard',
      card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 },
    });
    // Guests can't save addresses; the full card number is stored nowhere.
    expect(await db.select().from(addresses)).toEqual([]);
    const stored = JSON.stringify([
      await db.select().from(checkouts),
      await db.select().from(payments),
    ]);
    expect(stored).not.toContain('4242424242424242');
    expect(stored).not.toContain('4242 4242');
    // The intent is for the current total.
    const [intent] = await db.select().from(payments);
    expect(intent?.amountCents).toBe(state.breakdown.total.cents);
  });

  it('refuses payment before the address step', async () => {
    await add(guest.owner, SKU.lego, 1);
    const provider = createPaymentProvider(db, { now: () => T0 });
    const result = await savePayment(
      db,
      await ready(guest),
      { number: '4242424242424242', expiry: '12/30', cvc: '123' },
      provider,
      T0,
    );
    expect(result).toMatchObject({ ok: false, error: { issues: [{ path: '' }] } });
  });

  it('gives members their email and saved addresses', async () => {
    const member: Shopper = {
      owner: { kind: 'member', userId },
      member: { id: userId, email: 'ann@example.com' },
    };
    await add(member.owner, SKU.tv, 1);
    expect((await ready(member)).draft.email).toBe('ann@example.com');
    await saveAddress(db, await ready(member), member, { choice: { address: NY }, save: true }, T0);
    const state = await ready(member);
    expect(state.savedAddresses).toMatchObject([{ city: 'Albany', isDefault: true }]);
    const id = state.savedAddresses[0]?.id ?? -1;
    expect(
      await saveAddress(db, state, member, { choice: { savedId: id }, save: false }, T0),
    ).toMatchObject({ ok: true });
    expect(
      await saveAddress(db, state, member, { choice: { savedId: id + 99 }, save: false }, T0),
    ).toMatchObject({
      ok: false,
      error: { issues: [{ path: 'addressId' }] },
    });
  });
});
