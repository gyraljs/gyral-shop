// The shared cart (Gyral ADR 0013): one store read by the header mini-cart, the cart page and
// the product buy box. The server seeds it into every page; in the browser, writes are
// messages whose commands call the cart JSON API (./api.ts).
//
// Optimistic updates: quantity changes and removals show at once. Requests share one queued
// lane, so answers arrive in order; the server's cart replaces the optimistic one only when
// no request is still in flight, so a stale answer never flickers over a newer change.
import { command, defineStore, type Command, type Next } from '@gyral/core';
import { cartApi, type CartRequest } from './api.js';
import { withQuantity, withoutLine, type ApiAnswer, type CartClient } from './model.js';

/** Which action a notice belongs to, so each component shows only its own. */
export type CartOp = 'add' | 'update' | 'remove' | 'promo' | 'refresh';

export interface CartNotice {
  readonly kind: 'success' | 'error';
  readonly message: string;
  readonly op: CartOp;
  readonly sku?: string;
  /** Increases with every notice, so repeating the same text is announced again. */
  readonly id: number;
}

export interface CartState {
  /** Undefined when the page wasn't seeded (no cart known yet). */
  readonly cart: CartClient | undefined;
  /** Requests sent and not yet answered. */
  readonly inFlight: number;
  readonly notice: CartNotice | undefined;
}

export type CartMsg =
  | { readonly _tag: 'Add'; readonly sku: string; readonly quantity: number }
  | { readonly _tag: 'SetQuantity'; readonly sku: string; readonly quantity: number }
  | { readonly _tag: 'Remove'; readonly sku: string }
  | { readonly _tag: 'ApplyPromo'; readonly code: string }
  | { readonly _tag: 'RemovePromo' }
  | { readonly _tag: 'Refresh' }
  | {
      readonly _tag: 'Answered';
      readonly op: CartOp;
      readonly sku: string | undefined;
      readonly answer: ApiAnswer;
    }
  | { readonly _tag: 'Failed'; readonly op: CartOp; readonly sku: string | undefined }
  | { readonly _tag: 'Dismiss' };

export const emptyCartState: CartState = { cart: undefined, inFlight: 0, notice: undefined };

export const OFFLINE_MESSAGE = "We couldn't reach the store. Your cart may not be up to date.";

const request = (req: CartRequest, op: CartOp, sku?: string): Command<CartMsg> =>
  command(cartApi, req, {
    onSuccess: (answer: ApiAnswer): CartMsg => ({ _tag: 'Answered', op, sku, answer }),
    // The failure's detail stays in the console; customers get one recovery message.
    onFailure: (): CartMsg => ({ _tag: 'Failed', op, sku }),
    key: 'cart-api',
  });

/** Sends a request, applying an optional optimistic change first. */
function sending(
  s: CartState,
  req: CartRequest,
  op: CartOp,
  sku: string | undefined,
  optimistic?: (cart: CartClient) => CartClient,
): Next<CartState, CartMsg> {
  const cart = s.cart === undefined || optimistic === undefined ? s.cart : optimistic(s.cart);
  return [{ ...s, cart, inFlight: s.inFlight + 1 }, [request(req, op, sku)]];
}

const notice = (s: CartState, n: Omit<CartNotice, 'id'>): CartNotice => ({
  ...n,
  id: (s.notice?.id ?? 0) + 1,
});

function answered(
  s: CartState,
  m: Extract<CartMsg, { _tag: 'Answered' }>,
): Next<CartState, CartMsg> {
  const inFlight = Math.max(0, s.inFlight - 1);
  const settled = inFlight === 0;
  const { cart, error, notice: text } = m.answer;
  const next: CartState = {
    cart: settled && cart !== undefined ? cart : s.cart,
    inFlight,
    notice:
      error !== undefined
        ? notice(s, {
            kind: 'error',
            message: error.message,
            op: m.op,
            ...(m.sku === undefined ? {} : { sku: m.sku }),
          })
        : text !== undefined && m.op !== 'refresh'
          ? notice(s, {
              kind: 'success',
              message: text,
              op: m.op,
              ...(m.sku === undefined ? {} : { sku: m.sku }),
            })
          : s.notice,
  };
  // An answer without a cart (e.g. a rejected request) leaves the optimistic view unconfirmed.
  return settled && cart === undefined
    ? [{ ...next, inFlight: 1 }, [request({ _tag: 'Get' }, 'refresh')]]
    : next;
}

export const cartStore = defineStore<CartState, CartMsg>('cart', {
  init: () => emptyCartState,
  update: {
    Add: (s, m) => sending(s, { _tag: 'Add', sku: m.sku, quantity: m.quantity }, 'add', m.sku),
    SetQuantity: (s, m) =>
      sending(s, { _tag: 'SetQuantity', sku: m.sku, quantity: m.quantity }, 'update', m.sku, (c) =>
        withQuantity(c, m.sku, m.quantity),
      ),
    Remove: (s, m) =>
      sending(s, { _tag: 'Remove', sku: m.sku }, 'remove', m.sku, (c) => withoutLine(c, m.sku)),
    ApplyPromo: (s, m) => sending(s, { _tag: 'ApplyPromo', code: m.code }, 'promo', undefined),
    RemovePromo: (s) => sending(s, { _tag: 'RemovePromo' }, 'promo', undefined),
    Refresh: (s) => sending(s, { _tag: 'Get' }, 'refresh', undefined),
    Answered: answered,
    Failed: (s, m) => {
      const inFlight = Math.max(0, s.inFlight - 1);
      const next: CartState = {
        ...s,
        inFlight,
        notice: notice(s, {
          kind: 'error',
          message: OFFLINE_MESSAGE,
          op: m.op,
          ...(m.sku === undefined ? {} : { sku: m.sku }),
        }),
      };
      // Re-read the server's cart once, unless that read is what failed.
      return m.op === 'refresh' || inFlight > 0
        ? next
        : [{ ...next, inFlight: inFlight + 1 }, [request({ _tag: 'Get' }, 'refresh')]];
    },
    Dismiss: (s) => ({ ...s, notice: undefined }),
  },
});

/** The store state the server seeds into a page (no request in flight, no notice). */
export const seededCart = (cart: CartClient): CartState => ({
  cart,
  inFlight: 0,
  notice: undefined,
});
