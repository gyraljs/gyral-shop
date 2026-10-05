// Seeds the shared cart store into every page (Gyral ADR 0013): the header mini-cart, the cart
// page and the buy box all read it during the server render, and the browser restores it
// before hydrating. One instance per request, so carts never leak between visitors.
import type { Context } from 'hono';
import type { StoreInstance } from '@gyral/core';
import type { Db } from '../db/client.js';
import { viewCart, type CartOwner } from '../services/cart.js';
import type { CartView } from '../services/cart-view.js';
import { parseServerCart, type CartClient } from '../ui/cart/model.js';
import { cartStore, seededCart, type CartMsg, type CartState } from '../ui/cart/store.js';
import type { AppEnv } from './security/index.js';
import { now } from './security/runtime.js';

/** The request's cart owner, without creating a session (reads never need one). */
export function cartOwner(c: Context<AppEnv>): CartOwner | undefined {
  const user = c.get('user');
  if (user !== undefined) return { kind: 'member', userId: user.id };
  const session = c.get('session');
  return session === undefined ? undefined : { kind: 'guest', sessionId: session.id };
}

/**
 * The browser's cart model: the server view through the same parser the JSON API's answers go
 * through, so seeded and fetched carts are identical and JSON-safe (no Dates, no extra fields).
 */
export const toCartClient = (view: CartView): CartClient =>
  parseServerCart(JSON.parse(JSON.stringify(view)));

export async function cartStoreFor(
  db: Db,
  c: Context<AppEnv>,
): Promise<StoreInstance<CartState, CartMsg>> {
  const view = await viewCart(db, cartOwner(c), now(c));
  return cartStore.instance(seededCart(toCartClient(view)));
}
