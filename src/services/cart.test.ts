import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { insertCartFixture, SKU, T0 } from '../../test/support/cart-fixture.js';
import { createTestDb, type Db } from '../db/client.js';
import { carts } from '../db/schema/commerce.js';
import { variants } from '../db/schema/catalog.js';
import {
  addToCart,
  applyPromoCode,
  mergeGuestCart,
  removeFromCart,
  removePromoCode,
  setCartQuantity,
  viewCart,
  type CartOwner,
} from './cart.js';
import { createSession } from './sessions.js';

let db: Db;
let userId: number;
let guest: CartOwner & { readonly kind: 'guest' };
let member: CartOwner;

beforeEach(async () => {
  db = await createTestDb();
  ({ userId } = await insertCartFixture(db));
  guest = { kind: 'guest', sessionId: (await createSession(db, { now: T0 })).id };
  member = { kind: 'member', userId };
});

const view = (owner: CartOwner = guest) => viewCart(db, owner, T0);
const quantities = async (owner: CartOwner = guest) =>
  Object.fromEntries((await view(owner)).lines.map((l) => [l.sku, l.quantity]));
const setStock = (sku: string, stock: number) =>
  db.update(variants).set({ stock }).where(eq(variants.sku, sku));

describe('cart operations', () => {
  it('starts empty without creating a cart, then prices lines with sale prices', async () => {
    expect((await view()).lines).toEqual([]);
    expect(await db.select().from(carts)).toEqual([]);

    const added = await addToCart(db, guest, SKU.tv, 1);
    expect(added).toEqual({ ok: true, value: { message: 'Added 1 item of TV to your cart.' } });
    await addToCart(db, guest, SKU.lego, 2);

    const cart = await view();
    expect(cart.itemCount).toBe(3);
    const [tv] = cart.lines;
    expect(tv).toMatchObject({ sku: SKU.tv, unit: { cents: 45000 }, onSale: true, href: '/p/tv' });
    expect(cart.breakdown.subtotal.cents).toBe(45000 + 2 * 5000);
    expect(cart.breakdown.savings.cents).toBe(5000);
    expect(cart.breakdown.shipping.cents).toBe(0); // standard is free over $35
    expect(cart.breakdown.taxPending).toBe(true);
    expect(cart.canCheckout).toBe(true);
  });

  it('adds to an existing line and clamps to stock and the per-line maximum', async () => {
    await addToCart(db, guest, SKU.lego, 4);
    await addToCart(db, guest, SKU.lego, 3);
    expect(await quantities()).toEqual({ [SKU.lego]: 7 });

    const capped = await addToCart(db, guest, SKU.lego, 9);
    expect(capped.ok && capped.value.message).toContain('up to 10 items');
    const limited = await addToCart(db, guest, SKU.tv, 5); // stock 3
    expect(limited.ok && limited.value.message).toContain('up to 3 items');
    expect(await quantities()).toEqual({ [SKU.lego]: 10, [SKU.tv]: 3 });
  });

  it('rejects unknown, archived and out-of-stock items', async () => {
    expect(await addToCart(db, guest, 'NOPE-1', 1)).toMatchObject({
      ok: false,
      error: { _tag: 'UnknownSku' },
    });
    expect(await addToCart(db, guest, SKU.old, 1)).toMatchObject({
      ok: false,
      error: { _tag: 'UnknownSku' },
    });
    expect(await addToCart(db, guest, SKU.apple, 1)).toMatchObject({
      ok: false,
      error: { _tag: 'OutOfStock', name: 'APPLE' },
    });
  });

  it('sets quantities, removes at 0, and reports lines that are not in the cart', async () => {
    await addToCart(db, guest, SKU.lego, 2);
    await setCartQuantity(db, guest, SKU.lego, 5);
    expect(await quantities()).toEqual({ [SKU.lego]: 5 });
    await setCartQuantity(db, guest, SKU.lego, 50);
    expect(await quantities()).toEqual({ [SKU.lego]: 10 });
    expect((await removeFromCart(db, guest, SKU.lego)).ok).toBe(true);
    expect(await quantities()).toEqual({});
    expect(await setCartQuantity(db, guest, SKU.tv, 1)).toMatchObject({
      ok: false,
      error: { _tag: 'NotInCart' },
    });
  });

  it('flags lines whose stock changed and blocks checkout, pricing what can be bought', async () => {
    await addToCart(db, guest, SKU.lego, 5);
    await addToCart(db, guest, SKU.tv, 2);
    await setStock(SKU.lego, 2);
    await setStock(SKU.tv, 0);
    const cart = await view();
    const bySku = Object.fromEntries(cart.lines.map((l) => [l.sku, l]));
    expect(bySku[SKU.lego]?.issue).toEqual({ _tag: 'NotEnoughStock', available: 2 });
    expect(bySku[SKU.tv]?.issue).toEqual({ _tag: 'OutOfStock' });
    expect(bySku[SKU.lego]?.lineTotal.cents).toBe(2 * 5000);
    expect(cart.breakdown.subtotal.cents).toBe(2 * 5000);
    expect(cart.canCheckout).toBe(false);
  });

  it('keeps a member cart by user, across sessions', async () => {
    await addToCart(db, member, SKU.lego, 1);
    expect(await quantities(member)).toEqual({ [SKU.lego]: 1 });
    expect(await quantities(guest)).toEqual({});
  });
});

