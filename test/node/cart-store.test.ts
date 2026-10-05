// The shared cart store's rules, run purely (Gyral @gyral/testing stepStore): optimistic
// changes, reconciling answers in order, and recovering from failures.
import { describe, expect, it } from 'vitest';
import { inputsFor, stepStore } from '@gyral/testing';
import { cartApi } from '../../src/ui/cart/api.js';
import { parseServerCart } from '../../src/ui/cart/model.js';
import { cartStore, OFFLINE_MESSAGE, seededCart, type CartState } from '../../src/ui/cart/store.js';
import { serverCart } from '../support/cart-api.js';

const LEGO = { sku: 'LEGO-1', name: 'LEGO', unitCents: 5_000 };
const TV = { sku: 'TV-1', name: 'TV', unitCents: 45_000, listCents: 50_000 };
const cartOf = (lego: number, tv = 0) =>
  parseServerCart(
    serverCart([...(tv > 0 ? [{ ...TV, quantity: tv }] : []), { ...LEGO, quantity: lego }]),
  );
const start: CartState = seededCart(cartOf(3, 2));

describe('cart store', () => {
  it('applies a quantity change at once and sends one request', () => {
    const { state, commands } = stepStore(cartStore, start, {
      _tag: 'SetQuantity',
      sku: 'LEGO-1',
      quantity: 5,
    });
    expect(state.cart?.lines.find((l) => l.sku === 'LEGO-1')?.quantity).toBe(5);
    expect(state.cart?.itemCount).toBe(7);
    expect(state.inFlight).toBe(1);
    expect(inputsFor(commands, cartApi)).toEqual([
      { _tag: 'SetQuantity', sku: 'LEGO-1', quantity: 5 },
    ]);
  });

  it('caps optimistic quantities at what can be bought, and treats 0 as remove', () => {
    const capped = stepStore(cartStore, start, {
      _tag: 'SetQuantity',
      sku: 'LEGO-1',
      quantity: 99,
    });
    expect(capped.state.cart?.lines.find((l) => l.sku === 'LEGO-1')?.quantity).toBe(10);
    const zero = stepStore(cartStore, start, { _tag: 'SetQuantity', sku: 'LEGO-1', quantity: 0 });
    expect(zero.state.cart?.lines.map((l) => l.sku)).toEqual(['TV-1']);
  });

  it('keeps the newest optimistic cart until the last answer arrives', () => {
    let s = stepStore(cartStore, start, { _tag: 'SetQuantity', sku: 'LEGO-1', quantity: 4 }).state;
    s = stepStore(cartStore, s, { _tag: 'SetQuantity', sku: 'LEGO-1', quantity: 5 }).state;
    expect(s.inFlight).toBe(2);
    // The first (older) answer must not flicker the page back to 4.
    s = stepStore(cartStore, s, {
      _tag: 'Answered',
      op: 'update',
      sku: 'LEGO-1',
      answer: { cart: cartOf(4, 2) },
    }).state;
    expect(s.cart?.lines.find((l) => l.sku === 'LEGO-1')?.quantity).toBe(5);
    s = stepStore(cartStore, s, {
      _tag: 'Answered',
      op: 'update',
      sku: 'LEGO-1',
      answer: { cart: cartOf(5, 2) },
    }).state;
    expect(s.inFlight).toBe(0);
    expect(s.cart).toEqual(cartOf(5, 2));
  });

  it('shows errors and success notices, numbered so repeats are announced', () => {
    const sent = stepStore(cartStore, start, { _tag: 'ApplyPromo', code: 'NOPE' }).state;
    const first = stepStore(cartStore, sent, {
      _tag: 'Answered',
      op: 'promo',
      sku: undefined,
      answer: { cart: cartOf(3, 2), error: { _tag: 'PromoRejected', message: 'No such code.' } },
    }).state;
    expect(first.notice).toMatchObject({
      kind: 'error',
      message: 'No such code.',
      op: 'promo',
      id: 1,
    });
    const again = stepStore(
      cartStore,
      { ...first, inFlight: 1 },
      {
        _tag: 'Answered',
        op: 'promo',
        sku: undefined,
        answer: { cart: cartOf(3, 2), error: { _tag: 'PromoRejected', message: 'No such code.' } },
      },
    ).state;
    expect(again.notice?.id).toBe(2);
  });

  it('re-reads the cart when the last answer carries none', () => {
    const sent = stepStore(cartStore, start, { _tag: 'Remove', sku: 'TV-1' }).state;
    const { state, commands } = stepStore(cartStore, sent, {
      _tag: 'Answered',
      op: 'remove',
      sku: 'TV-1',
      answer: { error: { _tag: 'InvalidInput', message: 'Invalid request.' } },
    });
    expect(state.inFlight).toBe(1);
    expect(inputsFor(commands, cartApi)).toEqual([{ _tag: 'Get' }]);
  });

  it('recovers from a failed request once, without looping on a failed re-read', () => {
    const sent = stepStore(cartStore, start, { _tag: 'Remove', sku: 'TV-1' }).state;
    const failed = stepStore(cartStore, sent, { _tag: 'Failed', op: 'remove', sku: 'TV-1' });
    expect(failed.state.notice?.message).toBe(OFFLINE_MESSAGE);
    expect(inputsFor(failed.commands, cartApi)).toEqual([{ _tag: 'Get' }]);
    const reread = stepStore(cartStore, failed.state, {
      _tag: 'Failed',
      op: 'refresh',
      sku: undefined,
    });
    expect(reread.commands).toEqual([]);
    expect(reread.state.inFlight).toBe(0);
  });
});