describe('promo codes', () => {
  it('rejects unknown, inactive and expired codes, and codes on an empty cart', async () => {
    const reject = async (code: string) => {
      const result = await applyPromoCode(db, guest, code, T0);
      return result.ok || result.error._tag !== 'PromoRejected' ? undefined : result.error;
    };
    expect(await reject('nope')).toMatchObject({ _tag: 'PromoRejected', code: 'NOPE' });
    expect(await reject('OFF')).toMatchObject({ message: "OFF isn't a valid promo code." });
    expect(await reject('WELCOME10')).toMatchObject({
      message: 'Add items to your cart before applying a promo code.',
    });
    await addToCart(db, guest, SKU.lego, 1);
    expect((await reject('EXPIRED'))?.message).toMatch(/expired/i);
    expect((await reject('SAVE5'))?.message).toMatch(/\$100/);
    await addToCart(db, guest, SKU.tv, 1);
    await removeFromCart(db, guest, SKU.lego);
    expect((await reject('TOYS20'))?.message).toMatch(/toys/i);
  });

  it('applies a normalized code and explains when it stops applying', async () => {
    await addToCart(db, guest, SKU.lego, 3);
    const applied = await applyPromoCode(db, guest, '  save5 ', T0);
    expect(applied).toEqual({ ok: true, value: { message: 'Promo code SAVE5 applied.' } });
    let cart = await view();
    expect(cart.promo).toEqual({ code: 'SAVE5', applied: true });
    expect(cart.breakdown.discount.cents).toBe(500);

    await setCartQuantity(db, guest, SKU.lego, 1); // $50, below the $100 minimum
    cart = await view();
    expect(cart.promo?.applied).toBe(false);
    expect(cart.promo?.message).toMatch(/\$100/);
    expect(cart.breakdown.discount.cents).toBe(0);

    await removePromoCode(db, guest);
    expect((await view()).promo).toBeUndefined();
  });
});

describe('merging the guest cart on login', () => {
  it('adds quantities capped by stock, keeps the member promo, and deletes the guest cart', async () => {
    await addToCart(db, member, SKU.lego, 8);
    await addToCart(db, member, SKU.tv, 2);
    await addToCart(db, guest, SKU.lego, 4);
    await addToCart(db, guest, SKU.tv, 2);
    await applyPromoCode(db, guest, 'WELCOME10', T0);

    const adjustments = await mergeGuestCart(db, guest.sessionId, userId);
    expect(adjustments).toEqual([
      { sku: SKU.lego, requested: 12, kept: 10 },
      { sku: SKU.tv, requested: 4, kept: 3 },
    ]);
    expect(await quantities(member)).toEqual({ [SKU.lego]: 10, [SKU.tv]: 3 });
    expect((await view(member)).promo?.code).toBe('WELCOME10');
    expect(await db.select().from(carts).where(eq(carts.sessionId, guest.sessionId))).toEqual([]);
  });

  it('turns a guest cart into the member cart when the member has none', async () => {
    await addToCart(db, guest, SKU.lego, 2);
    expect(await mergeGuestCart(db, guest.sessionId, userId)).toEqual([]);
    expect(await quantities(member)).toEqual({ [SKU.lego]: 2 });
  });

  it('does nothing without a guest cart', async () => {
    await addToCart(db, member, SKU.lego, 1);
    expect(await mergeGuestCart(db, guest.sessionId, userId)).toEqual([]);
    expect(await quantities(member)).toEqual({ [SKU.lego]: 1 });
  });
});
